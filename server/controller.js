
var Tail = require('tail').Tail,
    fs = require('fs-extra'),
    path = require('path'),
    _ = require('underscore'),
    async = require('async'),
    EventEmitter2 = require('eventemitter2').EventEmitter2;

//todo make these configured in each module, not here
var LOGS_DIR = './logs/';
var EXPORTER_LOG_FILE = path.resolve(LOGS_DIR, 'export.log');
var IMPORTER_LOG_FILE = path.resolve(LOGS_DIR, 'import.log');

(function(Controller) {
    Controller._dispatcher = new EventEmitter2({
        wildcard: true
    });

    Controller._state = {now: 'idle', event: ''};

    Controller._config = null;

    Controller.clean = function() {
        // call clean functions for both importers and exporters
    };

    Controller.requireExporter = function(callback) {
        var exporter = require('./exporter');

        fs.ensureFile(EXPORTER_LOG_FILE, function() {
            Controller._exporterTail = new Tail(EXPORTER_LOG_FILE);

            Controller._exporterTail.on('line', function() {
                Controller.emit('exporter.tail.line', arguments);
            });

            Controller._exporterTail.on('error', function() {
                Controller.emit('exporter.tail.error', arguments);
            });

            callback(null, exporter);
        });
    };

    Controller.start = function(config, callback) {
        Controller.startExport(config, function(err, data) {
            Controller.startImport(data, config, callback);
        });
    };

    Controller.startExport = function(config, callback) {
        if (_.isFunction(config)) {
            callback = config;
            config  = null;
        }
        callback = _.isFunction(callback) ? callback : function(){};

        if (config) {
            Controller.config(config);
        }

        if (Controller.state().now !== 'idle') {
            return Controller.emit('exporter.warning', {message: 'Busy, cannot export'});
        }

        Controller.requireExporter(function(err, exporter) {
            if (Controller._exporter) {
                Controller._exporter.removeAllListeners();
            }
            Controller._exporter = exporter;

            Controller._exporter.on('exporter.*', function(type, data) {
                Controller.emit(type, data);
            });

            Controller._exporter.once('exporter.complete', function(type, data) {
                Controller.state({
                    now: 'idle',
                    event: 'exporter.complete'
                });
            });

            Controller._exporter.once('exporter.error', function(type, data) {
                Controller.state({
                    now: 'errored',
                    event: 'exporter.error'
                });
            });

            Controller._exporter.once('exporter.start', function() {
                Controller.state({
                    now: 'busy',
                    event: 'exporter.start'
                });
            });
            Controller._exporter.once('exporter.ready', function() {
                Controller._exporter.start(function(err, results) {
                    Controller._exporter.data = {
                        users: results[0][0],
                        categories: results[1][0],
                        topics: results[2][0],
                        posts: results[3][0]
                    };
                    results = null;

                    fs.outputFile(
                        path.join(__dirname, '/tmp/exporter.data.json'),
                        JSON.stringify(Controller._exporter.data, undefined, 2),
                        function(err) {
                            Controller._exporter.emit('exporter.complete');

                            callback(err, Controller._exporter.data);
                        }
                    );
                });
            });

            Controller._exporter.init(Controller.config());
        });
    };

    Controller.requireImporter = function(callback) {
        var importer = require('./importer');

        fs.ensureFile(IMPORTER_LOG_FILE, function() {
            Controller._importerTail = new Tail(IMPORTER_LOG_FILE);

            Controller._importerTail.on('line', function() {
                Controller.emit('importer.tail.line', arguments);
            });

            Controller._importerTail.on('error', function() {
                Controller.emit('importer.tail.error', arguments);
            });

            callback(null, importer);
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

    Controller.startImport = function(data, config, callback) {
        if (_.isFunction(config)) {
            callback = config;
            config  = null;
        }

        callback = _.isFunction(callback) ? callback : function(){};

        var state = Controller.state();
        if (state.now !== 'idle') {
            return Controller.emit('importer.warning', {message: 'Busy, cannot import now', state: state});
        }

        Controller.requireImporter(function(err, importer) {
            if (Controller._importer) {
                Controller._importer.removeAllListeners();
            }

            Controller._importer = importer;

            Controller._importer.on('importer.*', function(type, data) {
                Controller.emit(type, data);
            });

            Controller._importer.once('importer.complete', function() {
                Controller.state({
                    now: 'idle',
                    event: 'importer.complete'
                });
                callback();
            });

            Controller._importer.once('importer.error', function() {
                Controller.state({
                    now: 'errored',
                    event: 'importer.error'
                });
            });

            Controller._importer.once('importer.start', function() {
                Controller.state({
                    now: 'busy',
                    event: 'importer.start'
                });
            });
            Controller._importer.once('importer.ready', function() {
                Controller._importer.start();
            });

            Controller._importer.init(data, config || Controller.config(), callback);
        });
    };

    Controller.findModules = function(q, callback) {
        if (typeof q === 'function') {
            callback = q;
            q = ['nodebb-plugin-import-'];
        }

        if (typeof q === 'string') {
            q = [q];
        }

        var	npm = require('npm');
        npm.load({}, function(err) {
            if (err) {
                callback(err);
            }

            npm.config.set('spin', false);
            npm.commands.search(q, function(err, results) {
                callback(err, results);
            });
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

    Controller.removeAllListeners = function () {
        Controller._dispatcher.removeAllListeners();
    };

})(module.exports);
