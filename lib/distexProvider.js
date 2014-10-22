var Promise = require('promise');

function generateToken() {
    var randNumberString = '' + Math.random();
    return randNumberString.split('.')[1];
}

function create(connection, canHandleCallback) {
    if (connection.then === undefined) {
        connection = Promise.resolve(connection);
    }

    var distexExchange;

    return connection.then(function (conn) {
        console.log('distex provider got connected connection');
        return conn.declareExchange('distex');
    }).then(function (exchange) {
        distexExchange = exchange;
        console.log('distex provider got exchange');
        return exchange.createQueue();
    }).then(function (queue) {
        console.log('distex provider connected to queue on distex exchange. Waiting for messages.');
        return queue.bind('event.handler.required');
    }).then(function (queue) {
        var myTokens = {};
        queue.topicEmitter.on('event.handler.required', function (message, headers, deliveryInfo) {
            setImmediate(function () {
                var messageObject;
                messageObject = JSON.parse(message);
                console.log('distex provider recieved message', message);

                callbackResponse = canHandleCallback(messageObject)
                if (callbackResponse === undefined) {
                    callbackResponse = Promise.resolve(false);
                }
                if (callbackResponse.then === undefined) {
                    callbackResponse = Promise.resolve(callbackResponse);
                }
                callbackResponse.then(function (canHandle) {
                    if (canHandle) {
                        var token = generateToken();
                        myTokens[token] = messageObject; //may as well store original request
                        distexExchange.publish('event.handler.available', {
                            handlingToken: token,
                            requestId: messageObject.id
                        });
                    }
                });
            });
        });

        queue.topicEmitter.on('*.accept', function (message, headers, deliveryInfo) {
            message = JSON.parse(message);
            if (message.handlingToken && myTokens[message.handlingToken]) {
                distexExchange.publish(message.handlingToken + '.handling', {});
            }
        });

        return {
            dispose: function () {
                console.log('disposing distex provider');
                queue.dispose();
                console.log('disposed distex provider');
                canHandleCallback = undefined;
                connection = undefined;
            }
        };
    });
}

module.exports.create = create;
