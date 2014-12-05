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
        setTimeout(done, 100);
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

    describe('message flow', function () {
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
                    var contract = client.requestHandler('cron:00 26 12 * * *');
                    disposeAfterTest(distexProvider);
                    contract.once('status.handled', setTimeout.bind(null, function () {

                        console.log('contract handled asserting against captured message flow');
                        messages[0].key.should.equal('event.handler.required');
                        messages[1].key.should.equal('event.handler.available');
                        messages[2].key.should.equal(messages[1].message.handlingToken + '.accept');
                        messages[3].key.should.equal(messages[1].message.handlingToken + '.handling');
                        done();
                    }), 50);
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
                    expression.once('status.handled', function () {
                        setTimeout(function () {
                            var numberOfMessagesPreWatch = messages.length;
                            expression.once('status.watching', function () {
                                setTimeout(function () {
                                    var watchingMessages = messages.slice(numberOfMessagesPreWatch);
                                    watchingMessages[0].key.should.equal(expression.getHandlingToken() + '.watch');
                                    watchingMessages[1].key.should.equal(expression.getHandlingToken() + '.watching');
                                    done();
                                }, 500)
                            });
                            expression.watch();

                        }, 500)
                    });
                }).catch(done);
            });
        });

        describe('unwatching an expression', function () {
            it('should contain the following messages', function (done) {
                distexProvider.create(connection, function canHandle(request) {
                    return Promise.resolve(true);
                }).then(function onDistextProviderInitialised(distexProvider) {
                    disposeAfterTest(distexProvider);
                    var expression = client.requestHandler('cron:00 26 12 * * *');
                    expression.once('status.handled', function () {
                        setTimeout(function () {
                            expression.once('status.watching', function () {
                                setTimeout(function () {
                                    var numberOfMessagesAfterWatching = messages.length;
                                    expression.once('status.notWatching', function () {
                                        setTimeout(function () {
                                            var unwatchingMessages = messages.slice(numberOfMessagesAfterWatching);
                                            console.log(unwatchingMessages);
                                            unwatchingMessages[0].key.should.equal(expression.getHandlingToken() + '.stopWatching');
                                            unwatchingMessages[1].key.should.equal(expression.getHandlingToken() + '.notWatching');
                                            done();
                                        }, 200);
                                    });
                                    expression.stopWatching();
                                }, 200);

                            });
                            expression.watch();

                        }, 200)
                    });
                }).catch(done);
            });
        });

        describe('Emitting events from the provider to client while watching', function () {
            it('should emit events on the client contract when pushed in from the provider', function (done) {
                distexProvider.create(connection, function canHandle(request) {
                    return Promise.resolve(true);
                }).then(function onDistextProviderInitialised(distexProvider) {
                    disposeAfterTest(distexProvider);
                    var providerContract;
                    distexProvider.once('contract accepted', function (contract) {
                        providerContract = contract;
                    });

                    var clientContract = client.requestHandler('cron:00 26 12 * * *');
                    clientContract.once('status.handled', function () {
                        clientContract.once('status.watching', function () {
                            console.log('recieved acknowledgement that contract is watching')
                            var eventToSend = {
                                foo: 'bar'
                            };

                            clientContract.once('event.recieved', function (eventBody) {
                                console.log('recieved event');
                                eventBody.should.deep.equal(eventToSend);
                                done();
                            });

                            console.log('sent event')
                            providerContract.pushEvent(eventToSend);
                        });

                        clientContract.watch();
                    });
                }).catch(done);
            });
        });
    });

    describe('event.handler.required published', function () {
        var canHandle;
        var provider;
        var eventExpression = 'cron:00 26 12 * * *';
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
                    expression: eventExpression,
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
                        expression: eventExpression,
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

            it('should emit a "contract accepted" event when offer to handle is accepted', function (done) {
                provider.once('contract accepted', function (contract) {
                    contract.expression.should.equal(eventExpression);
                    done();
                });
                fakeClientSendingTokenAccept();
            });

            it('contract should emit a "watching" event when client requests expression enter watched state', function (done) {

                distexClient.create(connection).then(function (client) {
                    disposeAfterTest(client);
                    var clientContract;

                    provider.once('contract accepted', function (providerContract) {
                        providerContract.once('watching', function () {
                            done();
                        });

                    });

                    clientContract = client.requestHandler('cron:00 26 12 * * *');
                    clientContract.on('status.handled', function () {
                        clientContract.watch();
                    });

                }).catch(done);
            });

        });
    });

});
