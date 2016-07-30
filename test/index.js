var ServiceWorkerContainer = require('../lib/');

module.exports = {
    Install: {
        "Basic install & fetch": function() {
            const testURL = 'https://en.wikipedia.org/w/iki/Foobar';
            const container = new ServiceWorkerContainer();
            return container
                .register('https://en.wikipedia.org/test/sw.js', { scope: '/w/iki/' })
                .then(() => container.getRegistration(testURL))
                .then(registration => registration.fetch(testURL))
                .then(res => res.text())
                .then(txt => {
                    if (!/FOOBAR/.test(txt)) {
                        throw new Error('Expected FOOBAR in result HTML!');
                    };
                });
        }
    }
};

