"use strict";

/**
 * Minimal `fetch`, `Headers`, `Request` and `Response` polyfill for nodejs.
 */

const fetch = require('node-fetch-polyfill');
const resolve_url = require('url').resolve;

function wrappedFetch(url, options) {
    // Convert proto-relative URLs to https.
    if (/^\/\//.test(url)) {
        url = 'https:' + url;
    } else if (/^\//.test(url)) {
        console.log(url);
    }
    return fetch(url, options);
}

wrappedFetch.Headers = fetch.Headers;
wrappedFetch.Request = fetch.Request;
wrappedFetch.Response = fetch.Response;
wrappedFetch.subFetch = function(domain) {
    return function(url, options) {
        if (url instanceof fetch.Request) {
            url.url = resolve_url('https://' + domain, url.url);
        } else {
            url = resolve_url('https://' + domain, url);
        }
        return fetch(url, options);
    };
};

module.exports = wrappedFetch;
