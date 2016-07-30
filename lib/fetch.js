"use strict";

/**
 * Minimal `fetch`, `Headers`, `Request` and `Response` polyfill for nodejs.
 */

var stream = require('stream');
var Fetch = require('node-fetch');
var BufferStream = require('./buffer-stream');

module.exports = {
    fetch: function(url, options) {
        // Convert proto-relative URLs to https.
        if (/^\/\//.test(url)) {
                url = 'https:' + url;
        }
	    return new Fetch(url, options);
    },
    Headers: Fetch.Headers,
    Request: Fetch.Request,
    Response: Fetch.Response,
};
