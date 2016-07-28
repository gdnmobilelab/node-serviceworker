# node-serviceworker
Environment for running serviceworkers in node.js, as 'isomorphic' request handlers for clients without SW support.

## Requirements

Based on [this task](https://phabricator.wikimedia.org/T116126).

- Registration to a scope. This introduces a very basic routing scope, but most finer-grained routing is likely to happen inside the service worker.
- [fetch](https://fetch.spec.whatwg.org), via https://github.com/matthew-andrews/isomorphic-fetch
  - This also provides a basic `Response` implementation, wrapping the node HTTP response object.
- `Request` wrapper for Node's [IncomingMessage](https://nodejs.org/api/http.html#http_http_incomingmessage).
- [Cache](http://www.w3.org/TR/service-workers/#cache-objects). On the server, we might want to use this for in-process caching of frequently-used fragments.

## TODO

- Accept `ReadableStream` body responses in `FetchEvent.respondWith` (adapt to
    node stream?)
- Add `ReadableStream` support in
    [node-fetch](https://github.com/bitinn/node-fetch):
    - Return a `ReadableStream` response body.
    - Accept a `ReadableStream` request body (lower prio).
