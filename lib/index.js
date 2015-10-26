'use strict';

var bluebird = require('bluebird');
if (!global.Promise) {
    global.Promise = bluebird;
}
var fs = bluebird.promisifyAll(require('fs'));
var events = require('events');
var util = require('util');

// Set up global.fetch
require('./fetch');

// Set up global caches
//
// Would be somewhat cleaner to set these up per ServiceWorkerContainer
// object, but SW code expects this to be a global object.
var Caches = require('./caches');
global.caches = new Caches();

/**
 * Thin `Event` polyfill. Just enough functionality to support optional
 * waiting for completion with `.waitUntil()`.
 */
function Event() {
    this.promise = null;
}
Event.prototype.waitUntil = function(promise) {
    this.promise = promise;
};



/**
 * ServiceWorkerRegistration
 *
 * Tracks registration state, and supports unregistering. Returned from
 * ServiceWorkerContainer.register().
 */
function ServiceWorkerRegistration(scope, container) {
    this.installing = false;
    this.waiting = false;
    this.active = true;
    this.scope = scope;
    this._container = container;
}
util.inherits(ServiceWorkerContainer, events.EventEmitter);

ServiceWorkerRegistration.prototype.unregister = function() {
    return this._container._unregister(this);
};

ServiceWorkerRegistration.prototype.addEventListener = function(name, cb) {
    // Forward to node's EventEmitter.on
    this.on(name, cb);
};



/**
 * ServiceWorker
 *
 * Class encapsulating ServiceWorker instantiation and state.
 */
function ServiceWorker(scriptURL, options) {
    var self = this;

    // Instance properties
    self.scriptURL = scriptURL;
    self.state = 'activated';
    self.id = 'shouldBeUUID'; // XXX: set to UUID

    // Private
    self._options = options || {};
    self._module = null;

    return this._getWorkerSource(scriptURL)
    .then(function(src) {
        /* jshint ignore:start */
        self._module = new Function('self', src);
        /* jshint ignore: end */
        // call the module, passing in a ServiceWorker instance.
        self._module(self);
        return self._setup();
    })
    .then(function() {
        return self;
    });
}
util.inherits(ServiceWorker, events.EventEmitter);

ServiceWorker.prototype._setup = function() {
    var self = this;
    var event = new Event();
    this.emit('install', event);
    return event.promise || Promise.resolve();
};

ServiceWorker.prototype.addEventListener = function(name, cb) {
    // Forward to node's EventEmitter.on
    this.on(name, cb);
};

ServiceWorker.prototype._getWorkerSource = function(scriptURL, options) {
    if (/^https?:\/\//.test(scriptURL)) {
        return fetch(scriptURL)
            .then(function(res) {
                return res.text();
            });
    } else {
        return fs.readFileAsync(scriptURL, 'utf8');
    }
};


/**
 * ServiceWorkerContainer
 *
 * In the browser, an instance of this is the global navigator.serviceWorker
 * object.
 */
function ServiceWorkerContainer() {
    this.registrations = new Map();
}

ServiceWorkerContainer.prototype.register = function(scriptURL, options) {
    var self = this;
    options = options || {};
    options.scope = options.scope || '/';
    return new ServiceWorker(scriptURL, options)
    .then(function(sw) {
        self.registrations.set(options.scope, {
            sw: sw,
            options: options,
        });
        return new ServiceWorkerRegistration(options.scope);
    });
};

ServiceWorkerContainer.prototype._unregister = function(sw) {
    return Promise.resolve(this.registrations.delete(sw.scope));
};

module.exports = ServiceWorkerContainer;
