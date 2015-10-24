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

Cache.prototype.match = function(url) {
    this._entries.forEach(function(entry) {
        if (entry.url === url) {
            return Promise.resolve(entry.item);
        }
    });
    return Promise.reject();
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


