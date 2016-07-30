const Server = require('./wrapper').Server;

var server = new Server('1.10.2', 'test1');
server.start(() => {
	//server.backup()
});

process.on('exit', () => {
	server.stop();
});

process.on('SIGINT', _ => process.emit('exit'));
process.on('uncaughtException', _ => process.emit('exit'));