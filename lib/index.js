'use strict';

// Polyfill Promise first, as fetch and other code requires it.
const bluebird = require('bluebird');
if (!global.Promise) {
    global.Promise = bluebird;
}
const fs = bluebird.promisifyAll(require('fs'));
const events = require('events');
const util = require('util');
const url = require('url');
const path = require('path');
const webStreams = require('node-web-streams');

const fetch = require('./fetch');

// Set up caches
//
// Would be somewhat cleaner to set these up per ServiceWorkerContainer
// object, but SW code expects this to be a global object.
const Caches = require('./caches');

/**
 * Just enough functionality to support optional waiting for completion with
 * `.waitUntil()`.
 */
class InstallEvent {
    constructor() {
        this.promise = null;
    }

    waitUntil(promise) {
        this.promise = promise;
    }
}

class FetchEvent {
    constructor(request, client) {
        this.request = request;
        this.client = client;
        this.promise = null;
    }

    /**
     * @param {Response or Promise<Response>} res
     */
    respondWith(res) {
        this.promise = Promise.resolve(res);
    }
}



/**
 * ServiceWorkerRegistration
 *
 * Tracks registration state, and supports unregistering. Returned from
 * ServiceWorkerContainer.register().
 */
class ServiceWorkerRegistration extends events.EventEmitter {
    constructor(worker, options, container) {
        super();
        this.installing = false;
        this.waiting = false;
        this.active = true;
        this.scope = options.scope;
        this._container = container;
        this._worker = worker;
    }

    addEventListener(name, cb) {
        // Forward to node's EventEmitter.on
        this.on(name, cb);
    }

    unregister() {
        return this._container._unregister(this);
    }

    /**
     * @param {FetchEvent} fetchEvent
     * @return Promise<Response>
     */
    fetch(urlOrFetchEvent) {
        var fetchEvent;
        if (urlOrFetchEvent && urlOrFetchEvent.prototype === FetchEvent) {
            fetchEvent = urlOrFetchEvent;
        } else {
            fetchEvent = new FetchEvent(new fetch.Request(urlOrFetchEvent), {});
        }
        this._worker.emit('fetch', fetchEvent);
        return fetchEvent.promise;
    }
}


/**
 * ServiceWorker
 *
 * Class encapsulating ServiceWorker instantiation and state.
 */
class ServiceWorker extends events.EventEmitter {
    constructor(scriptURL, options) {
        super();
        this.scriptURL = scriptURL;
        this.state = 'activated';
        this.id = 'shouldBeUUID'; // XXX: set to UUID

        this._options = options || {};
        this._module = null;
    }

    _install() {
        return this._getWorkerSource(this.scriptURL)
        .then(src => {
            /* jshint ignore:start */
            this._module = new Function('self',
                    'ReadableStream',
                    'caches',
                    'fetch',
                    'Headers',
                    'Request',
                    'Response',
                    src);
            /* jshint ignore: end */
            // call the module, passing in a ServiceWorker instance.
            const g = ServiceWorker._globals;
            this._module(this,
                    g.ReadableStream,
                    g.caches,
                    g.fetch,
                    g.Headers,
                    g.Request,
                    g.Response);

            // Fire the install event
            var event = new InstallEvent();
            this.emit('install', event);
            return event.promise;
        })
        .then(() => this);
    }

    // Globals accessible in SW code
    static get _globals() {
        return {
            ReadableStream: webStreams.ReadableStream,
            caches: new Caches(),
            fetch: fetch.fetch,
            Headers: fetch.Headers,
            Request: fetch.Request,
            Response: fetch.Response,
        };
    }

    addEventListener(name, cb) {
        // Forward to node's EventEmitter.on
        this.on(name, cb);
    }

    _getWorkerSource(scriptURL, options) {
        if (/^https?:\/\//.test(scriptURL)) {
            return fetch(scriptURL)
                .then(res => res.text());
        } else {
            return fs.readFileAsync(scriptURL, 'utf8');
        }
    }
}


/**
 * ServiceWorkerContainer
 *
 * In the browser, an instance of this is the global navigator.serviceWorker
 * object.
 */
class ServiceWorkerContainer {
    constructor() {
        this.registrations = new Map();
    }

    register(scriptURL, options) {
        options = options || {};
        options.scope = options.scope || '/';
        const urlParts = url.parse(scriptURL);
        // Rewrite URL to local path
        const normalizedPath = path.normalize(urlParts.path);
        const scriptPath = `./test/${urlParts.host}${normalizedPath}`;
        return new ServiceWorker(scriptPath, options)
            ._install()
            .then(worker => {
                var registration = new ServiceWorkerRegistration(worker, options, this);
                this.registrations.set(options.scope, registration);
                return registration;
            });
    }

    _unregister(sw) {
        return Promise.resolve(this.registrations.delete(sw.scope));
    }

    getRegistration(url) { }
}

module.exports = ServiceWorkerContainer;
