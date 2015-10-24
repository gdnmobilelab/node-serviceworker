'use strict';

var bluebird = require('bluebird');
if (!global.Promise) {
    global.Promise = bluebird;
}
var fs = bluebird.promisifyAll(require('fs'));
var events = require('events');
var util = require('util');

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

function setupModule(source) {
    var swModule;
    /* jshint ignore:start */
    swModule = new Function('self', source);
    /* jshint ignore:end */
    var sw = new ServiceWorker();
    // call the module, passing in a ServiceWorker instance.
    swModule(sw);
    sw.install();
}


function installWorker(url) {
    var sourceReq;
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
