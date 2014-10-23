var EventEmitter = require('events').EventEmitter;

function generateToken() {
	var randNumberString = '' + Math.random();
	return randNumberString.split('.')[1];
}

function createClient(connection) {
	var distexExchange;
	return connection.declareExchange('distex').then(function (exchange) {
		distexExchange = exchange;
		return distexExchange.createQueue()
	}).then(function (listenerQueue) {
		var client = {
			outstandingRequests: {}
		};

		function accept(requestId, handlingToken) {
			distexExchange.publish(handlingToken + '.accept', {
				handlingToken: handlingToken,
				expression: client.outstandingRequests[requestId].expression
			});
		}

		function eventHandlerAvailable(message) {
			var message = JSON.parse(message);
			if (client.outstandingRequests[message.requestId] && client.outstandingRequests[message.requestId].status === 'requested') {
				client.outstandingRequests[message.requestId].status = 'recieved';
				client.outstandingRequests[message.requestId].handlingToken = message.handlingToken;
				accept(message.requestId, message.handlingToken);
			}
		}

		client.requestHandler = function requestHandler(expression) {
			listenerQueue.topicEmitter.on('event.handler.available', eventHandlerAvailable);
			var requestId = generateToken();
			var statusEmitter = new EventEmitter();

			client.outstandingRequests[requestId] = {
				status: 'requested',
				expression: expression,
				statusEmitter: statusEmitter
			};

			statusEmitter.getStatus = function () {
				return client.outstandingRequests[requestId] && client.outstandingRequests[requestId].status;
			}

			setImmediate(function () {
				distexExchange.publish('event.handler.required', {
					expression: expression,
					id: requestId //todo
				});
			});

			return statusEmitter;
		};

		return client;
	});
};


module.exports.create = createClient;
