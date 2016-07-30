'use strict';

const fs = require('fs');
const Server = require('./Server');

class Manager {
	constructor() {
		this.servers = {};
		this.config = {};
		this.configRaw = null;

		if (fs.existsSync('manager.json')) {
			this.configRaw = fs.readFileSync('manager.json').toString();
			this.config = JSON.parse(this.configRaw);
		}

		this.config.servers = this.config.servers || [];
		this.config.servers.forEach((server) => {
			server = server || {};
			server.name = server.name || 'server';
			server.version = server.version || 'latest';
			server.options = server.options || {};
			server.options.java = server.options.java || 'java';
			server.options.ram = server.options.ram || '1G';
			server.options.jar = server.options.jar || 'minecraft_server.jar';
		});

		this.update();
		this.save();

		process.on('exit', () => this.stop());
		process.on('SIGINT', () => this.stop());
		process.on('uncaughtException', () => this.stop());
	}

	update() {
		this.config.servers.forEach((server) => {
			if (!(server.name in this.servers))
				this.servers[server.name] = new Server(server.version, server.name, server.options);

			let instance = this.servers[server.name];

			if (!instance.isRunning)
				instance.start();
		});
	}

	save() {
		let config = JSON.stringify(this.config);

		if (config === this.configRaw)
			return;

		this.configRaw = config;

		if (fs.existsSync('manager.json'))
			fs.unlinkSync('manager.json');

		fs.writeFileSync('manager.json', this.configRaw);
	}

	stop() {
		[].forEach.call(this.servers, (server) => {
			server.stop();
		});

		this.save();
	}
}

module.exports = Manager;