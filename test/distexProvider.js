var EventEmitter = require('events').EventEmitter;
var rabbitPie = require('rabbit-pie');
var distexProvider = require('../lib/distexProvider');
var distexClient = require('../lib/distexClient');
require('chai').should();
var Promise = require('promise');

describe('distex provider', function () {
    var distextExchange;
    var clientQueue;
    var connection;
    var cleanupEmitter = new EventEmitter();
    var messages;
    var observerQueue;

    function disposeAfterTest(thingToDispose) {
        cleanupEmitter.once('cleanup', thingToDispose.dispose.bind(thingToDispose));
    }

    beforeEach(function (done) {
        console.log('in before each');
        messages = [];
        done();
    });

    before(function (done) {
        console.log('in before');
        rabbitPie.connect().then(function (conn) {
            connection = conn;
            return connection.declareExchange('distex');
        }).then(function (exchange) {
            distextExchange = exchange;
            return exchange.createQueue();
        }).then(function (queue) {
            clientQueue = queue;
        }).then(function () {
            return distextExchange.createQueue('observer');
        }).then(function (secondQueue) {
            observerQueue = secondQueue;
            observerQueue.bind('#').then(function () {
                observerQueue.on('message', function (message, headers, deliveryInfo) {
                    messages.push({
                        message: JSON.parse(message),
                        key: deliveryInfo.routingKey
                    });
                });
                done();
            });
        }).catch(done);
    });

    after(function (done) {
        console.log('in after');
        cleanupEmitter.emit('cleanup');
        clientQueue.dispose();
        clientQueue = undefined;
        observerQueue.dispose();
        observerQueue = undefined;
        setTimeout(connection.disconnect.bind(connection), 500);
        connection = undefined;
        setTimeout(done, 500);
    })

    afterEach(function (done) {
        console.log('in afterEach');
        messages.forEach(function (item) {
            console.log(item.key + '\t\t>  ' + JSON.stringify(item.message));
        });
        if (cleanupEmitter) {
            cleanupEmitter.emit('cleanup')
        };
        setTimeout(done, 1000);
    });

    it('should call supplied callback when handlerRequired message is recieved', function (done) {
        distexProvider.create(connection, function canHandle(request) {
            console.log('in canHandle');
            request.expression.should.equal('cron:00 26 12 * * *');
            done();
            console.log('after done');
        }).then(function onDistextProviderInitialised(distexProvider) {
            disposeAfterTest(distexProvider);
            console.log('distex provider initialised, publishing message')
            distextExchange.publish('event.handler.required', {
                expression: 'cron:00 26 12 * * *',
                id: 12345
            });
        }).catch(function (error) {
            console.log('badness', error);
            done(error);
        });
    });

    describe.only('message flow', function () {
        var client;
        beforeEach(function (done) {
            distexClient.create(connection).then(function (distexClient) {
                client = distexClient;
                disposeAfterTest(client);
                done();
            }).catch(done);
        });

        describe('setting up event handler', function () {
            it('should contain the following messages', function (done) {
                distexProvider.create(connection, function canHandle(request) {
                    return Promise.resolve(true);
                }).then(function onDistextProviderInitialised(distexProvider) {
                    client.requestHandler('cron:00 26 12 * * *');
                    disposeAfterTest(distexProvider);

                    setTimeout(function () {
                        messages[0].key.should.equal('event.handler.required');
                        messages[1].key.should.equal('event.handler.available');
                        messages[2].key.should.equal(messages[1].message.handlingToken + '.accept');
                        messages[3].key.should.equal(messages[1].message.handlingToken + '.handling');
                        done();
                    }, 200);
                }).catch(done);
            });
        });

        describe('watching an expression', function () {
            it('should contain the following messages', function (done) {
                distexProvider.create(connection, function canHandle(request) {
                    return Promise.resolve(true);
                }).then(function onDistextProviderInitialised(distexProvider) {
                    disposeAfterTest(distexProvider);
                    var expression = client.requestHandler('cron:00 26 12 * * *');
                    expression.on('status.handled', function () {
                        setTimeout(function () {
                            var numberOfMessagesPreWatch = messages.length;
                            expression.on('status.watching', function () {
                                var watchingMessages = messages.slice(numberOfMessagesPreWatch);
                                watchingMessages[0].key.should.equal(expression.getHandlingToken() + '.watch');
                                watchingMessages[1].key.should.equal(expression.getHandlingToken() + '.watching');
                                done();
                            });
                            expression.watch();

                        }, 100)
                    });
                }).catch(done);
            });
        });
    });

    describe('event.handler.required published', function () {
        var canHandle;
        var provider;
        beforeEach(function initialiseDistexProvider(done) {
            canHandle = undefined;
            distexProvider.create(connection, function canHandleWrapper(request) {
                return canHandle(request)
            }).then(function (distexProvider) {
                disposeAfterTest(distexProvider);
                provider = distexProvider;
                done();
            }).catch(done);
        });

        it('should should publish event.handler.available when supplied callback returns a truthy promise', function (done) {
            canHandle = function () {
                return Promise.resolve(true)
            };

            clientQueue.bind('event.handler.available').then(function () {
                clientQueue.once('message', function confirmReceivedCorrectMessage(message) {
                    message = JSON.parse(message);
                    message.requestId.should.equal(12345);
                    message.handlingToken.should.not.equal(undefined);

                    done();
                });

                distextExchange.publish('event.handler.required', {
                    expression: 'cron:00 26 12 * * *',
                    id: 12345
                });
            });
        });

        describe('and provider has published event.handler.available', function () {
            var handlingToken;
            beforeEach(function (done) {

                canHandle = function () {
                    return Promise.resolve(true)
                };

                clientQueue.bind('event.handler.available').then(function () {
                    clientQueue.once('message', function confirmReceivedCorrectMessage(message) {
                        message = JSON.parse(message);
                        handlingToken = message.handlingToken;

                        done();
                    });

                    distextExchange.publish('event.handler.required', {
                        expression: 'something',
                        id: 12345
                    });
                });
            });

            function fakeClientSendingTokenAccept() {
                distextExchange.publish(handlingToken + '.accept', {
                    handlingToken: handlingToken,
                    expression: 'something'
                });
            }

            it('should acknowledge by sending *.handling where the * is handling token', function (done) {
                clientQueue.topicEmitter.once(handlingToken + '.handling', function (message) {
                    message = JSON.parse(message);
                    done();
                });

                fakeClientSendingTokenAccept();
            });
        });
    });

});
