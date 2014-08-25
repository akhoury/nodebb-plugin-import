var async = require('async'),
    _ = require('underscore'),
    EventEmitter2 = require('eventemitter2').EventEmitter2,
    getModuleId = function(module) {
        if (module.indexOf('git://github.com') > -1) {
            return module.split('/').pop().split('#')[0];
        }

        return module.split('@')[0];
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
                Exporter.install(config.exporter.module, next);
            },
            Exporter.setup
        ], function(err, result) {

        });
    };

    Exporter.start = function() {
        Exporter.emit('exporter.start');

        async.series([
            Exporter.getUsers,
            Exporter.getCategories,
            Exporter.getTopics,
            Exporter.getPosts,
            Exporter.teardown
        ]);
    };

    Exporter.setup = function(next) {
        Exporter.emit('exporter.setup.start');

        Exporter.mirrorLogs();

        Exporter._exporter.setup(Exporter.config, function() {
            Exporter.emit('exporter.setup.done');
            Exporter.emit('exporter.ready');
            next();
        });
    };

    Exporter.getUsers = function(next) {
        Exporter.emit('exporter.users.start');
        Exporter._exporter.getUsers(function() {
            Exporter.emit('exporter.users.done');
            next();
        });
    };

    Exporter.getCategories = function(next) {
        Exporter.emit('exporter.categories.start');
        Exporter._exporter.getCategories(function() {
            Exporter.emit('exporter.categories.done');
            next();
        });

    };

    Exporter.getTopics = function(next) {
        Exporter.emit('exporter.topics.start');
        Exporter._exporter.getTopics(function() {
            Exporter.emit('exporter.topics.done');
            next();
        });

    };

    Exporter.getPosts = function(next) {
        Exporter.emit('exporter.posts.start');
        Exporter._exporter.getPosts(function() {
            Exporter.emit('exporter.posts.done');
            next();
        });
    };

    Exporter.teardown = function(next) {
        Exporter.emit('exporter.teardown.start');
        Exporter._exporter.teardown(function() {
            Exporter.emit('exporter.teardown.done');
            Exporter.emit('exporter.complete');
            next();

        });
    };

    Exporter.install = function(module, next) {
        Exporter.emit('exporter.install.start');
        var	npm = require('npm');
        Exporter._exporter = null;

        npm.load({}, function(err) {
            if (err) {
                next(err);
            }

            npm.config.set('spin', false);
            npm.commands.install([module], function(err) {
                if (err) {
                    next(err);
                }

                Exporter.emit('exporter.install.done');

                var moduleId = getModuleId(module);
                // http://stackoverflow.com/a/9210901
                delete require.cache[require.resolve(moduleId)];
                var exporter = require(moduleId);

                if (! Exporter.isCompatible(exporter)) {
                    // no?
                    if (module.indexOf('github.com/akhoury') === -1) {
                        Exporter.emit('exporter.warn', {warn: module + ' is not compatible, trying github.com/akhoury\'s fork'});

                        // let's try my #master fork till the PRs close and get published
                        Exporter.install('git://github.com/akhoury/' + moduleId + '#master', next);
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

    Exporter.mirrorLogs = function() {
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