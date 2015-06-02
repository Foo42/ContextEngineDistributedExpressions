var EventEmitter = require('events').EventEmitter;
var createContract = require('./clientContract').createContract;

function createClient(connection) {
    var distexExchange;
    return connection.declareExchange('distex').then(function (exchange) {
        distexExchange = exchange;
        return distexExchange.createQueue()
    }).then(function (listenerQueue) {
        listenerQueue.topicEmitter.on('event.handler.available', eventHandlerAvailable);

        var handlerAvailable = new EventEmitter();
        var client = {};

        function updateExpressionStatus(contract, message, headers, deliveryInfo) {
            message = JSON.parse(message);
            var messageType = deliveryInfo.routingKey.split('.')[1];
            contract.handleMessage(messageType, message);
        }

        function eventHandlerAvailable(message) {
            var message = JSON.parse(message);
            handlerAvailable.emit(message.requestId, message);
        }

        client.requestHandler = function requestHandler(expression, userId) {
            var specification = {
                expression: expression,
                userId: userId
            };
            var contract = createContract(specification, distexExchange.publish)
            handlerAvailable.once(contract.requestId, function (message) {
                var handlingToken = message.handlingToken;
                listenerQueue.topicEmitter.on(handlingToken + '.#', updateExpressionStatus.bind(null, contract));
                contract.handleMessage('event.handler.available', message);
            });

            return contract;
        };

        client.dispose = function () {
            listenerQueue.dispose();
        };

        return client;
    });
};

module.exports.create = createClient;
