var EventEmitter = require('events').EventEmitter;
var rabbitPie = require('rabbit-pie');

rabbitPie.connect().then(function (conn) {
    connection = conn;
    return connection.declareExchange('distex');
}).then(function (distextExchange) {
    return distextExchange.createQueue('observer');
}).then(function (observerQueue) {
    observerQueue.bind('#').then(function () {
        observerQueue.on('message', function (message, headers, deliveryInfo) {
            console.log(deliveryInfo.routingKey, ':', message);
        });
    });
}).catch(console.error.bind(console,'badness:'));
