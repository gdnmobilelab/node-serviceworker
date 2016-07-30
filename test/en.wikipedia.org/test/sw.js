"use strict";

const CACHE_NAME = 'my-site-cache-v1';
const tplURL = 'https://en.wikipedia.org/wiki/Test';

self.addEventListener('install', event => {
    //console.log('installing...', event);
    // Perform install steps
    event.waitUntil(
        caches.open(CACHE_NAME)
        .then(cache => fetch(tplURL, {credentials: 'include'})
            .then(res => res.text())
            .then(tplSrc => {
                let tpl = replaceContent(tplSrc, '');
                return cache.put(tplURL, new Response(tpl));
            })));
});

function fetchBody(req, title) {
    return caches.open(CACHE_NAME)
    .then(cache =>
        cache.match(req)
        .then(cacheRes => {
            if (cacheRes) {
                return cacheRes.text();
            } else {
                const protoHost = req.url.match(/^(https?:\/\/[^\/]+)\//)[1];
                return fetch(protoHost + '/api/rest_v1/page/html/' + title)
                    .then(res => res.text())
                    .then(text => {
                        // TODO: Support streaming straight to caches
                        cache.put(req.url, new Response(text));
                        return text;
                    });
            }
        }));
}

function getTemplate() {
    return caches.open(CACHE_NAME)
        .then(function(cache) {
            return cache.match(new Request(tplURL))
                .then(resp => resp.text());
        });
}

function cheapBodyInnerHTML(html) {
    var match = /<body[^>]*>([\s\S]*)<\/body>/.exec(html);
    if (!match) {
        throw new Error('No HTML body found!');
    } else {
        return match[1];
    }
}

function replaceContent(tpl, content) {
    var bodyMatcher = /(<div id="mw-content-text"[^>]*>)[\s\S]*(<div class="printfooter")/im;
    return tpl.replace(bodyMatcher, (all, start, end) => start + content + end);
}

const escapes = {
    '<': '&lt;',
    '"': '&quot;',
    "'": '&#39;'
};

function injectBody(tpl, body, req, title) {
    // Hack hack hack..
    // In a real implementation, this will
    // - identify page components in a template,
    // - evaluate and each component, and
    // - stream expanded template parts / components as soon as they are
    //   available.
    tpl = tpl.replace(/Test/g, title.replace(/[<"']/g, s => escapes[s]));
    // Append parsoid and cite css modules
    tpl = tpl.replace(/modules=([^&]+)&/, 'modules=$1%7Cmediawiki.skinning.content.parsoid%7Cext.cite.style&');
    tpl = tpl.replace(/\/wiki\//g, '/w/iki/');
    return replaceContent(tpl, cheapBodyInnerHTML(body));
}

function assemblePage(req) {
    var title = req.url.match(/\/w\/iki\/([^?]+)$/)[1];
    return Promise.all([getTemplate(), fetchBody(req, title)])
        .then(results => injectBody(results[0], results[1], req, title));
}

self.addEventListener('fetch', event => {
    if (/\/w\/iki\/[^?]+$/.test(event.request.url)) {
        //console.log('fetching', event.request.url);
        return event.respondWith(
            // Ideally, we'd start to stream the header right away here.
            assemblePage(event.request)
            .then(body => new Response(body, {
                headers: {
                    'content-type': 'text/html;charset=utf-8'
                }
            }))
        );
    }
});

