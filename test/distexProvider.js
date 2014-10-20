var EventEmitter = require('events').EventEmitter;
var rabbitPie = require('rabbit-pie');
var distexProvider = require('../lib/distexProvider');
require('chai').should();
var Promise = require('promise');

describe('distex provider', function () {
    var distextExchange;
    var clientQueue;
    var connection;
    var cleanupEmitter = new EventEmitter();

    before(function (done) {
        rabbitPie.connect().then(function (conn) {
            connection = conn;
            return connection.declareExchange('distex');
        }).then(function (exchange) {
            distextExchange = exchange;
            return exchange.createQueue();
        }).then(function (queue) {
            clientQueue = queue;
            done();
        }).catch(done);
    });

    after(function (done) {
        console.log('in after');
        cleanupEmitter.emit('cleanup');
        clientQueue.dispose();
        clientQueue = undefined;
        setTimeout(connection.disconnect.bind(connection), 500);
        connection = undefined;
        setTimeout(done, 1000);
    })

    afterEach(function (done) {
        console.log('in afterEach');
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
            cleanupEmitter.once('cleanup', distexProvider.dispose.bind(distexProvider));
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

    describe('responding to event.handler.required', function () {
        var canHandle;
        var provider;
        beforeEach(function initialiseDistexProvider(done) {
            canHandle = undefined;
            distexProvider.create(connection, function canHandleWrapper(request) {
                return canHandle(request)
            }).then(function (distexProvider) {
                provider = distexProvider;
                done();
            }).catch(done);
        });

        it('should should publish event.handler.available when supplied callback returns a truthy promise', function (done) {
            cleanupEmitter.once('cleanup', provider.dispose.bind(provider));

            canHandle = function () {
                return Promise.resolve(true)
            };

            clientQueue.bind('event.handler.available.#').then(function () {
                clientQueue.once('message', function confirmReceivedCorrectMessage(message) {
                    message = JSON.parse(message);
                    message.requestId.should.equal(12345);
                    message.token.should.not.equal(undefined);

                    done();
                });

                distextExchange.publish('event.handler.required', {
                    expression: 'cron:00 26 12 * * *',
                    id: 12345
                });
            });

        });
    });

});
