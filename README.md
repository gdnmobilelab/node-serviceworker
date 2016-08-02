# node-serviceworker
Environment for running serviceworkers in node.js, as 'isomorphic' request handlers for clients without SW support.

## Status

Alpha / experimental. Registers and runs basic ServiceWorker code.

See [this example](test/index.js) for basic usage.

## Features

Based on [this task](https://phabricator.wikimedia.org/T116126).

- Registration to a scope. This introduces a very basic routing scope, but finer-grained routing is normally happening inside the service worker.
- [fetch](https://fetch.spec.whatwg.org), via https://github.com/gwicke/node-fetch
    - Added `ReadableStream` support.
    - This also provides a basic `Response` implementation, wrapping the node HTTP response object.
- `Request` wrapper for Node's [IncomingMessage](https://nodejs.org/api/http.html#http_http_incomingmessage).
- [Cache](http://www.w3.org/TR/service-workers/#cache-objects). On the server, this is useful for in-process caching of frequently-used fragments.
- Accept `ReadableStream` body responses in `FetchEvent.respondWith`

## TODO
- Prevent ServiceWorker code from messing with globals.
- More closely implement
    [WorkerGlobalScope](https://developer.mozilla.org/en-US/docs/Web/API/WorkerGlobalScope).
- Improve registration & SW update interfaces
    - Fetch ServiceWorker code from a URL, or map the URL to a local file.
    - Periodic refresh for remote SWs

