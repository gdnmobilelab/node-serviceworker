"use strict";

/**
 * Minimal `fetch`, `Headers`, `Request` and `Response` polyfill for nodejs.
 */

var stream = require('stream');
var Fetch = require('node-fetch');
var BufferStream = require('./buffer-stream');

if (!global.fetch) {
    global.fetch = function(url, options) {
        if (/^\/\//.test(url)) {
                url = 'https:' + url;
        }
	    return new Fetch(url, options);
    };
}

if (!global.Headers) {
    global.Headers = Fetch.Headers;
}

if (!global.Request) {
    global.Request = Fetch.Request;
}

if (!global.Response) {
    global.Response = function(body, opts) {
        // node-fetch currenly only supports ReadableStream bodies. To make
        // this work, we wrap Buffers or Strings into a BufferStream instance.
        if (body && !body.read) {
            if (!Buffer.isBuffer(body)) {
                body = new Buffer(body);
            }
            body = new BufferStream(body);
        }

        return new Fetch.Response(body, opts);
    };
}
