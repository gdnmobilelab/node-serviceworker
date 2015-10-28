'use strict';

/**
 * Caches polyfill
 */

var url = require('url');


function Cache() {
    this._entries = [];
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

Cache.prototype.put = function(url, item) {
    this._entries.push({
        url: url,
        item: item
    });
};

/**
 * @param {Request} request
 */
Cache.prototype.match = function(request) {
    for (var i = 0; i < this._entries.length; i++) {
        var entry = this._entries[i];
        if (entry.url === request.url) {
            return Promise.resolve(entry.item);
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
