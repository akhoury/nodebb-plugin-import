var async = require('async'),
    EventEmitter2 = require('eventemitter2').EventEmitter2;

(function(Exporter) {


    Exporter._exporter = null;

    Exporter._dispatcher = new EventEmitter2({
        wildcard: true
    });

    // {
    //   exporter: {
    //      'module': 'nodebb-plugin-import-ubb'
    //      dbhost: '',
    //      dbport: '',
    //      dbuser: '',
    //      dbpass: '',
    //   }
    // }
    Exporter.init = function(config) {
        Exporter.module = config.exporter.module;
        Exporter.config = config.exporter || {} ;

        async.series([
            Exporter.install,
            Exporter.validate,
            Exporter.setup
        ], function(err, result) {

        });
    };

    Exporter.start = function() {
        Exporter.emit('exporter.start');
        async.series([
            Exporter.exportUsers,
            Exporter.exportCategories,
            Exporter.exportTopics,
            Exporter.exportPosts,
            Exporter.teardown
        ]);
    };

    Exporter.setup = function(next) {
        Exporter.emit('exporter.setup.start');
        Exporter._exporter.setup(Exporter.config, function() {
            Exporter.emit('exporter.setup.done');
            Exporter.emit('exporter.ready');
            next();
        });
    };

    Exporter.exportUsers = function(next) {
        Exporter.emit('exporter.users.start');
        Exporter._exporter.exporterUsers(function() {
            Exporter.emit('exporter.users.done');
            next();
        });
    };

    Exporter.exportCategories = function(next) {
        Exporter.emit('exporter.categories.start');
        Exporter._exporter.exportCategories(function() {
            Exporter.emit('exporter.categories.done');
            next();
        });

    };

    Exporter.exportTopics = function(next) {
        Exporter.emit('exporter.topics.start');
        Exporter._exporter.exportTopics(function() {
            Exporter.emit('exporter.topics.done');
            next();
        });

    };

    Exporter.exportPosts = function(next) {
        Exporter.emit('exporter.posts.start');
        Exporter._exporter.exportPosts(function() {
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

    Exporter.install = function(next) {
        Exporter.emit('exporter.install.start');

        var	npm = require('npm');

        npm.load({}, function(err) {
            if (err) {
                next(err);
            }

            npm.config.set('spin', false);
            npm.commands.install([Exporter.module], function() {
                Exporter.emit('exporter.install.done');
                next();
            });
        });
    };

    Exporter.validate = function(next) {
        var exporter = Exporter._exporter;
        if (exporter
            && typeof exporter.setup === 'function'
            && typeof exporter.exportUsers === 'function'
            && typeof exporter.exportCategories === 'function'
            && typeof exporter.exportTopics === 'function'
            && typeof exporter.exportPosts === 'function'
            && typeof exporter.teardown === 'function'
        ) {
            next();
        } else {
            var err = {error: 'Exporter: ' + Exporter.module + ' is not compatible'};

            Exporter.emit('exporter.error', err);
            next(err);
        }
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

})(exports);