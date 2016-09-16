'use strict';

/**
 * Caches polyfill
 */

const URL = require('url');
const fetch = require('node-fetch-polyfill');
const Response = fetch.Response;
const Request = fetch.Request;

class CacheEntry {
    constructor(response, url) {
        this.url = url || response.url;

        this.vary = this._extractVary(response);
        // TODO: Fully consume / buffer the body.
        this.response = response;
    }

    _extractVary(response) {
        const vary = response.headers.get('vary');
        if (vary) {
            return vary.toLowerCase().split(/,/g)
                .map(name => name.trim());
        } else {
            return null;
        }
    }

    /**
     * Does this CacheEntry match a given CacheEntry?
     *
     * @param {CacheEntry} otherEntry
     * @return {boolean}
     */
    matchEntry(otherEntry) {
        const self = this;
        // vary
        if (!this.vary) {
            return true;
        } else {
            return this.vary.every(headerName => self.response.headers.get(headerName)
                === otherEntry.response.headers.get(headerName));
        }
    }

    /**
     * Does this CacheEntry match a given `Request`?
     *
     * @param {Request} request
     * @return {boolean}
     */
    matchRequest(request) {
        const self = this;
        // vary
        if (!this.vary) {
            return true;
        } else {
            return this.vary.every(headerName => self.response.headers.get(headerName)
                === request.headers.get(headerName));
        }
    }
}

class Cache {
    constructor(options) {
        this.options = options || {};
        // Map<string, array<CacheEntry>>
        this._map = new Map();
    }

    addAll(requests) {
        const self = this;

        // Since DOMExceptions are not constructable:
        function NetworkError(message) {
            this.name = 'NetworkError';
            this.code = 19;
            this.message = message;
        }
        NetworkError.prototype = Object.create(Error.prototype);

        return Promise.resolve().then(() => {
            if (arguments.length < 1) { throw new TypeError(); }

            // Simulate sequence<(Request or USVString)> binding:
            const sequence = [];

            requests = requests.map(request => {
                if (request instanceof Request) {
                    return request;
                }
                else {
                    return String(request); // may throw TypeError
                }
            });

            return Promise.all(
                    requests.map(request => {
                        if (typeof request === 'string') {
                            request = new Request(request);
                        }

                        const scheme = URL.parse(request.url).protocol;

                        if (scheme !== 'http:' && scheme !== 'https:') {
                            if (/^\/(?=[^\/])/.test(request.url)) {
                                request.url = 'https://' + this.options.origin + request.url;
                            } else {
                                throw new NetworkError("Invalid scheme");
                            }
                        }

                        return fetch(request.clone());
                    }));
        })
        .then(responses =>
                Promise.all(responses.map(
                        (response, i) => self.put(requests[i], response))))
        .then(() => undefined);
    }

    add(request) {
        return this.addAll([request]);
    }

    put(request, response) {
        const url = request && request.url || request;
        // Buffer the full response
        return response.blob()
        .then(blob => {
            const cacheResponse = new Response(blob, response);
            const entry = new CacheEntry(cacheResponse, url);
            let entries = this._map.get(url) || [];
            if (entries.length) {
                this.delete(request);
                entries = this._map.get(url) || [];
            }
            entries.push(entry);
            this._map.set(url, entries);
        });
    }

    /**
     * @param {Request} request
     */
    match(request) {
        const candidates = this._map.get(request.url);
        if (candidates) {
            for (let i = candidates.length - 1; i >= 0; i--) {
                const item = candidates[i];
                if (item.matchRequest(request)) {
                    // We have a match.
                    return Promise.resolve(item.response.clone());
                }
            }
        }
        // No match.
        return Promise.resolve();
    }

    /**
     * @param {Request} request
     */
    matchAll(request) {
        const candidates = this._map.get(request.url);
        if (candidates) {
            const matches = [];
            for (let i = 0; i < candidates.length; i++) {
                const item = candidates[i];
                if (item.matchRequest(request)) {
                    // We have a match.
                    matches.push(item.response);
                }
            }
            if (matches.length) {
                return Promise.resolve(matches);
            }
        }
        return Promise.resolve();
    }

    delete(request, options) {
        // Replace matching entries. First, find entries that can be
        // replaced.
        let entries = this._map.get(request.url);
        if (!entries) {
            return Promise.resolve(false);
        }
        const entry = new CacheEntry(new Response('', {url: request.url}), request.url);
        const newEntries = entries.filter(oldEntry => !entry.matchEntry(oldEntry));
        if (newEntries.length) {
            this._map.set(request.url, newEntries);
        } else {
            this._map.delete(request.url);
        }
        return Promise.resolve(newEntries.length < entries.length);
    }

    keys() {
        return Promise.resolve(Array.from(this._map.keys()).map(url => new Request(url)));
    }
}

class Caches {
    constructor(options) {
        this._caches = {};
        this._options = options;
        this._origin = options.origin;
    }

    open(name) {
        if (!this._caches[name]) {
            this._caches[name] = new Cache(this._options);
        }
        return Promise.resolve(this._caches[name]);
    }

    delete(name) {
        delete this._caches[name];
        return Promise.resolve();
    }
}

module.exports = {
    Caches: Caches,
    Cache: Cache,
};
