var EventEmitter = require('events').EventEmitter;
var createContract = require('./clientContract').createContract;

function createClient(connection) {
    var distexExchange;
    return connection.declareExchange('distex').then(function (exchange) {
        distexExchange = exchange;
        return distexExchange.createQueue()
    }).then(function (listenerQueue) {
        listenerQueue.topicEmitter.on('event.handler.available', eventHandlerAvailable);

        var openRequests = {};
        var client = {
            contracts: {}
        };

        function updateExpressionStatus(message, headers, deliveryInfo) {
            console.log('updating expression status');
            message = JSON.parse(message);
            var messageType = deliveryInfo.routingKey.split('.')[1];
            var contractId = deliveryInfo.routingKey.split('.')[0];

            console.log('messageType =', messageType);

            var contract = client.contracts[message.requestId];
            if (!contract) {
                console.log('Message delivered for unknown contract');
                return;
            }

            contract.handleMessage(messageType, message);
        }

        function eventHandlerAvailable(message) {
            var message = JSON.parse(message);
            var contract = openRequests[message.requestId];
            if (!contract) {
                return;
            }
            var handlingToken = message.handlingToken;
            if (!handlingToken) {
                return;
            }

            client.contracts[message.requestId].handlingToken = handlingToken;
            listenerQueue.topicEmitter.on(message.handlingToken + '.#', updateExpressionStatus);
            client.contracts[message.requestId].updateStatus('accepting');

            distexExchange.publish(handlingToken + '.accept', {
                handlingToken: handlingToken,
                expression: contract.expression
            });
            delete openRequests[message.requestId];
        }

        client.requestHandler = function requestHandler(expression, userId) {
            var contract = createContract(expression, userId, distexExchange.publish)

            openRequests[contract.requestId] = contract;
            client.contracts[contract.requestId] = contract;

            return contract;
        };

        client.dispose = function () {
            listenerQueue.dispose();
        };

        return client;
    });
};

module.exports.create = createClient;
