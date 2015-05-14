var EventEmitter = require('events').EventEmitter;

function generateToken() {
    var randNumberString = '' + Math.random();
    return randNumberString.split('.')[1];
}

function createContract(requestId, expression, distexExchange) {
    var contract = new EventEmitter();

    contract.requestId = requestId;
    contract.expression = expression;
    contract.status = 'offered';
    contract.handlingToken = generateToken();

    function publishMessage(type, message) {
        message = message || {
            requestId: requestId,
            handlingToken: contract.handlingToken
        };
        distexExchange.publish(contract.handlingToken + '.' + type, message);
    }

    contract.pushEvent = function (eventToPush) {
        distexExchange.publish(contract.handlingToken + '.event', eventToPush);
    };

    contract.handleMessage = function (messageType, message) {
        if (messageType === 'accept') {
            var requestId = contract.requestId;
            publishMessage('handling');
            contract.status = 'accepted';
            contract.emit('contract accepted');
        } else if (messageType === 'watch') {
            contract.isWatching = true;
            contract.emit('watching');
            publishMessage('watching');
        } else if (messageType === 'stopWatching') {
            contract.isWatching = false;
            contract.emit('notWatching');
            publishMessage('notWatching');
        }
    }

    return contract;
}

module.exports = {
    create: createContract
}
