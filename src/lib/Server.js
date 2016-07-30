'use strict';
const os = require('os');
const fs = require('fs');
const https = require('https');
const child_process = require('child_process');
const readline = require('readline');
const EventEmitter = require('events');

class Server extends EventEmitter {
	constructor(version, name, options) {
		super();

		version = version || 'latest';
		name = name || 'server';
		options = options || {};

		this.version = version;
		this.name = name;

		this.options = {};
		this.options.java = options.java || 'java';
		this.options.ram = options.ram || '1G';
		this.options.jar = options.jar || 'minecraft_server.jar';

		this.rl = null;
		this.child = null;
		this.ticker = null;
		this.ticks = 0;

		this.loadServerPlugin();
	}

	loadServerPlugin() {
		let serverPluginPath = process.cwd() + '/' + this.name + '/server.js';

		if (fs.existsSync(serverPluginPath)) {
			let serverPlugin = require(serverPluginPath);
			new serverPlugin(this);
		}
	}

	get args() {
		return [
			'-jar',
			'-Xms' + this.options.ram,
			'-Xmx' + this.options.ram,
			'-XX:+UseG1GC',
			'-XX:+UnlockExperimentalVMOptions',
			'-XX:MaxGCPauseMillis=50',
			'-XX:+DisableExplicitGC',
			'-XX:TargetSurvivorRatio=90',
			'-XX:G1NewSizePercent=50',
			'-XX:G1MaxNewSizePercent=80',
			'-XX:InitiatingHeapOccupancyPercent=10',
			'-XX:G1MixedGCLiveThresholdPercent=50',
			'-XX:+AggressiveOpts',
			this.options.jar,
			'nogui'
		];
	}

	get isRunning() {
		return this.child !== null && this.rl !== null;
	}

	start(callback) {
		if (this.isRunning) {
			console.error('Server already started!');
			return;
		}

		Server.prepareVersion(this.version, this.name, () => {
			console.log('Starting server');

			this.child = child_process.spawn(this.options.java, this.args, {cwd: this.name});
			this.child.stderr.pipe(process.stderr);
			this.child.stdout.pipe(process.stdout);

			this.child.on('close', () => {
				console.log('close event emitted');
			});

			this.child.on('exit', () => {
				console.log('Server stopped');
				this.child.stderr.end();
				this.child.stdout.end();
				this.rl.close();

				this.child = null;
				this.rl = null;

				this.emit('stop');
			});

			this.rl = readline.createInterface(this.child.stdout, this.child.stdin);
			this.rl.on('line', (line) => {
				this.spy(line);
			});

			this.ticker = setInterval(() => this.tick(), 500);
			this.ticks = 0;

			this.emit('start');

			if (callback !== undefined)
				callback();
		});
	}

	tick() {
		if (!this.isRunning) {
			clearInterval(this.ticker);
			return;
		}


		this.ticks++;
		this.emit('tick', this.ticks);

		/*if (this.ticks % 20 === 0)
		 this.exec('toggledownfall');*/
	}

	spy(line) {
		let match = line.match(/(\w+) ?(\[(.+)\] )?logged in with entity id (\d+) at \(([\d\s\-\.,]+)\)$/);

		if (match) {
			let username = match[1];
			let address = match[3];
			let entityId = match[4];
			let coordinates = match[5].split(', ');

			coordinates.x = coordinates[0];
			coordinates.y = coordinates[1];
			coordinates.z = coordinates[2];

			this.emit('player.join', username, coordinates, address, entityId);
		}

		match = line.match(/(\w+) lost connection: (.+)$/);

		if (match) {
			let username = match[1];
			let reason = match[2];

			this.emit('player.leave', username, reason);
		}
	}

	exec(command) {
		if (!this.isRunning)
			return;

		let commandRaw = '';

		if (arguments.length > 1)
			command = Array.from(arguments);

		if (Array.isArray(command)) {
			command.forEach(part => {
				if (typeof part === 'object')
					commandRaw += JSON.stringify(part);
				else
					commandRaw += part;

				commandRaw += ' ';
			});
		} else
			commandRaw = command;

		this.emit('exec', commandRaw, command);

		console.log('<< ' + commandRaw);
		this.child.stdin.write(commandRaw + os.EOL);
	}

	/*backup() {
	 this.exec('save-off');
	 this.exec('save-all flush');
	 this.exec('save-on');
	 }*/

	stop() {
		if (!this.isRunning)
			return;

		console.log('Stopping server');
		this.exec('stop');
	}

	static prepareVersion(version, directory, callback) {
		if (version.toLowerCase() === 'custom') {
			console.log('Using custom version');
			callback();
			return;
		}

		// Download server
		let download = `https://s3.amazonaws.com/Minecraft.Download/versions/${version}/minecraft_server.${version}.jar`;
		let local = `versions/${version}.jar`;
		let destination = `${directory}/minecraft_server.jar`;

		if (!fs.existsSync('versions/'))
			fs.mkdirSync('versions');

		if (!fs.existsSync(directory))
			fs.mkdirSync(directory);

		if (fs.existsSync(destination))
			fs.unlinkSync(destination);

		let next = () => {
			next = () => {
				Server.prepareAssets(directory, callback);
			};

			console.log('Preparing minecraft_server.jar');
			fs.createReadStream(local).pipe(fs.createWriteStream(destination)).on('finish', next);
		};

		if (!fs.existsSync(local)) {
			console.log(`Downloading minecraft_server.${version}.jar`);
			https.get(download, (response) => response.pipe(fs.createWriteStream(local)).on('finish', next));
		} else next();
	}

	static prepareAssets(directory, callback) {
		console.log('Preparing eula.txt');

		let eula = directory + '/eula.txt';

		if (!fs.existsSync(eula))
			fs.writeFileSync(eula, 'eula=true');

		callback();
	}
}

module.exports = Server;