'use strict';

var bluebird = require('bluebird');
if (!global.Promise) {
    global.Promise = bluebird;
}
var fs = bluebird.promisifyAll(require('fs'));
var events = require('events');

require('isomorphic-fetch');

function Event() {
    this.promise = null;
}
Event.prototype.waitUntil = function(promise) {
    this.promise = promise;
};


function ServiceWorker() {
}
util.inherits(ServiceWorker, events.EventEmitter);

ServiceWorker.prototype.install = function() {
    var event = new Event();
    this.emit('install', event);
    if (event.promise) {
        return event.promise;
    } else {
        return Promise.resolve();
    }
};

function setupModule(source) {
    var mod = new Function('self', source);
    var sw = new ServiceWorker();
    // call the module, passing in a ServiceWorker instance.
    mod(sw);
}


function installWorker(url)
    var source;
    if (/^https?:\/\//.test(url)) {
        sourceReq = fetch(url)
            .then(function(res) {
                return res.text();
            });
    } else {
        sourceReq = fs.readFileAsync(url, 'utf8');
    }
    return sourceReq
        .then(setupModule);
}

module.exports = {
    install: installWorker
};
