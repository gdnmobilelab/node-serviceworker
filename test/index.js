var ServiceWorkerContainer = require('../lib/');

module.exports = {
    Install: {
        "Basic install & fetch": function() {
            return (new ServiceWorkerContainer())
                .register('https://en.wikipedia.org/test/sw.js', { scope: '/w/iki/' })
                .then(function(registration) {
                    return registration.fetch('https://en.wikipedia.org/w/iki/Foobar');
                })
                .then(function(res) {
                    return res.text();
                })
                .then(function(txt) {
                    if (!/FOOBAR/.test(txt)) {
                        throw new Error('Expected FOOBAR in result HTML!');
                    };
                });
        }
    }
};

