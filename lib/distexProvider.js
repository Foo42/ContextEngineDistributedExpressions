var Promise = require('promise');

function generateToken() {
    var randNumberString = '' + Math.random();
    return randNumberString.split('.')[1];
}

function create(connection, userSuppliedCanHandleCallback) {
    var myTokens = {};
    var distexExchange;
    var queue;

    function offerToHandle(messageObject) {
        var token = generateToken();
        myTokens[token] = {
            requestId: messageObject.id,
            expression: messageObject.expression
        };

        queue.topicEmitter.on(token + '.#', function (message, headers, deliveryInfo) {
            message = JSON.parse(message);
            var messageType = deliveryInfo.routingKey.split('.')[1];
            console.log('provider recieved ')
            if (messageType === 'accept') {
                if (message.handlingToken && myTokens[message.handlingToken]) {
                    var requestId = myTokens[message.handlingToken].requestId;
                    distexExchange.publish(message.handlingToken + '.handling', {
                        requestId: requestId
                    });
                }
            }
        });

        distexExchange.publish('event.handler.available', {
            handlingToken: token,
            requestId: messageObject.id
        });
    }

    if (connection.then === undefined) {
        connection = Promise.resolve(connection);
    }

    function canHandleCallback(messageObject) {
        callbackResponse = userSuppliedCanHandleCallback(messageObject)
        if (callbackResponse === undefined) {
            callbackResponse = Promise.resolve(false);
        }
        if (callbackResponse.then === undefined) {
            callbackResponse = Promise.resolve(callbackResponse);
        }
        return callbackResponse;
    }

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
    }).then(function (createdQueue) {
        queue = createdQueue;
        queue.topicEmitter.on('event.handler.required', function (message, headers, deliveryInfo) {
            var messageObject;
            messageObject = JSON.parse(message);
            console.log('distex provider recieved message', message);

            canHandleCallback(messageObject).then(function (canHandle) {
                if (canHandle) {
                    offerToHandle(messageObject, distexExchange, queue);
                }
            });
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
