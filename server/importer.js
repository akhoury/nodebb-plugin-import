var async = require('async'),
    EventEmitter2 = require('eventemitter2').EventEmitter2,
    getModuleId = function(module) {
        if (module.indexOf('git://github.com') > -1) {
            return module.split('/').pop().split('#')[0];
        }

        return module.split('@')[0];
    };

(function(Importer) {

    Importer._dispatcher = new EventEmitter2({
        wildcard: true
    });

    Importer.init = function(config) {
        Importer.config = config.Importer || {} ;
        Importer.setup();
    };

    Importer.start = function() {
        Importer.emit('Importer.start');
        async.series([
            Importer.getUsers,
            Importer.getCategories,
            Importer.getTopics,
            Importer.getPosts,
            Importer.teardown
        ]);
    };

    Importer.setup = function(next) {
        Importer.emit('Importer.setup.start');
        Importer._Importer.setup(Importer.config, function() {
            Importer.emit('Importer.setup.done');
            Importer.emit('Importer.ready');
            next();
        });
    };

    Importer.getUsers = function(next) {
        Importer.emit('Importer.users.start');
        Importer._Importer.getUsers(function() {
            Importer.emit('Importer.users.done');
            next();
        });
    };

    Importer.getCategories = function(next) {
        Importer.emit('Importer.categories.start');
        Importer._Importer.getCategories(function() {
            Importer.emit('Importer.categories.done');
            next();
        });

    };

    Importer.getTopics = function(next) {
        Importer.emit('Importer.topics.start');
        Importer._Importer.getTopics(function() {
            Importer.emit('Importer.topics.done');
            next();
        });

    };

    Importer.getPosts = function(next) {
        Importer.emit('Importer.posts.start');
        Importer._Importer.getPosts(function() {
            Importer.emit('Importer.posts.done');
            next();
        });
    };

    Importer.teardown = function(next) {
        Importer.emit('Importer.teardown.start');
        Importer._Importer.teardown(function() {
            Importer.emit('Importer.teardown.done');
            Importer.emit('Importer.complete');
            next();
        });
    };

    Importer.install = function(module, next) {
        Importer.emit('Importer.install.start');

        var	npm = require('npm');

        npm.load({}, function(err) {
            if (err) {
                next(err);
            }

            npm.config.set('spin', false);
            npm.commands.install([module], function(err) {
                if (err) {
                    next(err);
                }

                Importer.emit('Importer.install.done');

                var moduleId = getModuleId(module);
                var Importer = require(moduleId);

                if (! Importer.isCompatible(Importer)) {
                    // no?
                    if (module.indexOf('github.com/akhoury') === -1) {
                        Importer.emit('Importer.warn', {warn: module + ' is not compatible, trying github.com/akhoury\'s fork'});

                        // let's try my #master fork till the PRs close and get published
                        Importer.install('git://github.com/akhoury/' + moduleId + '#master', next);
                    } else {
                        Importer.emit('Importer.error', {error: module + ' is not compatible.'});
                        next({error: module + ' is not compatible.'});
                    }
                } else {

                    Importer._Importer = Importer;
                    Importer._module = module;
                    Importer._moduleId = moduleId;

                    next();
                }
            });
        });
    };

    Importer.isCompatible = function(Importer) {
        Importer = Importer || Importer._Importer;

        return Importer
            && typeof Importer.setup === 'function'
            && typeof Importer.getUsers === 'function'
            && typeof Importer.getCategories === 'function'
            && typeof Importer.getTopics === 'function'
            && typeof Importer.getPosts === 'function'
            && typeof Importer.teardown === 'function'
    };

    Importer.emit = function (type, b, c) {
        var args = Array.prototype.slice.call(arguments, 0);
        args.unshift(args[0]);
        Importer._dispatcher.emit.apply(Importer._dispatcher, args);
    };

    Importer.on = function () {
        Importer._dispatcher.on.apply(Importer._dispatcher, arguments);
    };

    Importer.once = function () {
        Importer._dispatcher.once.apply(Importer._dispatcher, arguments);
    };

})(module.exports);