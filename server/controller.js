
var fs = require('fs-extra'),
    lineReader = require('line-reader'),
    path = require('path'),
    _ = require('underscore'),
    async = require('async'),
    EventEmitter2 = require('eventemitter2').EventEmitter2,
    nodeExtend = require('node.extend'),

    noop = function(){},

    DB = module.parent.require('../../../src/database.js'),
    User = require('../../../src/user.js'),
    Topics = require('../../../src/topics.js'),
    Posts = require('../../../src/posts.js'),
    Categories = require('../../../src/categories.js'),

    LOG_FILE = path.join(__dirname, '/tmp/import.log'),

    defaults = {
        redirectionTemplates: {
            users: {
                oldPath: null,
                newPath: '/user/<%= userslug %>'
            },
            categories: {
                oldPath: null,
                newPath: '/category/<%= cid %>'
            },
            topics: {
                oldPath: null,
                newPath: '/topic/<%= tid %>'
            },
            posts: null
        }
    };

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
                || !state.event);
    };

    Controller.clean = function() {
        // call clean functions for both importers and exporters
    };

    Controller.start = function(config, callback) {
        Controller.config(config);

        var start = function() {
            Controller.startExport(Controller.config(), function(err, data) {
                Controller.startImport(data, Controller.config(), callback);
            });
        };
        fs.remove(LOG_FILE, function(err) {
            if (Controller.config('log').server) {
                fs.ensureFile(LOG_FILE, function() {
                    start();
                });
            } else {
                start();
            }
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
        if (state.now !== 'idle' && state.now !== 'errored') {
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
                    users: results[0],
                    categories: results[1],
                    topics: results[2],
                    posts: results[3]
                };
                results = null;

                Controller._exporter.emit('exporter.complete');
                callback(err, Controller._exporter.data);
            });
        });

        Controller._exporter.init(Controller.config());
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
        if (state.now !== 'idle' && state.now !== 'errored') {
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

        if (Controller.config('log').server) {
            Controller.filelog(args);
        }

        if (Controller.config('log').verbose) {
            console.log.apply(console, args);
        }

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
        if (Controller._dispatcher && Controller._dispatcher.removeAllListeners)
            Controller._dispatcher.removeAllListeners();
    };

    Controller.log = function() {
        var args = Array.prototype.slice.call(arguments, 0);
        console.log.apply(console, args);
    };

    // move to utils

    var resolveType = function(str) {
        var type = typeof str;
        if (type !== 'string') {
            return str;
        } else {
            var nb = parseFloat(str);
            if (!isNaN(nb) && isFinite(str))
                return nb;
            if (str === 'false')
                return false;
            if (str === 'true')
                return true;
            if (str === 'undefined')
                return undefined;
            if (str === 'null')
                return null;

            try {
                str = JSON.parse(str);
            } catch (e) {}

            return str;
        }
    };
    var recursiveIteration = function(object) {
        for (var property in object) {
            if (object.hasOwnProperty(property)) {
                if (typeof object[property] == "object"){
                    recursiveIteration(object[property]);
                }else{
                    object[property] = resolveType(object[property]);
                }
            }
        }
    };

    // alias
    Controller.saveConfig = function(config, val) {
        return Controller.config(config, val);
    };

    Controller.config = function(config, val) {
        if (config != null) {
            if (typeof config === 'object') {
                recursiveIteration(config);
                Controller._config = nodeExtend(true, {}, defaults, config);
                Controller.emit('controller.config', Controller._config);
            } else if (typeof config === 'string') {
                if (val != null) {
                    Controller._config = Controller._config || {};
                    Controller._config[config] = resolveType(val);
                    Controller.emit('controller.config', Controller._config);
                }
                return Controller._config[config];
            }
        }
        return Controller._config;
    };

    Controller.getUsersCsv = function(callback) {
        if (Controller.canDownloadDeliverables()) {
            var content = 'index,email,username,pwd,_uid,uid,joindate\n';
            async.waterfall([
                function (next) {
                    DB.getObjectValues('username:uid', next);
                },
                function (uids, next) {
                    User.getMultipleUserFields(
                        uids,
                        [
                            'uid', 'email', 'username', 'joindate',
                            '_imported_uid', '_imported_username', '_imported_email', '_imported_slug'
                        ],
                        next
                    );
                },
                function (usersData, next) {
                    usersData.forEach(function (user, index) {
                        if (user && user._imported_uid) {
                            content += index + ',' + user.email + ',' + user.username + ',' + user._imported_pwd + ',' + user._imported_uid + ',' + user.uid + ',' + user.joindate + '\n';
                        }
                    });

                    next(null, content);
                }
            ], callback);
        } else {
            callback({error: 'Cannot download files at the moment.'});
        }
    };

    Controller.getUsersJson = function(callback) {

        if (Controller.canDownloadDeliverables()) {
            var content = '[\n';
            async.waterfall([
                function (next) {
                    DB.getObjectValues('username:uid', next);
                },
                function (uids, next) {
                    User.getMultipleUserFields(
                        uids,
                        [
                            'uid', 'email', 'username', 'joindate',
                            '_imported_uid', '_imported_username', '_imported_email', '_imported_slug'
                        ],
                        next
                    );
                },
                function (usersData, next) {
                    var len = usersData.length;
                    usersData.forEach(function (user, index) {
                        if (user && user._imported_uid) {
                            content += '{'
                                + '"index":' + index + ','
                                + '"email":"' + user.email + '",'
                                + '"username":"' + user.username + '",'
                                + '"pwd":' + (user._imported_pwd ? '"' + user._imported_pwd + '"' : null) + ','
                                + '"_uid":' + user._imported_uid + ','
                                + '"uid":' + user.uid + ','
                                + '"joindate":' + user.joindate
                                + '}';
                            if (index !== len - 1) {
                                content += ',\n'
                            }
                        }
                    });
                    content += '\n]';
                    next(null, content);
                }
            ], callback);
        } else {
            callback({error: 'Cannot download files at the moment.'});
        }
    };

    Controller.getRedirectionJson = function(callback) {

        //precompile redirection templates
        Controller.redirectTemplates = {categories: {}, users: {}, topics: {}, posts: {}};
        Object.keys(Controller.config().redirectionTemplates || {}).forEach(function(key) {
            var model = Controller.config().redirectionTemplates[key];
            if (model && model.oldPath && model.newPath) {
                Controller.redirectTemplates[key].oldPath = _.template(model.oldPath);
                Controller.redirectTemplates[key].newPath = _.template(model.newPath);
            }
        });

        var content = '';
        if (Controller.canDownloadDeliverables()) {

            content += '{\n';
            async.series([
                function(done) {
                    if (Controller.redirectTemplates.users.oldPath && Controller.redirectTemplates.users.newPath) {
                        Controller.emit('redirection.templates.users.start');
                        async.waterfall([
                            function (next) {
                                DB.getObjectValues('username:uid', next);
                            },
                            function (uids, next) {
                                User.getMultipleUserFields(
                                    uids,
                                    [
                                        'uid', 'email', 'username', 'userslug',
                                        '_imported_uid', '_imported_username', '_imported_email', '_imported_slug'
                                    ],
                                    next
                                );
                            },
                            function (usersData, next) {
                                usersData.forEach(function (user) {
                                    if (user && user._imported_uid) {
                                        // map some aliases
                                        user._uid = user._imported_uid;
                                        user._username = user._imported_username;
                                        user._email = user._imported_email;
                                        user._slug = user._imported_slug;
                                        user._userslug = user._imported_slug;

                                        var oldPath = Controller.redirectTemplates.users.oldPath(user);
                                        var newPath = Controller.redirectTemplates.users.newPath(user);
                                        content += '"' + oldPath + '":"' + newPath + '",\n';
                                    }
                                });
                                Controller.emit('redirection.templates.users.done');
                                next();
                            }
                        ], done);
                    } else {
                        done();
                    }
                },
                function(done) {
                    if (Controller.redirectTemplates.categories.oldPath && Controller.redirectTemplates.categories.newPath) {
                        Controller.emit('redirection.templates.categories.start');

                        async.waterfall([
                            function (next) {
                                DB.getSortedSetRange('categories:cid', 0, -1, next);
                            },
                            function (cids, next) {
                                Categories.getCategoriesData(cids, function(err, categories) {
                                    categories.forEach(function(category) {
                                        if (category && category._imported_cid) {
                                            // map some aliases
                                            category._cid = category._imported_cid;
                                            category._slug = category._imported_slug;
                                            category._name = category._imported_name;
                                            category._link = category._imported_link;

                                            var oldPath = Controller.redirectTemplates.categories.oldPath(category);
                                            var newPath = Controller.redirectTemplates.categories.newPath(category);
                                            content += '"' + oldPath + '":"' + newPath + '",\n';
                                        }
                                    });
                                    Controller.emit('redirection.templates.categories.done');
                                    next();
                                });
                            }
                        ], done);
                    } else {
                        done();
                    }
                },
                function(done) {
                    if (Controller.redirectTemplates.topics.oldPath && Controller.redirectTemplates.topics.newPath) {
                        Controller.emit('redirection.templates.topics.start');
                        async.waterfall([
                            function (next) {
                                DB.getSortedSetRange('topics:tid', 0, -1, next);
                            },
                            function (tids, next) {
                                Topics.getTopicsData(tids, function(err, topics) {
                                    topics.forEach(function(topic) {
                                        if (topic && topic._imported_tid) {
                                            // map some aliases
                                            topic._uid = topic._imported_uid;
                                            topic._tid = topic._imported_tid;
                                            topic._cid = topic._imported_cid;
                                            topic._slug = topic._imported_slug;

                                            var oldPath = Controller.redirectTemplates.topics.oldPath(topic);
                                            var newPath = Controller.redirectTemplates.topics.newPath(topic);
                                            content += '"' + oldPath + '":"' + newPath + '",\n';
                                        }
                                    });
                                    Controller.emit('redirection.templates.topics.done');
                                    next();
                                });
                            }
                        ], done);
                    } else {
                        done();
                    }
                },
                function(done) {
                    if (Controller.redirectTemplates.posts.oldPath && Controller.redirectTemplates.posts.newPath) {
                        Controller.emit('redirection.templates.posts.start');
                        async.waterfall([
                            function (next) {
                                DB.getSortedSetRange('posts:tid', 0, -1, next);
                            },
                            function (pids, next) {
                                Posts.getPostsByPids(pids, function(err, posts) {
                                    posts.forEach(function(post) {
                                        if (post && post._imported_pid) {
                                            // map some aliases
                                            post._pid = post._imported_pid;
                                            post._uid = post._imported_uid;
                                            post._tid = post._imported_tid;

                                            var oldPath = Controller.redirectTemplates.posts.oldPath(post);
                                            var newPath = Controller.redirectTemplates.posts.newPath(post);
                                            content += '"' + oldPath + '":"' + newPath + '",\n';
                                        }
                                    });
                                    Controller.emit('redirection.templates.posts.done');
                                    next();
                                });
                            }
                        ], done);
                    } else {
                        done();
                    }
                }
            ], function(err, results) {
                if (err) {
                    return callback(err);
                }
                var lastCommaIdx = content.lastIndexOf(',');
                if (lastCommaIdx > -1) {
                    content = content.substring(0, lastCommaIdx);
                }
                content += '\n}';
                callback(null, content);
            });
        } else {
            callback({error: 'Cannot download files.'});
        }
    };

})(module.exports);
