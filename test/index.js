'use strict';

global.Promise = require('bluebird');

var ServiceWorkerContainer = require('../lib/');

module.exports = {
    Install: {
        "Basic install & fetch": function() {
            const testURL = 'https://en.wikipedia.org/w/iki/Foobar';
            const container = new ServiceWorkerContainer();
            return container
                .register('https://en.wikipedia.org/test/sw.js', { scope: '/w/iki/', online: false })
                .then(() => {
                    let iters = 1000;
                    const startTime = Date.now();
                    function bench(i) {
                        // console.log(i);
                        return container.getRegistration(testURL)
                        .then(registration => registration.fetch(testURL))
                        .then(res => res.text())
                        .then(txt => {
                            if (!/FOOBAR/.test(txt)) {
                                throw new Error('Expected FOOBAR in result HTML!');
                            };
                            if (i > 1) {
                                return bench(i - 1);
                            }
                        });
                    }
                    return bench(iters)
                        .then(() => console.log((Date.now() - startTime) / iters,
                                    'ms/iter'));
                });

        },
        "Allows you to manually provide worker source": function() {
            const testJS = "var test = 'hello!';";
            const container = new ServiceWorkerContainer();
            return container
                .register('https://www.example.com', {scope: '/', _source: testJS})
                .then((reg) => {
                    return reg.active._getWorkerSource()
                })
                .then((source) => {
                    if (source !== testJS) {
                        throw new Error("JS doesn't match what was provided")
                    }
                })
        }
    }
};

