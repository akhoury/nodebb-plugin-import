
var fs = require('fs-extra'),
    lineReader = require('line-reader'),
    path = require('path'),
    _ = require('underscore'),
    async = require('async'),
    EventEmitter2 = require('eventemitter2').EventEmitter2,
    noop = function(){},
    LOG_FILE = path.join(__dirname, '/tmp/import.log');

(function(Controller) {
    Controller._dispatcher = new EventEmitter2({
        wildcard: true
    });

    Controller._state = {now: 'idle', event: ''};

    Controller._config = null;

    Controller.canDownloadDeliverables = function () {
        var state = Controller.state();
        return state.now === 'idle'
            && (state.event === 'importer.complete'
                || state.event === 'none'
                || !state.event)
            && fs.existsSync(LOG_FILE);
    };

    Controller.clean = function() {
        // call clean functions for both importers and exporters
    };

    Controller.start = function(config, callback) {
        fs.remove(LOG_FILE, function(err) {
            fs.ensureFile(LOG_FILE, function() {
                Controller.startExport(config, function(err, data) {
                    Controller.startImport(data, config, callback);
                });
            });
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

        var state = Controller.state();
        if (state.now !== 'idle' || state.now !== 'errored') {
            return Controller.emit('exporter.warn', {message: 'Busy, cannot export'});
        }

        Controller.state({
            now: 'busy',
            event: 'exporter.require'
        });

        if(Controller._exporter) {
            Controller._exporter.removeAllListeners();
        }

        Controller._exporter = require('./exporter');

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
        if (state.now !== 'idle' || state.now !== 'errored') {
            return Controller.emit('importer.warn', {message: 'Busy, cannot import now', state: state});
        }

        if (Controller._importer) {
            Controller._importer.removeAllListeners();
        }

        Controller._importer = require('./importer');

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

    Controller.getUsersCsv = function(callback) {
        var keyword = '[user-csv]',
            len = keyword.length,
            idx = -1,
            content = 'email,username,pwd,_uid,uid,ms\n';

        if (Controller.canDownloadDeliverables()) {
            lineReader.eachLine(LOG_FILE, function(line) {
                line = line || '';
                idx = line.indexOf(keyword);
                if (idx > 0) {
                    content += line.substr(idx + len + 1) + '\n';
                }
            }).then(function() {
                callback(null, content);
            });
        } else {
            callback({error: 'Cannot download files.'});
        }
    };

    Controller.getUsersJson = function(callback) {
        var keyword = '[user-json]',
            len = keyword.length,
            idx = -1,
            content = '[\n';

        if (Controller.canDownloadDeliverables()) {
            lineReader.eachLine(LOG_FILE, function(line) {
                line = line || '';
                idx = line.indexOf(keyword);
                if (idx > 0) {
                    content += line.substr(idx + len) + '\n';
                }
            }).then(function() {
                content += ']';
                callback(null, content);
            });
        } else {
            callback({error: 'Cannot download files.'});
        }
    };

    Controller.getRedirectionJson = function(callback) {
        var keyword = '[redirect]',
            len = keyword.length,
            idx = -1,
            content = '{\n';

        if (Controller.canDownloadDeliverables()) {
            lineReader.eachLine(LOG_FILE, function(line) {
                line = line || '';
                idx = line.indexOf(keyword);
                if (idx > 0) {
                    content += line.substr(idx + len) + '\n';
                }
            }).then(function() {
                content += '}';
                callback(null, content);
            });
        } else {
            callback({error: 'Cannot download files.'});
        }
    };

    Controller.filelog = function() {
        var args = Array.prototype.slice.call(arguments, 0);
        var line = args.join(' ') + '\n';
        fs.appendFile(LOG_FILE, line, function(err) {
            if(err) {
                console.warn(err);
            }
        });
    };


    Controller.emit = function (type, b, c) {
        var args = Array.prototype.slice.call(arguments, 0);
        Controller.filelog(args);
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
