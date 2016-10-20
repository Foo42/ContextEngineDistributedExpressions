var rabbitPie = require('rabbit-pie');
var distexClient = require('./lib/distexClient');
var client;
var connecting = rabbitPie.connect();

connecting.then(function (conn) {
    console.log('connected');
    conn.topicEmitter
    return distexClient.create(conn);
}).then(function (client) {
    console.log('client created');
    return client.requestHandler({
        expression: '{"hello":"world"}'
    })
}).then(function (contract) {
    console.log('created contract');
    contract.once('status.handled', function () {
        console.log('contract handled');
        contract.watch();
    });
}).catch(function (err) {
    console.error('something went wrong:', err);
});

connecting.then(function (conn) {
    connection = conn;
    return connection.declareExchange('distex');
}).then(function (exchange) {
    distextExchange = exchange;
    return exchange.createQueue();
}).then(function (queue) {
    clientQueue = queue;
}).then(function () {
    return distextExchange.createQueue('observer2');
}).then(function (secondQueue) {
    observerQueue = secondQueue;
    observerQueue.bind('#').then(function () {
        observerQueue.on('message', function (message, headers, deliveryInfo) {
            console.log('Message Observed:', deliveryInfo.routingKey, message);

        });
    });
});
