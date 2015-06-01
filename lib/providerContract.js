var EventEmitter = require('events').EventEmitter;
var Promise = require('bluebird');
var debuglog = require('debuglog')('distex').bind(null, 'PROVIDER:');

function generateToken() {
    var randNumberString = '' + Math.random();
    return randNumberString.split('.')[1];
}

function createContract(requestId, expression, userId, distexExchange) {
    var contract = new EventEmitter();

    contract.requestId = requestId;
    contract.expression = expression;
    contract.userId = userId;
    contract.status = 'offered';
    contract.handlingToken = generateToken();
    contract.startWatching = Promise.resolve;
    contract.stopWatching = Promise.resolve;

    function publishMessage(type, message) {
        message = message || {
            requestId: requestId,
            handlingToken: contract.handlingToken
        };
        distexExchange.publish(contract.handlingToken + '.' + type, message);
    }

    contract.pushEvent = function (eventToPush) {
        var message = {
            requestId: requestId,
            handlingToken: contract.handlingToken,
            event: eventToPush
        };
        distexExchange.publish(contract.handlingToken + '.event', message);
    };

    contract.handleMessage = function (messageType, message) {
        debuglog('recieved', messageType, 'message with body', message);
        if (messageType === 'accept') {
            publishMessage('handling');
            contract.status = 'accepted';
            contract.emit('contract accepted');
        } else if (messageType === 'watch') {
            contract.isWatching = true;
            contract.startWatching().then(function () {
                contract.emit('watching');
                publishMessage('watching');
            });
        } else if (messageType === 'stopWatching') {
            contract.isWatching = false;
            contract.stopWatching().then(function () {
                contract.emit('notWatching');
                publishMessage('notWatching');
            });
        }
    }

    return contract;
}

module.exports = {
    create: createContract
}
