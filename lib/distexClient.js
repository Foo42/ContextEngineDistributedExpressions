var EventEmitter = require('events').EventEmitter;
var createContract = require('./clientContract').createContract;

function createClient(connection) {
    var distexExchange;
    return connection.declareExchange('distex').then(function (exchange) {
        distexExchange = exchange;
        return distexExchange.createQueue()
    }).then(function (listenerQueue) {
        var client = {
            contracts: {}
        };

        var contractIdToRequestId = {};

        function accept(requestId, handlingToken) {
            distexExchange.publish(handlingToken + '.accept', {
                handlingToken: handlingToken,
                expression: client.contracts[requestId].expression
            });
        }

        function updateExpressionStatus(message, headers, deliveryInfo) {
            console.log('updating expression status');
            message = JSON.parse(message);
            var messageType = deliveryInfo.routingKey.split('.')[1];
            var contractId = deliveryInfo.routingKey.split('.')[0];

            console.log('messageType =', messageType);

            if (client.contracts[message.requestId]) {
                contractIdToRequestId[contractId] = message.requestId;
            }

            if (client.contracts[contractIdToRequestId[contractId]]) {

                var contract = client.contracts[contractIdToRequestId[contractId]]; //here
                if (messageType === 'handling') {
                    contract.handlingToken = message.handlingToken; //is this confusing since its not
                    contract.updateStatus('handled');
                    console.log('updated request status to', client.contracts[message.requestId].getStatus());
                } else if (messageType === 'watching') {
                    contract.updateStatus('watching');
                } else if (messageType === 'notWatching') {
                    contract.updateStatus('notWatching');
                } else if (messageType === 'event') {
                    console.log('recieved event, emitting on contract');
                    console.log(contract);
                    var number = contract.emit('event.recieved', message);
                    console.log('event emitted on contract, sent to', number, 'subscribers');
                }

            }
        }

        function eventHandlerAvailable(message) {
            var message = JSON.parse(message);
            if (client.contracts[message.requestId] && client.contracts[message.requestId].getStatus() === 'requested') {
                listenerQueue.topicEmitter.on(message.handlingToken + '.#', updateExpressionStatus);
                client.contracts[message.requestId].handlingToken = message.handlingToken;
                client.contracts[message.requestId].updateStatus('accepting');

                accept(message.requestId, message.handlingToken);
            }
        }

        client.requestHandler = function requestHandler(expression) {
            listenerQueue.topicEmitter.on('event.handler.available', eventHandlerAvailable);
            var contract = createContract(expression, distexExchange.publish)

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
