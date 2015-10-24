'use strict';

var bluebird = require('bluebird');
if (!global.Promise) {
    global.Promise = bluebird;
}
var fs = bluebird.promisifyAll(require('fs'));
var events = require('events');
var util = require('util');
global.caches = new (require('./caches'));

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

ServiceWorker.prototype.addEventListener = function(name, cb) {
    this.on(name, cb);
};

ServiceWorker.prototype.install = function() {
    var self = this;
    var event = new Event();
    this.emit('install', event);
    if (event.promise) {
        return event.promise
            .then(function() {
                return self;
            });
    } else {
        return Promise.resolve(self);
    }
};

function setupModule(path, src) {
    var swModule;
    /* jshint ignore:start */
    swModule = new Function('self', src);
    /* jshint ignore:end */
    var sw = new ServiceWorker();
    // call the module, passing in a ServiceWorker instance.
    swModule(sw);
    sw.install();
}


function installWorker(path, url) {
    var srcReq;
    if (/^https?:\/\//.test(url)) {
        srcReq = fetch(url)
            .then(function(res) {
                return res.text();
            });
    } else {
        srcReq = fs.readFileAsync(url, 'utf8');
    }
    return srcReq
        .then(function(src) {
            return setupModule(path, src);
        });
}

module.exports = {
    install: installWorker
};
