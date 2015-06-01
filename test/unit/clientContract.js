var createContract = require('../../lib/clientContract').createContract;
var Promise = require('bluebird');
require('chai').should();

describe('ClientContract', function () {
    describe('request for handler', function () {
        it('should emit event.handler.required message with event requirement', function (done) {
            function publishMessage(key, message) {
                if (key === 'event.handler.required') {
                    message.requirements.events.should.equal(true);
                    done();
                }
            }
            var contract = createContract('some expression', 'someUser', publishMessage);
        });
    });
});
