var async = require('async'),
    _ = require('underscore'),
    EventEmitter2 = require('eventemitter2').EventEmitter2,
    getModuleId = function(module) {
        if (module.indexOf('git://github.com') > -1) {
            return module.split('/').pop().split('#')[0];
        }

        return module.split('@')[0];
    },

    searchModulesCache = function(moduleName, callback) {
        var mod = require.resolve(moduleName);
        if (mod && ((mod = require.cache[mod]) !== undefined)) {
            (function run(mod) {
                mod.children.forEach(function (child) {
                    run(child);
                });
                callback(mod);
            })(mod);
        }
    },

    reloadModule = function(moduleName) {
        searchModulesCache(moduleName, function(mod) {
            delete require.cache[mod.id];
        });

        // https://github.com/joyent/node/issues/8266
        Object.keys(module.constructor._pathCache).forEach(function(cacheKey) {
            if (cacheKey.indexOf(moduleName) > 0) {
                delete module.constructor._pathCache[cacheKey];
            }
        });

        return require(moduleName);
    };

(function(Exporter) {

    Exporter._exporter = null;

    Exporter._dispatcher = new EventEmitter2({
        wildcard: true
    });

    Exporter.init = function(config) {
        Exporter.config = config.exporter || {} ;
        async.series([
            function(next) {
                Exporter.install(config.exporter.module, {force: true}, next);
            },
            Exporter.setup
        ], function(err, result) {

        });
    };

    Exporter.start = function(callback) {
        Exporter.emit('exporter.start');

        async.series([
            Exporter.getUsers,
            Exporter.getCategories,
            Exporter.getTopics,
            Exporter.getPosts,
            Exporter.teardown
        ], callback);
    };

    Exporter.setup = function(next) {
        Exporter.emit('exporter.setup.start');

        Exporter.augmentLogFunctions();

        Exporter._exporter.setup(Exporter.config, function(err, map, arr) {
            Exporter.emit('exporter.setup.done');
            Exporter.emit('exporter.ready');
            next(err, map, arr);
        });
    };

    Exporter.getUsers = function(next) {
        Exporter.emit('exporter.users.start');
        Exporter._exporter.getUsers(function(err, map, arr) {
            Exporter.emit('exporter.users.done');
            next(err, map, arr);
        });
    };

    Exporter.getCategories = function(next) {
        Exporter.emit('exporter.categories.start');
        Exporter._exporter.getCategories(function(err, map, arr) {
            Exporter.emit('exporter.categories.done');
            next(err, map, arr);
        });

    };

    Exporter.getTopics = function(next) {
        Exporter.emit('exporter.topics.start');
        Exporter._exporter.getTopics(function(err, map, arr) {
            Exporter.emit('exporter.topics.done');
            next(err, map, arr);
        });

    };

    Exporter.getPosts = function(next) {
        Exporter.emit('exporter.posts.start');
        Exporter._exporter.getPosts(function(err, map, arr) {
            Exporter.emit('exporter.posts.done');
            next(err, map, arr);
        });
    };

    Exporter.teardown = function(next) {
        Exporter.emit('exporter.teardown.start');
        Exporter._exporter.teardown(function(err, map, arr) {
            Exporter.emit('exporter.teardown.done');
            next(err, map, arr);
        });
    };

    Exporter.install = function(module, options, next) {
        Exporter.emit('exporter.install.start');
        var	npm = require('npm');
        Exporter._exporter = null;

        if (_.isFunction(options)) {
            next = options;
            options = {};
        }

        npm.load(options, function(err) {
            if (err) {
                next(err);
            }
            Exporter.emit('exporter.log', 'installing: ' + module);

            npm.config.set('spin', false);
            npm.config.set('force', true);
            npm.config.set('verbose', true);

            npm.commands.install([module], function(err) {
                if (err) {
                    next(err);
                }

                Exporter.emit('exporter.install.done');
                Exporter.emit('exporter.log', 'install done: ' + module);

                var moduleId = getModuleId(module);
                var exporter = reloadModule(moduleId);

                if (! Exporter.isCompatible(exporter)) {
                    // no?
                    if (module.indexOf('github.com/akhoury') === -1) {
                        Exporter.emit('exporter.warn', {warn: module + ' is not compatible, trying github.com/akhoury\'s fork'});

                        npm.commands.uninstall([module], function(err) {
                            if(err) {
                                next(err);
                            }
                            Exporter.emit('exporter.log', 'uninstalled: ' + module);

                            // let's try my #master fork till the PRs close and get published
                            Exporter.install('git://github.com/akhoury/' + moduleId + '#master', {'no-registry': true}, next);
                        });
                    } else {
                        Exporter.emit('exporter.error', {error: module + ' is not compatible.'});
                        next({error: module + ' is not compatible.'});
                    }
                } else {

                    Exporter._exporter = exporter;
                    Exporter._module = module;
                    Exporter._moduleId = moduleId;

                    next();
                }
            });
        });
    };

    Exporter.isCompatible = function(exporter) {
        exporter = exporter || Exporter._exporter;

        return exporter
            && typeof exporter.setup === 'function'
            && typeof exporter.getUsers === 'function'
            && typeof exporter.getCategories === 'function'
            && typeof exporter.getTopics === 'function'
            && typeof exporter.getPosts === 'function'
            && typeof exporter.teardown === 'function';
    };

    Exporter.emit = function (type, b, c) {
        var args = Array.prototype.slice.call(arguments, 0);
        console.log.apply(console, args);
        args.unshift(args[0]);
        Exporter._dispatcher.emit.apply(Exporter._dispatcher, args);
    };

    Exporter.on = function () {
        Exporter._dispatcher.on.apply(Exporter._dispatcher, arguments);
    };

    Exporter.once = function () {
        Exporter._dispatcher.once.apply(Exporter._dispatcher, arguments);
    };

    Exporter.removeAllListeners = function() {
        Exporter._dispatcher.removeAllListeners();
    };

    Exporter.augmentFn = function (base, extra) {
        return (function () {
            return function () {
                base.apply(this, arguments);
                extra.apply(this, arguments);
            };
        })();
    };

    Exporter.augmentLogFunctions = function() {
        var log = Exporter._exporter.log;
        if (_.isFunction(log)) {
            Exporter._exporter.log = Exporter.augmentFn(log, function (a, b, c) {
                var args = _.toArray(arguments);
                args.unshift('exporter.log');
                Exporter.emit.apply(Exporter, args);
            });
        }
        var warn = Exporter._exporter.warn;
        if (_.isFunction(warn)) {
            Exporter._exporter.warn = Exporter.augmentFn(warn, function () {
                var args = _.toArray(arguments);
                args.unshift('exporter.warn');
                Exporter.emit.apply(Exporter, args);
            });
        }
        var error = Exporter._exporter.error;
        if (_.isFunction(error)) {
            Exporter._exporter.error = Exporter.augmentFn(error, function () {
                var args = _.toArray(arguments);
                args.unshift('exporter.error');
                Exporter.emit.apply(Exporter, args);
            });
        }
    }

})(module.exports);