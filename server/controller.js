var Controller = {

	_exporter: require('./exporter'),
	_dispatcher: new require('events').EventEmitter(),

	_state: 'idle',
	_config: null,

	config: function(config) {
		if (config != null) {
			Controller._config = config;
		}
		return Controller._config;
	},

	state: function(state) {
		if (state != null) {
			Controller._state = state;
		}
		return Controller._state;
	},

	startImport: function() {
		if (Controller.state() !== 'idle') {
			return Controller.emit('importer.warning', {message: 'Busy, cannot import now'});
		}
		Controller._importer = require('./importer');
		Controller._importer.on('*', function(e) {
			Controller.emit.apply(Controller, ['importer.' + e.type].concat(arguments));
		});
		Controller._importer.on('ready', function() {
			Controller._importer.start();
		});
		Controller._importer.init(Controller.config);
	},

	startExport: function () {
		if (Controller.state() !== 'idle') {
			return Controller.emit('exporter.warning', {message: 'Busy, cannot export'});
		}
		Controller._exporter = require('./exporter');
		Controller._exporter.on('*', function(e) {
			Controller.emit.apply(Controller, ['exporter.' + e.type].concat(arguments));
		});
		Controller._exporter.on('ready', function() {
			Controller._exporter.start();
		});
		Controller._exporter.init(Controller.config);
	},

	emit: function () {
		Controller._dispatcher.emit.apply(Controller._dispatcher, arguments);
	},

	on: function () {
		Controller._dispatcher.on.apply(Controller._dispatcher, arguments);
	}
};

module.export = Controller;