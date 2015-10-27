'use strict';

// Polyfill Promise first, as fetch and other code requires it.
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
 * Just enough functionality to support optional waiting for completion with
 * `.waitUntil()`.
 */
function InstallEvent() {
    this.promise = null;
}
InstallEvent.prototype.waitUntil = function(promise) {
    this.promise = promise;
};

function FetchEvent(request, client) {
    this.request = request;
    this.client = client;
    this.promise = null;
}

/**
 * @param {Response or Promise<Response>} res
 */
FetchEvent.prototype.respondWith = function(res) {
    this.promise = Promise.resolve(res);
};




/**
 * ServiceWorkerRegistration
 *
 * Tracks registration state, and supports unregistering. Returned from
 * ServiceWorkerContainer.register().
 */
function ServiceWorkerRegistration(worker, options, container) {
    this.installing = false;
    this.waiting = false;
    this.active = true;
    this.scope = options.scope;
    this._container = container;
    this._worker = worker;
}
util.inherits(ServiceWorkerContainer, events.EventEmitter);

ServiceWorkerRegistration.prototype.addEventListener = function(name, cb) {
    // Forward to node's EventEmitter.on
    this.on(name, cb);
};

ServiceWorkerRegistration.prototype.unregister = function() {
    return this._container._unregister(this);
};

/**
 * @param {FetchEvent} fetchEvent
 * @return Promise<Response>
 */
ServiceWorkerRegistration.prototype.fetch = function(urlOrFetchEvent) {
    var fetchEvent;
    if (urlOrFetchEvent && urlOrFetchEvent.prototype === FetchEvent) {
        fetchEvent = urlOrFetchEvent;
    } else {
        fetchEvent = new FetchEvent(new Request(urlOrFetchEvent), {});
    }
    this._worker.emit('fetch', fetchEvent);
    return fetchEvent.promise;
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
    var event = new InstallEvent();
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
    .then(function(worker) {
        var registration = new ServiceWorkerRegistration(worker, options, self);
        self.registrations.set(options.scope, registration);
        return registration;
    });
};

ServiceWorkerContainer.prototype._unregister = function(sw) {
    return Promise.resolve(this.registrations.delete(sw.scope));
};

module.exports = ServiceWorkerContainer;
