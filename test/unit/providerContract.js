var createContract = require('../../lib/providerContract').create;
var Promise = require('bluebird');

describe('providerContract', function () {
    describe('watching', function () {
        describe('without custom startWatching function', function () {
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
        describe('with a custom startWatching function', function () {
            it('should not emit watching event or distex message until promise returned by startWatching is fulfilled', function (done) {
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
                contract.startWatching = function customStartWatchingFunctionWithArbitraryDelay() {
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
    describe('stopping watching', function () {
        var contract;
        var eventAndPublishSeen;
        var contract;
        var onEventRecieved;
        var onPublishCalled;
        var publishCalled;
        var eventRecieved;

        beforeEach(function (done) {
            publishCalled = new Promise(function (resolve) {
                onPublishCalled = resolve;
            });
            eventRecieved = new Promise(function (resolve) {
                onEventRecieved = resolve;
            });
            eventAndPublishSeen = Promise.all([
                publishCalled,
                eventRecieved
            ]);

            var fakeDistexExchange = {
                publish: function (message) {
                    if (/notWatching$/.test(message)) {
                        onPublishCalled();
                    }
                }
            };
            contract = createContract('123', 'some expression', fakeDistexExchange);
            contract.on('notWatching', function () {
                onEventRecieved();
            })
            contract.on('watching', done);
            contract.handleMessage('watch');
        });

        describe('without custom stopWatching function', function () {
            it('should emit notWatching event and distex message straight away', function (done) {
                eventAndPublishSeen.then(function () {
                    done();
                });

                contract.handleMessage('stopWatching')
            });
        });
        describe('with a custom stopWatching function', function () {
            it('should not emit notWatching event or distex message until promise returned by stopWatching is fulfilled', function (done) {
                var tooSoon = true;
                Promise.any([eventRecieved, publishCalled]).then(function () {
                    tooSoon ? done(new Error('event or message fired before custom stopWatching function has completed')) : done();
                });

                contract.stopWatching = function () {
                    return new Promise(function (resolve) {
                        setTimeout(resolve, 200);
                    }).then(function () {
                        tooSoon = false;
                    });
                };

                contract.handleMessage('stopWatching');
            });
        });
    });
});
