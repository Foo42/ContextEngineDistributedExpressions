var EventEmitter = require('events').EventEmitter;

function generateToken() {
    var randNumberString = '' + Math.random();
    return randNumberString.split('.')[1];
}

function createContract(expression, publishMessage) {
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
        if (messageType === 'handling') {
            contract.handlingToken = message.handlingToken; //is this confusing since its not
            contract.updateStatus('handled');
            console.log('updated request status to', contract.getStatus());
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

    setImmediate(function () {
        publishMessage('event.handler.required', {
            expression: expression,
            id: contract.requestId
        });
    });
    return contract;
}
module.exports.createContract = createContract;
