'use strict';

var bluebird = require('bluebird');
if (!global.Promise) {
    global.Promise = bluebird;
}
var fs = bluebird.promisifyAll(require('fs'));
var events = require('events');
var util = require('util');

// Set up global.fetch
require('isomorphic-fetch');

var Caches = require('./caches');
global.caches = new Caches();

function Event() {
    this.promise = null;
}
Event.prototype.waitUntil = function(promise) {
    this.promise = promise;
};


function ServiceWorker() {
    this._routes = [];
}
util.inherits(ServiceWorker, events.EventEmitter);

ServiceWorker.prototype.addEventListener = function(name, cb) {
    // Forward to node's EventEmitter.on
    this.on(name, cb);
};

ServiceWorker.prototype.register = function() {
    var self = this;
    var event = new Event();
    this.emit('install', event);
    var ret = event.promise || Promise.resolve();
    return ret.then(function() {
        return {}; // TODO: provide registration object with installing etc
    });
};

function setupModule(src, options) {
    var swModule;
    /* jshint ignore:start */
    swModule = new Function('self', src);
    /* jshint ignore:end */
    var sw = new ServiceWorker();
    // call the module, passing in a ServiceWorker instance.
    swModule(sw);
    sw.install();
}


function installWorker(url, options) {
    options = options || {};
    options.url = url;
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
            return setupModule(src, options);
        });
}

module.exports = new ServiceWorker();
