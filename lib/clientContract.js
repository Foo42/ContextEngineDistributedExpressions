var EventEmitter = require('events').EventEmitter;

function createContract(requestId, expression, publishMessage) {
    var contract = new EventEmitter();
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

    setImmediate(function () {
        publishMessage('event.handler.required', {
            expression: expression,
            id: requestId //todo
        });
    });
    return contract;
}
module.exports.createContract = createContract;
