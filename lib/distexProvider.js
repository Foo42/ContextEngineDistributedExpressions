var EventEmitter = require('events').EventEmitter;
var Promise = require('promise');
var createContract = require('./providerContract').create;

function create(connection, userSuppliedCanHandleCallback) {
    var myTokens = {};
    var distexExchange;
    var queue;
    var provider = new EventEmitter();

    function offerToHandle(messageObject) {
        var contract = createContract(messageObject.id, messageObject.expression, distexExchange);
        var token = contract.handlingToken;
        myTokens[token] = contract;

        contract.on('contract accepted', provider.emit.bind(provider, 'contract accepted', contract));

        queue.topicEmitter.on(token + '.#', function (message, headers, deliveryInfo) {
            message = JSON.parse(message);
            var contract = myTokens[token];
            if (!contract) {
                console.log('unknown contract');
                return;
            }

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

        provider.dispose = function () {
            console.log('disposing distex provider');
            queue.dispose();
            console.log('disposed distex provider');
            canHandleCallback = undefined;
            connection = undefined;
        };
        return provider;
    });
}

module.exports.create = create;
