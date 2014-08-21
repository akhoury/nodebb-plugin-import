var Tail = require('tail').Tail,
    fs = require('fs-extra'),
    path = require('path'),
    async = require('async'),
    // events = require('events'),
    EventEmitter2 = require('eventemitter2').EventEmitter2;

//todo make these configured in each module, not here
var LOGS_DIR = './logs/';
var EXPORTER_LOG_FILE = path.resolve(LOGS_DIR, 'export.log');
var IMPORTER_LOG_FILE = path.resolve(LOGS_DIR, 'import.log');

(function(Controller) {

    Controller._dispatcher = new EventEmitter2({
        wildcard: true
    });

    Controller._state = 'idle';

    Controller._config = null;

    Controller.setup = function(callback) {
        async.parallel([
            function (next) {
                Controller.requireExporter(next);
            },
            function (next) {
                Controller.requireImporter(next);
            }
        ], callback);
    };

    Controller.clean = function() {
        // call clean functions for both importers and exporters
    };

    Controller.requireExporter = function(callback) {
        this._exporter = require('./exporter');

        fs.ensureFile(EXPORTER_LOG_FILE, function() {
            Controller._exporterTail = new Tail(EXPORTER_LOG_FILE);

            Controller._exporterTail.on('line', function() {
                Controller.emit('exporter.tail.line', arguments);
            });

            Controller._exporterTail.on('error', function() {
                Controller.emit('exporter.tail.error', arguments);
            });

            callback();
        });
    };

    Controller.requireImporter = function(callback) {
        this._importer = require('./importer');
        fs.ensureFile(IMPORTER_LOG_FILE, function() {
            Controller._importerTail = new Tail(IMPORTER_LOG_FILE);

            Controller._importerTail.on('line', function() {
                Controller.emit('importer.tail.line', arguments);
            });

            Controller._importerTail.on('error', function() {
                Controller.emit('importer.tail.error', arguments);
            });

            callback();
        });
    };

    Controller.config = function(config) {
        if (config != null) {
            Controller._config = config;
            Controller.emit('controller.config', Controller._config);
        }
        return Controller._config;
    };

    Controller.state = function(state) {
        if (state != null) {
            Controller._state = state;
            Controller.emit('controller.state', Controller._state);
        }
        return Controller._state;
    };

    Controller.startImport = function() {
        if (Controller.state() !== 'idle') {
            return Controller.emit('importer.warning', {message: 'Busy, cannot import now'});
        }
        this.requireImporter(function() {
            Controller._importer.on('importer.*', function(type) {
                Controller.emit(type);
            });
            Controller._importer.once('importer.complete', function() {

            });
            Controller._importer.once('importer.error', function() {

            });
            Controller._importer.once('importer.ready', function() {
                Controller._importer.start();
            });
            Controller._importer.init(Controller.config);
        });
    };

    Controller.startExport = function () {
        if (Controller.state() !== 'idle') {
            return Controller.emit('exporter.warning', {message: 'Busy, cannot export'});
        }

        this.requireExporter(function() {
            Controller._exporter.on('exporter.*', function(type) {
                Controller.emit(type);
            });
            Controller._importer.once('exporter.complete', function() {

            });
            Controller._importer.once('exporter.error', function() {

            });
            Controller._exporter.once('exporter.ready', function() {
                Controller._exporter.start();
            });

            Controller._exporter.init(Controller.config);
        });
    };

    Controller.emit = function (type, b, c) {
        var args = Array.prototype.slice.call(arguments, 0);
        args.unshift(args[0]);
        Controller._dispatcher.emit.apply(Controller._dispatcher, args);
    };

    Controller.on = function () {
        Controller._dispatcher.on.apply(Controller._dispatcher, arguments);
    };

    Controller.once = function () {
        Controller._dispatcher.once.apply(Controller._dispatcher, arguments);
    };

})(exports);
