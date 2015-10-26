"use strict";

/**
 * Minimal 'fetch' standard polyfill for nodejs
 */

var Fetch = require('node-fetch');

if (!global.fetch) {
    global.fetch = function(url, options) {
        if (/^\/\//.test(url)) {
                url = 'https:' + url;
        }
        return Fetch.call(this, url, options);
    };
}

if (!global.Headers) {
    global.Headers = Fetch.Headers;
}
if (!global.Request) {
    global.Request = Fetch.Request;
}
if (!global.Response) {
    global.Response = Fetch.Response;
}
