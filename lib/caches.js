'use strict';

/**
 * Caches polyfill
 */

const URL = require('url');
const fetch = require('node-fetch-polyfill');
const Response = fetch.Response;
const Request = fetch.Request;

class CacheEntry {
    constructor(response, url, defaultTTL) {
        this.url = url || response.url;

        // Unless prohibited or otherwise specified in cache-control or
        // defaultTTL, cache entries for 24 hours.
        if (defaultTTL === undefined) {
            defaultTTL = 86400;
        }

        this.ttl = this._calcTTL(response, defaultTTL);
        this.goodUntil = Date.now() + this.ttl * 1000;
        this.vary = this._extractVary(response);
        // TODO: Fully consume / buffer the body.
        this.response = response;
    }

    _calcTTL(response, defaultTTL) {
        // Figure out maxAge
        if (response.headers.has('cache-control')) {
            const cc = response.headers.get('cache-control')
                .toLowerCase();
            if (!/no-cache/.test(cc) && !/private/.test(cc)) {
                const maxAgeMatch = /\bmax-age\s*=\s*(\d+)\b/.exec(cc);
                if (maxAgeMatch) {
                    // Enforce a minimum cache period of 1s
                    // TODO: revisit.
                    return Math.max(1, parseInt(maxAgeMatch[1]));
                } else {
                    // default to one hour caching
                    return defaultTTL || 0;
                }
            } else {
                return 100;
            }
        } else {
            return defaultTTL || 0;
        }
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

    put(url, response) {
        // Buffer the full response
        return response.blob()
        .then(blob => {
            const cacheResponse = new Response(blob, response);
            const entry = new CacheEntry(cacheResponse, url, this.options.defaultTTL);
            if (entry.ttl > 0) {
                let entries = this._map.get(url);
                if (!entries) {
                    entries = [];
                    this._map.set(url, entries);
                }

                const now = Date.now();

                // Replace matching or outdated entries
                // First, find entries that can be replaced.
                const toReplace = [];
                for (let i = 0; i < entries.length; i++) {
                    const oldEntry = entries[i];
                    if (entry.matchEntry(oldEntry) || oldEntry.goodUntil < now) {
                        // Remove matching / outdated entries
                        toReplace.push(i);
                    }
                }
                // Rebuild the array once, and only if any entries need to be
                // replaced.
                let replaceCount = toReplace.length;
                if (replaceCount) {
                    const newEntries = new Array(entries.length - replaceCount + 1);
                    let nextReplacementIndex = toReplace[replaceCount - 1];
                    for (let i = entries.length; i >= 0; i--) {
                        if (i === nextReplacementIndex) {
                            replaceCount--;
                            nextReplacementIndex = toReplace[replaceCount - 1];
                        } else {
                            newEntries[i - replaceCount] = entries[i];
                        }
                    }
                    newEntries[newEntries.length] = entry;
                    entries = newEntries;
                } else {
                    // Otherwise, just push a new entry.
                    entries.push(entry);
                }
            }
        });
    }

    /**
     * @param {Request} request
     */
    match(request) {
        const candidates = this._map.get(request.url);
        if (candidates) {
            const now = Date.now();
            for (let i = candidates.length - 1; i >= 0; i--) {
                const item = candidates[i];
                if (item.matchRequest(request)) {
                    if (item.goodUntil > now) {
                        // Still valid. We have a match.
                        return Promise.resolve(item.response.clone());
                    } else {
                        // Remove expired entries
                        candidates.splice(i, 1);
                        i--;
                    }
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
            const now = Date.now();
            for (let i = 0; i < candidates.length; i++) {
                const item = candidates[i];
                if (item.matchRequest(request)) {
                    if (item.goodUntil > now) {
                        // Still valid. We have a match.
                        matches.push(item.response);
                    } else {
                        // Remove expired entries
                        candidates.splice(i, 1);
                        i--;
                    }
                }
            }
            if (matches.length) {
                return Promise.resolve(matches);
            }
        }
        return Promise.resolve();
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
}

module.exports = {
    Caches: Caches,
    Cache: Cache,
};
