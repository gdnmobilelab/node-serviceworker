'use strict';

// Polyfill Promise first, as fetch and other code requires it.
const bluebird = require('bluebird');
if (!global.Promise) {
    global.Promise = bluebird;
}
const fs = bluebird.promisifyAll(require('fs'));
const events = require('events');
const util = require('util');
const node_url = require('url');
const path = require('path');
const vm = require('vm');
const webStreams = require('node-web-streams');
const URL = require('dom-urls');
const fakeIndexedDB = require('fake-indexeddb');

const fetch = require('./fetch');

// Set up caches
//
// Would be somewhat cleaner to set these up per ServiceWorkerContainer
// object, but SW code expects this to be a global object.
const caches = require('./caches');

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
        this.active = worker;
        this.scope = options.scope;
        this._container = container;
        this._worker = worker;
        // Update the registration in the worker.
        this._worker._setRegistration(this);
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
        return fetchEvent.promise || this._worker._fetch(fetchEvent.request);
    }

    // Extension over the regular API, to support serving the worker source
    // from node-serviceworker-proxy.
    x_getWorkerSource() {
        return this._worker._src;
    }
}

// Utility functions for EventListener getters / setters.
function getListener(worker, type) {
    const listeners = worker.listeners(type);
    return listeners.length && listeners[0] || null;
}
function setListener(worker, type, handler) {
    worker.removeAllListeners(type);
    return worker.on(type, handler);
}

/**
 * Globals accessible to ServiceWorkers.
 *
 * Approximation of
 * https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope
 **/
class ServiceWorkerGlobalScope {
    constructor(worker) {
        this._worker = worker;
        this.registration = null;
        this.skipWaiting = worker.skipWaiting.bind(worker);
        this.caches = new caches.Caches({origin: worker._domain});
        this.clients = {
            // XXX: Throw? Return null?
            get(id) { return Promise.resolve(); },
            claim() { return Promise.resolve(); },
            matchAll() { return Promise.resolve([]); }
        };
        this.fetch = worker._fetch;

        // WorkerGlobalScope
        this.addEventListener = worker.addListener.bind(worker);
        this.removeEventListener = worker.removeListener.bind(worker);
        this.location = worker._location;
        this.ReadableStream = webStreams.ReadableStream;
        this.Headers = fetch.Headers;
        this.Request = fetch.Request;
        this.Response = fetch.Response;
        this.Cache = caches.Cache;
        this.indexedDB = fakeIndexedDB;
        this.URL = URL;
        // https://developer.mozilla.org/en-US/docs/Web/API/Navigator
        this.navigator = {
            userAgent: 'ServiceWorkerProxy',
            language: 'en-US',
            languages: ['en-US'],
            onLine: true,
            oscpu: 'Linux x86_64 ServiceWorkerProxy',
            hardwareConcurrency: 4,
            serviceWorker: worker._container,
            connection: {
                type: 'ethernet',
                downlinkMax: 10.0,
                onChange: null
            },
            battery: {
                addEventListener() {},
                charging: true,
                chargingTime: 0,
                dischargingTime: Infinity,
                level: 0.99,
                onchargingchange: null,
                onchargingtimechange: null,
                ondischargingtimechange: null,
                onlevelchange: null,
            },
            getBattery() {
                return Promise.resolve(this.battery);
            }
        };
        // TODO: https://developer.mozilla.org/en-US/docs/Web/API/Performance
        // performance: null,
        // Not part of normal JS globals. TODO: Hook up to service logger.
        this.console = console;
        // Use bluebird for performance.
        this.Promise = bluebird;
        // `global` aliases
        this.self = this;
        this.window = this;
    }

    // DOM0 style event handler getters / setters.
    set onactivate(handler) { return setListener(this._worker, 'activate', handler); }
    get onactivate() { return getListener(this._worker, 'activate'); }
    set onfetch(handler) { return setListener(this._worker, 'fetch', handler); }
    get onfetch() { return getListener(this._worker, 'fetch'); }
    set oninstall(handler) { return setListener(this._worker, 'install', handler); }
    get oninstall() { return getListener(this._worker, 'install'); }
    set onmessage(handler) { return setListener(this._worker, 'message', handler); }
    get onmessage() { return getListener(this._worker, 'message'); }
    set onnotificationclick(handler) { return setListener(this._worker, 'notificationclick', handler); }
    get onnotificationclick() { return getListener(this._worker, 'notificationclick'); }
    set onnotificationclose(handler) { return setListener(this._worker, 'notificationclose', handler); }
    get onnotificationclose() { return getListener(this._worker, 'notificationclose'); }
    set onpush(handler) { return setListener(this._worker, 'push', handler); }
    get onpush() { return getListener(this._worker, 'push'); }
    set onpushsubscriptionchange(handler) { return setListener(this._worker, 'pushsubscriptionchange', handler); }
    get onpushsubscriptionchange() { return getListener(this._worker, 'pushsubscriptionchange'); }
    set onsync(handler) { return setListener(this._worker, 'sync', handler); }
    get onsync() { return getListener(this._worker, 'sync'); }
}


/**
 * ServiceWorker
 *
 * Class encapsulating ServiceWorker instantiation and state.
 */
class ServiceWorker extends events.EventEmitter {
    constructor(scriptURL, options) {
        super();
        // https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorker
        this.scriptURL = scriptURL;
        this.state = 'installing';
        this.id = 'shouldBeUUID'; // XXX: set to UUID
        this.onstatechange = null;

        this._options = options || {};
        this._container = options._container;

        const urlParts = node_url.parse(scriptURL);
        // Rewrite URL to local path
        const normalizedPath = path.normalize(urlParts.path);
        this._domain = this._options.origin || urlParts.host;
        this._scriptPath = `./test/${urlParts.host}${normalizedPath}`;


        this._module = null;
        this._src = '';
        this._location = new URL(scriptURL);
        this._fetch = fetch.subFetch(this._domain);
        this._globalScope = new ServiceWorkerGlobalScope(this);
    }

    // Nothing to do here server-side.
    skipWaiting() {}

    postMessage() {}

    _install() {
        return this._getWorkerSource()
        .then(src => {
            // Wrap in self-executing function, so that v8 can JIT the entire
            // module.
            this._src = src;
            this._module = new vm.Script('(function(){"use strict";\n' + src + '})()', {
                filename: this.scriptURL,
                lineOffset: -1,
                displayErrors: true,
                timeout: 5000,
                produceCachedData: true,
            });
            this._module.runInNewContext(this._globalScope);

            // Fire the install event
            var event = new InstallEvent();
            this.emit('install', event);
            return event.promise;
        })
        .then(() => this);
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

    _setRegistration(registration) {
        this.registration = registration;
        this._globalScope.registration = registration;
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
        options._container = this;
        return new ServiceWorker(scriptURL, options)
            ._install()
            .then(worker => {
                var registration = new ServiceWorkerRegistration(worker, options, this);
                const domain = options.origin || node_url.parse(scriptURL).host;
                const reg = this._registrations;
                const domainRegistrations = reg.get(domain)
                    || reg.set(domain, []).get(domain);
                domainRegistrations.push(registration);
                return registration;
            });
    }

    _unregister(sw) {
        const domain = node_url.parse(sw.scriptURL).host;
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
        const urlParts = node_url.parse(url);
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
