'use strict';

/**
 * Caches polyfill
 */


function Cache() {
    this._entries = [];
}


Cache.prototype.addAll = function(urls) {
    throw new Error('Cache.addAll is not yet supported!');
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
