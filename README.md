# node-serviceworker
Environment for running serviceworkers in node.js, as 'isomorphic' request handlers for clients without SW support.

## Features and status

Based on [this task](https://phabricator.wikimedia.org/T116126).

- Registration to a scope. This introduces a very basic routing scope, but finer-grained routing is normally happening inside the service worker.
- [fetch](https://fetch.spec.whatwg.org), via https://github.com/gwicke/node-fetch
    - Added `ReadableStream` support.
    - This also provides a basic `Response` implementation, wrapping the node HTTP response object.
- `Request` wrapper for Node's [IncomingMessage](https://nodejs.org/api/http.html#http_http_incomingmessage).
- [Cache](http://www.w3.org/TR/service-workers/#cache-objects). On the server, this is useful for in-process caching of frequently-used fragments.
- Accept `ReadableStream` body responses in `FetchEvent.respondWith`
- IndexedDB, via https://github.com/dumbmatter/fakeIndexedDB
- Runs basic [sw-toolbox](https://github.com/GoogleChrome/sw-toolbox) based
    ServiceWorkers.
- Periodic ServiceWorker code refreshs.
- Per-domain configuration support.

### Demo

A demo service based on
[node-serviceworker-proxy](https://github.com/gwicke/node-serviceworker-proxy) is running at https://swproxy.wmflabs.org/wiki/Foobar. This is
serving a demo [streaming
serviceworker](https://github.com/gwicke/streaming-serviceworker-playground/blob/master/lib/sw.js),
which composes templates and streamed HTML content using
[web-stream-util](https://github.com/wikimedia/web-stream-util) and
[web-html-stream](https://github.com/wikimedia/web-html-stream).

## TODO

- More closely implement
    [WorkerGlobalScope](https://developer.mozilla.org/en-US/docs/Web/API/WorkerGlobalScope). Roughly in order of importance:
    - `console` has a lot more methods in browsers than in node
    - `location`: done
    - `performance` object: Lots missing.
    - `navigator` object: Partly done, but more to do.
