var Tail = require('tail').Tail;
var fs = require('fs-extra');
var path = require('path');

var sockets = module.parent.require('./socket.io'),

var LOGS_DIR = './logs/';
var EXPORTER_LOG_FILE = path.resolve(LOGS_DIR, 'export.log');
var IMPORTER_LOG_FILE = path.resolve(LOGS_DIR, 'import.log');

var Controller = {

    requireExporter: function(callback) {
        this._exporter = require('./exporter');
        fs.ensureFile(EXPORTER_LOG_FILE, function() {
            Controller._exporterTail = new Tail(EXPORTER_LOG_FILE);
            Controller._exporterTail.on('line', function() { Controller.emit.apply(Controller, arguments);});
            Controller._exporterTail.on('error', function() { Controller.emit.apply(Controller, arguments);});
            callback();
        });
    },

    requireImporter: function(callback) {
        this._importer = require('./importer');
        fs.ensureFile(IMPORTER_LOG_FILE, function() {
            Controller._importerTail = new Tail(IMPORTER_LOG_FILE);
            Controller._importerTail.on('line', function() { Controller.emit.apply(Controller, arguments);});
            Controller._importerTail.on('error', function() { Controller.emit.apply(Controller, arguments);});
            callback();
        });
    },

    _dispatcher: new require('events').EventEmitter(),

	_state: 'idle',

    _config: null,

	config: function(config) {
		if (config != null) {
			Controller._config = config;
            Controller.emit('controller.config', Controller._config);
		}
		return Controller._config;
	},

	state: function(state) {
		if (state != null) {
			Controller._state = state;
            Controller.emit('controller.state', Controller._state);
		}
		return Controller._state;
	},

	startImport: function() {
		if (Controller.state() !== 'idle') {
			return Controller.emit('importer.warning', {message: 'Busy, cannot import now'});
		}
        this.requireImporter(function() {
            Controller._importer.on('*', function(e) {
                Controller.emit.apply(Controller, ['importer.' + e.type].concat(arguments));
            });
            Controller._importer.on('ready', function() {
                Controller._importer.start();
            });
            Controller._importer.init(Controller.config);
        });
	},

	startExport: function () {
		if (Controller.state() !== 'idle') {
			return Controller.emit('exporter.warning', {message: 'Busy, cannot export'});
		}

        this.requireExporter(function() {
            Controller._exporter.on('*', function(e) {
                Controller.emit.apply(Controller, ['exporter.' + e.type].concat(arguments));
            });
            Controller._exporter.on('ready', function() {
                Controller._exporter.start();
            });
            Controller._exporter.init(Controller.config);
        });
	},

	emit: function () {
        if (sockets) {
            sockets.server.emit.apply(sockets.server, arguments);
        }
        Controller._dispatcher.emit.apply(Controller._dispatcher, arguments);
	},

	on: function () {
		Controller._dispatcher.on.apply(Controller._dispatcher, arguments);
	},

    once: function () {
		Controller._dispatcher.once.apply(Controller._dispatcher, arguments);
	}
};

module.export = Controller;