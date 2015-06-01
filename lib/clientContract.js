var EventEmitter = require('events').EventEmitter;
var debuglog = require('debuglog')('distex').bind(null, 'CLIENT:');

function generateToken() {
    var randNumberString = '' + Math.random();
    return randNumberString.split('.')[1];
}

function createContract(expression, userId, publishMessage) {
    var contract = new EventEmitter();
    contract.requestId = generateToken();
    contract.status = 'requested';
    contract.expression = expression;
    contract.getStatus = function () {
        return this.status;
    };
    contract.updateStatus = function (newStatus) {
        this.status = newStatus;
        this.emit('status.' + newStatus.split(' ').join('_'));
    };
    contract.getHandlingToken = function () {
        return this.handlingToken;
    }
    contract.watch = function () {
        if (!this.handlingToken) {
            return;
        }
        publishMessage(this.handlingToken + '.watch', {});
    };
    contract.stopWatching = function () {
        if (!this.handlingToken) {
            return;
        }
        publishMessage(this.handlingToken + '.stopWatching', {});
    }

    contract.handleMessage = function (messageType, message) {
        debuglog(messageType, message)
        if (messageType === 'event.handler.available') {
            contract.handlingToken = message.handlingToken;
            contract.updateStatus('accepting');
            publishMessage(contract.handlingToken + '.accept', {
                handlingToken: contract.handlingToken,
                expression: contract.expression
            });
        } else if (messageType === 'handling') {
            contract.updateStatus('handled');
        } else if (messageType === 'watching') {
            contract.updateStatus('watching');
        } else if (messageType === 'notWatching') {
            contract.updateStatus('notWatching');
        } else if (messageType === 'event') {
            debuglog('recieved event, emitting on contract');
            var number = contract.emit('event.recieved', message);
            debuglog('event emitted on contract, sent to', number, 'subscribers');
        }
    }

    setImmediate(function () {
        var message = {
            expression: expression,
            id: contract.requestId
        };
        if (userId) {
            message.userId = userId;
        }
        publishMessage('event.handler.required', message);
    });
    return contract;
}
module.exports.createContract = createContract;
