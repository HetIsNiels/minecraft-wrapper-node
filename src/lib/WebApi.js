'use strict';

const http = require('http');
const url = require('url');
const os = require('os');

class WebApi {
	constructor(manager, port) {
		this.manager = manager || null;

		this.server = http.createServer();
		this.endpoints = {};

		this.endpoints['/servers'] = (cb) => {
			let result = [];

			Object.keys(this.manager.servers).forEach((name) => {
				let server = this.manager.servers[name];

				result.push({
					name: name,
					version: server.version,
					running: server.isRunning,
					players: server.players,
					stream: '/stream?server=' + name
				});
			});

			cb(result);
		};

		this.endpoints['/stream'] = (cb, req, resp) => {
			let server = url.parse(req.url, true).query.server || null;

			if (!(server in this.manager.servers))
				return cb('Undefined server');

			server = this.manager.servers[server];

			server.buffer.forEach((line) => {
				resp.write(line + os.EOL);
			});

			server.child.stdout.pipe(resp);
			server.child.stderr.pipe(resp);
		};

		this.server.on('request', (req, resp) => this.request(req, resp));
		this.server.listen(port || 8000);

		process.on('exit', () => this.stop());
		process.on('SIGINT', () => this.stop());
		process.on('uncaughtException', () => this.stop());
	}

	request(req, resp) {
		resp.setHeader('Content-Type', 'application/json; charset=UTF-8');
		resp.setHeader('Transfer-Encoding', 'chunked');

		let endpoint = req.url.split('?', 2)[0];

		if (endpoint in this.endpoints)
			this.endpoints[endpoint]((result) => resp.end(JSON.stringify(result)), req, resp);
		else
			resp.end('Unknown endpoint');
	}

	stop() {
		this.server.close();
	}
}

module.exports = WebApi;