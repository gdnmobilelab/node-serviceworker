var ServiceWorkerContainer = require('../lib/');

module.exports = {
    Install: {
        "Basic install": function() {
            return (new ServiceWorkerContainer())
                .register('./test/sw.js', { scope: '/' })
                .then(function(registration) {
                    return registration.fetch('https://en.wikipedia.org/w/iki/Foobar');
                })
                .then(function(res) {
                    return res.text();
                })
                .then(function(txt) {
                    if (!/Foobar/.test(txt)) {
                        throw new Error('Expected Foobar in result HTML!');
                    };
                });
        }
    }
};

