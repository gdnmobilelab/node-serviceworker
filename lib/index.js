'use strict';

// Polyfill Promise first, as fetch and other code requires it.
const bluebird = require('bluebird');
if (!global.Promise) {
    global.Promise = bluebird;
}
const fs = bluebird.promisifyAll(require('fs'));
const events = require('events');
const util = require('util');
const URL = require('url');
const path = require('path');
const vm = require('vm');
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
    fetch(urlOrFetchEvent, options) {
        var fetchEvent;
        if (urlOrFetchEvent && urlOrFetchEvent.prototype === FetchEvent) {
            fetchEvent = urlOrFetchEvent;
        } else {
            fetchEvent = new FetchEvent(new fetch.Request(urlOrFetchEvent, options), {});
        }
        this._worker.emit('fetch', fetchEvent);
        return fetchEvent.promise;
    }
}

// TODO: Make these per-domain.
const globalCaches = new Caches();


/**
 * ServiceWorker
 *
 * Class encapsulating ServiceWorker instantiation and state.
 */
class ServiceWorker extends events.EventEmitter {
    constructor(scriptURL, options) {
        super();
        this.scriptURL = scriptURL;
        this._options = options || {};

        const urlParts = URL.parse(scriptURL);
        // Rewrite URL to local path
        const normalizedPath = path.normalize(urlParts.path);
        this._scriptPath = `./test/${urlParts.host}${normalizedPath}`;

        this.state = 'activated';
        this.id = 'shouldBeUUID'; // XXX: set to UUID

        this._module = null;

        // Support clients.matchAll / activate handler as in
        // https://serviceworke.rs/immediate-claim_service-worker_doc.html
        // https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/skipWaiting
        this.clients = {
            claim: function() {}
        };
    }

    // Nothing to do here server-side.
    skipWaiting() {}

    _install() {
        return this._getWorkerSource()
        .then(src => {
            // Wrap in self-executing function, so that v8 can JIT the entire
            // module.
            this._module = new vm.Script('(function(){"use strict";\n' + src + '})()', {
                filename: this.scriptURL,
                lineOffset: -1,
                displayErrors: true,
                timeout: 5000,
                produceCachedData: true,
            });
            this._module.runInNewContext(this._globals());

            // Fire the install event
            var event = new InstallEvent();
            this.emit('install', event);
            return event.promise;
        })
        .then(() => this);
    }

    // Globals accessible in SW code
    _globals() {
        return {
            ReadableStream: webStreams.ReadableStream,
            caches: globalCaches,
            fetch: fetch,
            Headers: fetch.Headers,
            Request: fetch.Request,
            Response: fetch.Response,
            self: this,
            // Not part of normal JS globals. TODO: Hook up to logger.
            console: console,
            // Use bluebird for performance.
            Promise: bluebird,
        };
    }

    addEventListener(name, cb) {
        // Forward to node's EventEmitter.on
        this.on(name, cb);
    }

    _getWorkerSource(options) {
        if (this._options.online && /^https?:\/\//.test(this.scriptURL)) {
            return fetch(this.scriptURL)
                .then(res => res.text());
        } else {
            return fs.readFileAsync(this._scriptPath, 'utf8');
        }
    }
}


/**
 * ServiceWorkerContainer
 *
 * In the browser, an instance of this is the global navigator.serviceWorker
 * object.
 * See
 * https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer.
 */
class ServiceWorkerContainer {
    constructor() {
        this._registrations = new Map();
    }

    register(scriptURL, options) {
        options = options || {};
        options.scriptURL = scriptURL;
        options.scope = options.scope || '/';
        return new ServiceWorker(scriptURL, options)
            ._install()
            .then(worker => {
                var registration = new ServiceWorkerRegistration(worker, options, this);
                const domain = URL.parse(scriptURL).host;
                const reg = this._registrations;
                const domainRegistrations = reg.get(domain)
                    || reg.set(domain, []).get(domain);
                domainRegistrations.push(registration);
                return registration;
            });
    }

    _unregister(sw) {
        const domain = URL.parse(sw.scriptURL).host;
        const domainRegistrations = this._registrations.get(domain);
        if (!domainRegistrations) { return; }
        this._registrations.set(domainRegistrations
                .filter(reg => reg._worker === sw));
    }

    /**
     * Look up the first matching registration for a URL.
     * @param {string} url
     * @return {Promise<undefined|ServiceWorkerRegistration>}
     */
    getRegistration(url) {
        const urlParts = URL.parse(url);
        const urlPath = urlParts.path;
        const domainRegistrations = this._registrations.get(urlParts.host);
        if (domainRegistrations) {
            for (let i = 0; i < domainRegistrations.length; i++) {
                const reg = domainRegistrations[i];
                if (urlPath.slice(0, reg.scope.length) === reg.scope) {
                    return Promise.resolve(reg);
                }
            }
        }
        // Nothing found.
        return Promise.resolve();
    }

    getRegistrations() {
        return Array.from(this._registrations.values());
    }

    /**
     * Extension: Unregister all registrations for a domain.
     *
     * @param {string} domain
     * @return undefined
     */
    x_clearDomain(domain) {
        this._registrations.delete(domain);
    }
}

module.exports = ServiceWorkerContainer;
