var EventEmitter = require('events').EventEmitter;
var Promise = require('promise');
var createContract = require('./providerContract').create;
var debuglog = require('debuglog')('distex').bind(null, 'PROVIDER:');

function create(connection, userSuppliedCanHandleCallback) {
    var distexExchange;
    var queue;
    var provider = new EventEmitter();

    function offerToHandle(messageObject) {
        var contract = createContract(messageObject.id, messageObject.expression, messageObject.userId, distexExchange);
        var token = contract.handlingToken;

        contract.on('contract accepted', provider.emit.bind(provider, 'contract accepted', contract));

        queue.topicEmitter.on(token + '.#', function (message, headers, deliveryInfo) {
            message = JSON.parse(message);
            var messageType = deliveryInfo.routingKey.split('.')[1];
            contract.handleMessage(messageType, message);
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
        debuglog('distex provider got connected connection');
        return conn.declareExchange('distex');
    }).then(function (exchange) {
        distexExchange = exchange;
        debuglog('distex provider got exchange');
        return exchange.createQueue();
    }).then(function (queue) {
        debuglog('distex provider connected to queue on distex exchange. Waiting for messages.');
        return queue.bind('event.handler.required');
    }).then(function (createdQueue) {
        queue = createdQueue;
        queue.topicEmitter.on('event.handler.required', function (message, headers, deliveryInfo) {
            var messageObject;
            messageObject = JSON.parse(message);

            canHandleCallback(messageObject).then(function (canHandle) {
                if (canHandle) {
                    offerToHandle(messageObject, distexExchange, queue);
                }
            });
        });

        provider.dispose = function () {
            debuglog('disposing distex provider');
            queue.dispose();
            debuglog('disposed distex provider');
            canHandleCallback = undefined;
            connection = undefined;
        };
        return provider;
    });
}

module.exports.create = create;
