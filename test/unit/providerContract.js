var createContract = require('../../lib/providerContract').create;
var Promise = require('bluebird');

describe('providerContract', function () {
    describe('watching', function () {
        describe('without custom beginWatching function', function () {
            it('should emit watching event and distex message straight away', function (done) {
                var onPublishCalled;
                var onEventRecieved;
                var bothSeen = Promise.all([
                    new Promise(function (resolve) {
                        onPublishCalled = resolve;
                    }),
                    new Promise(function (resolve) {
                        onEventRecieved = resolve;
                    })
                ]).then(function () {
                    done();
                });

                var fakeDistexExchange = {
                    publish: function () {
                        onPublishCalled();
                    }
                }
                var contract = createContract('123', 'some expression', fakeDistexExchange);
                contract.on('watching', function () {
                    onEventRecieved();
                })

                contract.handleMessage('watch')
            });
        });
        describe('with a custom beginWatching function', function () {
            it('should not emit watching event or distex message until promise returned by beginWatching is fulfilled', function (done) {
                var tooSoon = true;
                var onPublishCalled;
                var onEventRecieved;
                var bothSeen = Promise.all([
                    new Promise(function (resolve, reject) {
                        onPublishCalled = function () {
                            tooSoon ? reject() : resolve();
                        };
                    }),
                    new Promise(function (resolve, reject) {
                        onEventRecieved = function () {
                            tooSoon ? reject() : resolve();
                        };
                    })
                ]).then(function () {
                    done();
                }).catch(function () {
                    done(new Error('either event or distex message published too soon'))
                });

                var fakeDistexExchange = {
                    publish: onPublishCalled
                }

                var contract = createContract('123', 'some expression', fakeDistexExchange);
                contract.beginWatching = function customBeginWatchingFunctionWithArbitraryDelay() {
                    return new Promise(function (resolve, reject) {
                        setTimeout(resolve, 200);
                    }).then(function () {
                        tooSoon = false;
                    });
                }
                contract.on('watching', onEventRecieved);
                contract.handleMessage('watch')
            });
        });
    });
});
