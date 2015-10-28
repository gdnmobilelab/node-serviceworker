'use strict';

/**
 * Caches polyfill
 */

var url = require('url');

function CacheItem(response, url, defaultTTL) {
    this.url = url || response.url;

    // Unless prohibited or otherwise specified in cache-control or
    // defaultTTL, cache items for 10 seconds.
    if (defaultTTL === undefined) {
        defaultTTL = 10;
    }

    this.ttl = this._calcTTL(response, defaultTTL);
    this.goodUntil = Date.now() + this.ttl;
    this.vary = this._extractVary(response);
    this.response = response;
}


CacheItem.prototype._calcTTL = function _calcMaxAge(response, defaultTTL) {
    // Figure out maxAge
    if (response.headers.has('cache-control')) {
        var cc = response.headers.get('cache-control')
            .toLowerCase();
        if (!/no-cache/.test(cc) && !/private/.test(cc)) {
            var maxAgeMatch = /\bmax-age\s*=\s*(\d+)\b/.exec(cc);
            if (maxAgeMatch) {
                return parseInt(maxAgeMatch[1]);
            } else {
                // default to one hour caching
                return defaultTTL || 0;
            }
        } else {
            return 0;
        }
    } else {
        return defaultTTL || 0;
    }
};

CacheItem.prototype._extractVary = function _extractVary(response) {
    var vary = response.headers.get('vary');
    if (vary) {
        return vary.toLowerCase().split(/,/g)
            .map(function(name) {
                return name.trim();
            });
    } else {
        return null;
    }
};

CacheItem.prototype.matchItem = function matchItem(otherItem) {
    var self = this;
    // vary
    if (!this.vary) {
        return true;
    } else {
        return this.vary.every(function(headerName) {
            return self.response.headers.get(headerName)
                === otherItem.response.headers.get(headerName);
        });
    }
};

CacheItem.prototype.matchRequest = function matchRequest(request) {
    var self = this;
    // vary
    if (!this.vary) {
        return true;
    } else {
        return this.vary.every(function(headerName) {
            return self.response.headers.get(headerName)
                === request.headers.get(headerName);
        });
    }
};


function Cache(options) {
    this.options = options || {};
    // Map<string, array<CacheItem>>
    this._entries = new Map();
}


Cache.prototype.addAll = function addAll(requests) {
    var self = this;

    // Since DOMExceptions are not constructable:
    function NetworkError(message) {
        this.name = 'NetworkError';
        this.code = 19;
        this.message = message;
    }
    NetworkError.prototype = Object.create(Error.prototype);

    return Promise.resolve().then(function() {
        if (arguments.length < 1) { throw new TypeError(); }

        // Simulate sequence<(Request or USVString)> binding:
        var sequence = [];

        requests = requests.map(function(request) {
            if (request instanceof Request) {
                return request;
            }
            else {
                return String(request); // may throw TypeError
            }
        });

        return Promise.all(
                requests.map(function(request) {
                    if (typeof request === 'string') {
                        request = new Request(request);
                    }

                    var scheme = url.parse(request.url).protocol;

                    if (scheme !== 'http:' && scheme !== 'https:') {
                        throw new NetworkError("Invalid scheme");
                    }

                    return fetch(request.clone());
                }));
    }).then(function(responses) {
        // TODO: check that requests don't overwrite one another
        // (don't think this is possible to polyfill due to opaque responses)
        return Promise.all(responses.map(function(response, i) {
            return self.put(requests[i], response);
        }));
    }).then(function() {
        return undefined;
    });
};

Cache.prototype.put = function(url, request) {
    var item = new CacheItem(request, url, this.options.defaultTTL);
    if (item.ttl > 0) {
        var items = this._entries.get(url) || [];
        // replace matching items
        items = items.filter(function(oldItem) {
            return ! item.matchItem(oldItem);
        });
        items.push(item);
        this._entries.set(url, items);
    }
};

/**
 * @param {Request} request
 */
Cache.prototype.match = function match(request) {
    return this.matchAll(request)
    .then(function(candidates) {
        if (candidates) {
            return candidates[0];
        }
    });
};

/**
 * @param {Request} request
 */
Cache.prototype.matchAll = function(request) {
    var candidates = this._entries.get(request.url);
    if (candidates) {
        var matches = [];
        var now = Date.now();
        for (var i = 0; i < candidates.length; i++) {
            var item = candidates[i];
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
};

function Caches() {
    this._caches = {};
}

Caches.prototype.open = function(name) {
    if (!this._caches[name]) {
        this._caches[name] = new Cache();
    }
    return Promise.resolve(this._caches[name]);
};

module.exports = Caches;
