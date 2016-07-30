'use strict';

const os = require('os');
const fs = require('fs');
const https = require('https');
const child_process = require('child_process');
const readline = require('readline');

class Server {
	constructor(version, name, options) {
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
			});

			this.rl = readline.createInterface(this.child.stdout, this.child.stdin);
			this.rl.on('line', (line) => {
				this.spy(line);
			});

			this.ticker = setInterval(() => this.tick(), 500);
			this.ticks = 0;

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

		if (this.ticks % 20 === 0)
			this.exec('toggledownfall');
	}

	spy(line) {
		var match = line.match(/(\w+) ?(\[(.+)\] )?logged in with entity id (\d+) at \(([\d\s\-\.,]+)\)$/);

		if (match) {
			let player = match[1];
			let coord = match[5].split(', ');

			this.exec('particle', 'explode', coord[0], coord[1], coord[2], 1, 1, 1, 0, 100, 'force');
			this.exec('playsound', 'minecraft:entity.firework.blast', 'master', player, coord[0], coord[1], coord[2]);
			this.exec('title', player, 'title', {text: 'Welkom terug', color: 'aqua'});
			this.exec('title', player, 'subtitle', {text: player, color: 'yellow'});
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

		commandRaw += os.EOL;

		console.log('<< ' + commandRaw);
		this.child.stdin.write(commandRaw);
	}

	backup() {
		this.exec('save-off');
		this.exec('save-all flush');
		this.exec('save-on');
	}

	stop() {
		if (!this.isRunning)
			return;

		console.log('Stopping server');
		this.exec('stop');
	}

	static prepareVersion(version, directory, callback) {
		if (version.toLowerCase() === 'custom') {
			console.log('Using custom version')
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

module.exports.Server = Server;