
var fs = require('fs-extra'),
    lineReader = require('line-reader'),
    path = require('path'),
    _ = require('underscore'),
    async = require('async'),
    EventEmitter2 = require('eventemitter2').EventEmitter2,
    nodeExtend = require('node.extend'),
    noop = function(s){return s;},
    nextTick = function(cb) {
        setTimeout(cb, 0);
    },
    DB = module.parent.require('../../../src/database.js'),
    Meta = require('../../../src/meta.js'),
    User = require('../../../src/user.js'),
    Topics = require('../../../src/topics.js'),
    Posts = require('../../../src/posts.js'),
    Categories = require('../../../src/categories.js'),

    utils = require('../public/js/utils.js'),

    DELIVERABLES_TMP_DIR = path.join(__dirname, '/../public/tmp'),
    DELIVERABLES_TMP_URL = path.join('/plugins/nodebb-plugin-import/tmp'),

    LOG_FILE = path.join(__dirname, '/tmp/import.log'),
    LAST_IMPORT_TIMESTAMP_FILE = path.join(__dirname + '/tmp/lastimport'),
    CONVERT_BATCH_SIZE = 5,

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

    Controller.postImportToolsAvailble = function () {
        var state = Controller.state();
        return (!state || state.now === 'idle') && fs.existsSync(LAST_IMPORT_TIMESTAMP_FILE);
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

        fs.remove(LAST_IMPORT_TIMESTAMP_FILE, function(err) {
            fs.remove(LOG_FILE, function (err) {
                if (Controller.config('log').server) {
                    fs.ensureFile(LOG_FILE, function () {
                        start();
                    });
                } else {
                    start();
                }
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
            fs.writeFileSync(LAST_IMPORT_TIMESTAMP_FILE, +new Date(), {encoding: 'utf8'});
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

    // alias
    Controller.saveConfig = function(config, val) {
        return Controller.config(config, val);
    };

    Controller.config = function(config, val) {
        if (config != null) {
            if (typeof config === 'object') {
                utils.recursiveIteration(config);
                Controller._config = nodeExtend(true, {}, defaults, config);
                Controller.emit('controller.config', Controller._config);
            } else if (typeof config === 'string') {
                if (val != null) {
                    Controller._config = Controller._config || {};
                    Controller._config[config] = utils.resolveType(val);
                    Controller.emit('controller.config', Controller._config);
                }
                return Controller._config[config];
            }
        }
        return Controller._config;
    };

    Controller.setupConvert = function() {
        var cconf = Controller.config().contentConvert;

        var parseBefore = function(s) { return s;};
        if (cconf.parseBefore && cconf.parseBefore.enabled && cconf.parseBefore.js) {
            parseBefore = utils.buildFn(cconf.parseBefore.js);
        }

        var parseMain = function(s) { return s;};
        if (cconf.mainConvert && _.isFunction(Controller[cconf.mainConvert])) {
            parseMain = Controller[cconf.mainConvert];
        }

        var parseAfter = function(s) { return s;};
        if (cconf.parseAfter && cconf.parseAfter.enabled && cconf.parseAfter.js) {
            parseAfter = utils.buildFn(cconf.parseAfter.js);
        }

        Controller.convert = function(s) {
            s = s || '';
            return parseAfter(parseMain(parseBefore(s)));
        };
    };
    var window = require("jsdom").jsdom(null, null, {features: {FetchExternalResources: false}}).createWindow();
    var htmlMd = require('html-md-optional_window');
    // using my fork of html-md, we create the window via jsdom once at the top, then just pass the reference,
    // which will avoid jsdom.jsdom().createWindow() every time, much, much faster, and avoids memory leaks
    Controller['html-to-md'] = (function(window){
        var brRe = /<br\s*(\/)?>/gmi;
        return function(str){
            return htmlMd(str, {window: window}).replace(brRe, "\n");
        }
    })(window);

    Controller['bbcode-to-md'] = require('bbcode-to-markdown');

    Controller.convertAll = function(callback) {
        callback = _.isFunction(callback) ? callback : noop;

        var rconf = Controller.config().contentConvert.convertReconds;
        var _mainPids = {};

        Controller.setupConvert();

        if (Controller.postImportToolsAvailble()) {
            Controller.phase('convertStart');

            Controller.state({
                now: 'busy',
                event: 'controller.convertAll'
            });

            async.series([
                function(done) {
                    if (rconf.usersSignatures) {
                        Controller.phase('convertUsersStart');
                        async.waterfall([
                            function (next) {
                                DB.getObjectValues('username:uid', next);
                            },
                            function (uids, next) {
                                User.getMultipleUserFields(
                                    uids,
                                    [
                                        'uid', 'email', 'username', 'userslug',
                                        '_imported_uid', '_imported_username', '_imported_slug', '_imported_signature'
                                    ],
                                    next
                                );
                            },
                            function (users, next) {
                                var index = 0, len = users.length;
                                async.eachLimit(users, CONVERT_BATCH_SIZE, function(user, done) {
                                        Controller.progress(index++, len);
                                        if (user && user._imported_uid && user._imported_signature) {
                                            User.setUserField(
                                                user.uid,
                                                'signature',
                                                Controller.convert(utils.truncateStr(user._imported_signature, (Meta.config.maximumSignatureLength || 255) - 3)),
                                                next
                                            );
                                        } else {
                                            done();
                                        }
                                    },
                                    function() {
                                        Controller.phase('convertUsersDone');
                                        next();
                                    }
                                );
                            }
                        ], done);
                    } else {
                        done();
                    }
                },
                function(done) {
                    if (rconf.categoriesNames || rconf.categoriesDescriptions) {
                        Controller.phase('convertCategoriesStart');

                        async.waterfall([
                            function (next) {
                                DB.getSortedSetRange('categories:cid', 0, -1, next);
                            },
                            function (cids, next) {
                                Categories.getCategoriesData(cids, function(err, categories) {
                                    var index = 0, len = categories.length;
                                    async.eachLimit(categories, CONVERT_BATCH_SIZE, function(category, done) {
                                        Controller.progress(index++, len);
                                        if (category._imported_cid) {
                                            async.parallel([
                                                function(cb) {
                                                    if (rconf.categoriesNames && category._imported_name) {
                                                        DB.setObjectField('category:' + category.cid, 'name', Controller.convert(category._imported_name), cb);
                                                    } else {
                                                        cb();
                                                    }
                                                },
                                                function(cb) {
                                                    if (rconf.categoriesDescriptions && category._imported_description) {
                                                        DB.setObjectField('category:' + category.cid, 'description', Controller.convert(category._imported_description), cb);
                                                    } else {
                                                        cb();
                                                    }
                                                }
                                            ], done);
                                        } else {
                                            done();
                                        }
                                    }, function() {
                                        Controller.phase('convertCategoriesDone');
                                        next();
                                    });
                                });
                            }
                        ], done);
                    } else {
                        done();
                    }
                },
                function(done) {
                    if (rconf.topicsTitle || rconf.topicsContent || rconf.postsContent) {
                        Controller.phase('convertTopicsStart');

                        async.waterfall([
                            function (next) {
                                DB.getSortedSetRange('topics:tid', 0, -1, next);
                            },
                            function (tids, next) {
                                Topics.getTopicsData(tids, function(err, topics) {
                                    var index = 0, len = topics.length;
                                    async.eachLimit(topics, CONVERT_BATCH_SIZE, function(topic, done) {
                                        Controller.progress(index++, len);

                                        // cache mainPids anyways
                                        _mainPids[topic.mainPid] = 1;

                                        if (topic && (rconf.topicsTitle || rconf.topicsContent) && topic._imported_tid) {
                                            async.parallel([
                                                function(cb) {
                                                    if (rconf.topicsTitle && topic._imported_title) {
                                                        var title = Controller.convert(topic._imported_title);
                                                        DB.setObjectField('topic:' + topic.tid, 'title', title, function() {
                                                            if (err) return cb(err);
                                                            // DB.setObjectField('topic:' + topic.tid, 'slug', utils.slugify(title), cb);
                                                            cb();
                                                        });
                                                    } else {
                                                        cb();
                                                    }
                                                },
                                                function(cb) {
                                                    if (rconf.topicsContent && topic._imported_content) {
                                                        DB.setObjectField('post:' + topic.mainPid, 'content', Controller.convert(topic._imported_content), cb);
                                                    } else {
                                                        cb();
                                                    }
                                                }
                                            ], done);
                                        } else {
                                            done();
                                        }
                                    }, function() {
                                        Controller.phase('convertTopicsDone');
                                        next();
                                    });
                                });
                            }
                        ], done);
                    } else {
                        done();
                    }
                },
                function(done) {
                    if (rconf.postsContent) {
                        Controller.phase('convertPostsStart');

                        async.waterfall([
                            function (next) {
                                DB.getSortedSetRange('posts:pid', 0, -1, next);
                            },
                            function (pids, next) {
                                var keys = [];
                                for(var x=0, numPids=pids.length; x<numPids; ++x) {
                                    keys.push('post:' + pids[x]);
                                }
                                DB.getObjects(keys, function(err, posts) {
                                    var index = 0, len = posts.length;
                                    async.eachLimit(posts, CONVERT_BATCH_SIZE, function(post, done) {
                                        Controller.progress(index++, len);
                                        if (post && post._imported_pid && ! _mainPids[post.pid] && post._imported_content) {
                                            DB.setObjectField('post:' + post.pid, 'content', Controller.convert(post._imported_content), done);
                                        } else {
                                            done();
                                        }
                                    }, function() {
                                        Controller.phase('convertPostsDone');
                                        next();
                                    });
                                });
                            }
                        ], done);
                    } else {
                        done();
                    }
                }
            ], function(err, results) {
                Controller.phase('convertDone');
                if (err) {
                    Controller.state({
                        now: 'errored',
                        event: 'controller.convertError',
                        details: err
                    });
                    callback(err);
                } else {
                    Controller.state({
                        now: 'idle',
                        event: 'convert.done'
                    });
                    callback(null);
                }
            });
        } else {
            Controller.phase('convertDone');
            var err = {error: 'Cannot convert now.'};
            Controller.state({
                now: 'errored',
                event: 'controller.convertError',
                details: err
            });
            callback(err);
        }
    };

    Controller.phasePercentage = 0;

    Controller.progress = function(count, total, interval) {
        interval = interval || 2;
        var percentage = count / total * 100;
        if (percentage === 0 || percentage >= 100 || (percentage - Controller.phasePercentage > interval)) {
            Controller.phasePercentage = percentage;
            Controller.emit('controller.progress', {count: count, total: total, percentage: percentage});
        }
    };

    Controller.phase = function(phase, data) {
        Controller.phasePercentage = 0;
        Controller.emit('controller.phase', {phase: phase, data: data});
    };

    Controller.getUsersCsv = function(callback) {
        callback = _.isFunction(callback) ? callback : noop;

        Controller.phase('usersCsvStart');

        if (Controller.postImportToolsAvailble()) {
            Controller.state({
                now: 'busy',
                event: 'controller.getUsersCsv'
            });

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
                    var len = usersData.length;
                    usersData.forEach(function (user, index) {
                        if (user && user._imported_uid) {
                            content += index + ',' + user.email + ',' + user.username + ',' + user._imported_pwd + ',' + user._imported_uid + ',' + user.uid + ',' + user.joindate + '\n';
                        }

                        Controller.progress(index + 1, len);
                    });

                    next(null, content);
                }
            ], function(err, content) {
                Controller.phase('usersCsvDone');
                if (err) {
                    Controller.state({
                        now: 'errored',
                        event: 'controller.downloadError',
                        details: err
                    });
                    callback(err);
                } else {

                    var filename = 'users.csv';
                    var filepath = path.join(DELIVERABLES_TMP_DIR, '/' + filename);
                    var fileurl = DELIVERABLES_TMP_URL + '/' + filename;
                    var ret = {filename: filename, fileurl: fileurl, filepath: filepath};

                    fs.writeFile(filepath, content, 'utf-8', function() {
                        Controller.emit('controller.download', ret);
                        Controller.state({
                            now: 'idle',
                            event: 'controller.download'
                        });
                        callback(null, ret);
                    });
                }
            });
        } else {
            var err = {error: 'Cannot download file at the moment.'};
            Controller.state({
                now: 'errored',
                event: 'controller.downloadError',
                details: err
            });
            Controller.phase('usersCsvDone');
            callback(err);
        }
    };

    Controller.getUsersJson = function(callback) {
        callback = _.isFunction(callback) ? callback : noop;
        Controller.phase('usersJsonStart');

        if (Controller.postImportToolsAvailble()) {

            Controller.state({
                now: 'busy',
                event: 'controller.getUsersJson'
            });

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
                        Controller.progress(index + 1, len);
                    });
                    content += '\n]';
                    next(null, content);
                }
            ], function(err, content) {
                Controller.phase('usersJsonDone');
                if (err) {
                    Controller.state({
                        now: 'errored',
                        event: 'controller.downloadError',
                        details: err
                    });
                    callback(err);
                } else {

                    var filename = 'users.json';
                    var filepath = path.join(DELIVERABLES_TMP_DIR, '/' + filename);
                    var fileurl = DELIVERABLES_TMP_URL + '/' + filename;
                    var ret = {filename: filename, fileurl: fileurl, filepath: filepath};

                    fs.writeFile(filepath, content, 'utf-8', function() {
                        Controller.emit('controller.download', ret);
                        Controller.state({
                            now: 'idle',
                            event: 'controller.download'
                        });
                        callback(null, ret);
                    });
                }
            });
        } else {
            Controller.phase('usersJsonDone');
            var err = {error: 'Cannot download files at the moment.'};
            Controller.state({
                now: 'errored',
                event: 'controller.downloadError',
                details: err
            });
            callback(err);
        }
    };

    Controller.getRedirectionJson = function(callback) {
        callback = _.isFunction(callback) ? callback : noop;

        Controller.phase('redirectionMapStart');

        var _mainPids = {};

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
        if (Controller.postImportToolsAvailble()) {

            Controller.state({
                now: 'busy',
                event: 'controller.getRedirectionJson'
            });

            content += '{\n';
            async.series([
                function(done) {
                    if (Controller.redirectTemplates.users.oldPath && Controller.redirectTemplates.users.newPath) {
                        Controller.phase('redirectionMapUsersStart');
                        async.waterfall([
                            function (next) {
                                DB.getObjectValues('username:uid', next);
                            },
                            function (uids, next) {
                                User.getMultipleUserFields(
                                    uids,
                                    [
                                        'uid', 'email', 'username', 'userslug',
                                        '_imported_uid', '_imported_username', '_imported_slug', '_imported_signature'
                                    ],
                                    next
                                );
                            },
                            function (usersData, next) {
                                var len = usersData.length;
                                usersData.forEach(function (user, index) {
                                    if (user && user._imported_uid) {
                                        // map some aliases
                                        user._uid = user._imported_uid;
                                        user._username = user._imported_username;
                                        user._slug = user._imported_slug;
                                        user._userslug = user._imported_slug;

                                        var oldPath = Controller.redirectTemplates.users.oldPath(user);
                                        var newPath = Controller.redirectTemplates.users.newPath(user);
                                        content += '"' + oldPath + '":"' + newPath + '",\n';
                                    }
                                    Controller.progress(index + 1, len);
                                });
                                Controller.phase('redirectionMapUsersDone');
                                next();
                            }
                        ], done);
                    } else {
                        done();
                    }
                },
                function(done) {
                    if (Controller.redirectTemplates.categories.oldPath && Controller.redirectTemplates.categories.newPath) {
                        Controller.phase('redirectionMapCategoriesStart');
                        async.waterfall([
                            function (next) {
                                DB.getSortedSetRange('categories:cid', 0, -1, next);
                            },
                            function (cids, next) {
                                Categories.getCategoriesData(cids, function(err, categories) {
                                    var len = categories.length;
                                    categories.forEach(function(category, index) {
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
                                        Controller.progress(index + 1, len);
                                    });
                                    Controller.phase('redirectionMapCategoriesDone');
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
                        Controller.phase('redirectionMapTopicsStart');
                        async.waterfall([
                            function (next) {
                                DB.getSortedSetRange('topics:tid', 0, -1, next);
                            },
                            function (tids, next) {
                                Topics.getTopicsData(tids, function(err, topics) {
                                    var len = topics.length;
                                    topics.forEach(function(topic, index) {

                                        // cache mainPids
                                        _mainPids[topic.mainPid] = 1;

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
                                        Controller.progress(index + 1, len);
                                    });
                                    Controller.phase('redirectionMapTopicsDone');
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
                        Controller.phase('redirectionMapPostsStart');
                        async.waterfall([
                            function (next) {
                                DB.getSortedSetRange('posts:pid', 0, -1, next);
                            },
                            function (pids, next) {
                                var keys = [];
                                for(var x=0, numPids=pids.length; x<numPids; ++x) {
                                    keys.push('post:' + pids[x]);
                                }
                                DB.getObjects(keys, function(err, posts) {
                                    var len = posts.length;
                                    posts.forEach(function(post, index) {
                                        if (post && post._imported_pid && !_mainPids[post.pid] ) {
                                            // map some aliases
                                            post._pid = post._imported_pid;
                                            post._uid = post._imported_uid;
                                            post._tid = post._imported_tid;

                                            var oldPath = Controller.redirectTemplates.posts.oldPath(post);
                                            var newPath = Controller.redirectTemplates.posts.newPath(post);
                                            content += '"' + oldPath + '":"' + newPath + '",\n';
                                        }
                                        Controller.progress(index + 1, len);
                                    });
                                    Controller.phase('redirectionMapPostsDone');
                                    next();
                                });
                            }
                        ], done);
                    } else {
                        done();
                    }
                }
            ], function(err, results) {
                Controller.phase('redirectionMapDone');
                if (err) {
                    Controller.state({
                        now: 'errored',
                        event: 'controller.downloadError',
                        details: err
                    });
                    callback(err);
                } else {
                    var lastCommaIdx = content.lastIndexOf(',');
                    if (lastCommaIdx > -1) {
                        content = content.substring(0, lastCommaIdx);
                    }
                    content += '\n}';

                    var filename = 'redirect.map.json';
                    var filepath = path.join(DELIVERABLES_TMP_DIR, '/' + filename);
                    var fileurl = DELIVERABLES_TMP_URL + '/' + filename;
                    var ret = {filename: filename, fileurl: fileurl, filepath: filepath};

                    fs.writeFile(filepath, content, 'utf-8', function() {
                        Controller.emit('controller.download', ret);
                        Controller.state({
                            now: 'idle',
                            event: 'controller.download'
                        });
                        callback(null, ret);
                    });
                }
            });
        } else {
            Controller.phase('redirectionMapDone');
            var err = {error: 'Cannot download files.'};
            Controller.state({
                now: 'errored',
                event: 'controller.downloadError',
                details: err
            });
            callback(err);
        }
    };


    Controller.deleteExtraFields = function(callback) {

        callback = _.isFunction(callback) ? callback : noop;

        var _mainPids = {};
        Controller.phase('deleteExtraFieldsStart');

        if (Controller.postImportToolsAvailble()) {
            Controller.state({
                now: 'busy',
                event: 'controller.deleteExtraFields'
            });
            async.series([
                function(done) {
                    Controller.phase('deleteExtraFieldsUsersStart');
                    async.waterfall([
                        function (next) {
                            DB.getObjectValues('username:uid', next);
                        },
                        function (uids, next) {
                            User.getMultipleUserFields(
                                uids,
                                [
                                    'uid',
                                    '_imported_uid', '_imported_username', '_imported_slug', '_imported_signature'
                                ],
                                next
                            );
                        },
                        function (users, next) {
                            var index = 0, len = users.length;
                            async.eachLimit(users, CONVERT_BATCH_SIZE, function(user, done) {
                                    Controller.progress(index++, len);
                                    if (user && user._imported_uid) {
                                        async.parallel([
                                            function(cb) {
                                                DB.deleteObjectField('user:' + user.uid, '_imported_uid', cb);
                                            },
                                            function(cb) {
                                                DB.deleteObjectField('user:' + user.uid, '_imported_username', cb);
                                            },
                                            function(cb) {
                                                DB.deleteObjectField('user:' + user.uid, '_imported_slug', cb);
                                            },
                                            function(cb) {
                                                DB.deleteObjectField('user:' + user.uid, '_imported_signature', cb);
                                            }
                                        ], done);
                                    } else {
                                        done();
                                    }
                                },
                                function() {
                                    Controller.phase('deleteExtraFieldsUsersDone');
                                    next();
                                }
                            );
                        }
                    ], done);

                },
                function(done) {
                    Controller.phase('deleteExtraFieldsCategoriesStart');

                    async.waterfall([
                        function (next) {
                            DB.getSortedSetRange('categories:cid', 0, -1, next);
                        },
                        function (cids, next) {
                            Categories.getCategoriesData(cids, function(err, categories) {
                                var index = 0, len = categories.length;
                                async.eachLimit(categories, CONVERT_BATCH_SIZE, function(category, done) {
                                    Controller.progress(index++, len);
                                    if (category._imported_cid) {
                                        async.parallel([
                                            function(cb) {
                                                DB.deleteObjectField('category:' + category.cid, '_imported_cid', cb);
                                            },
                                            function(cb) {
                                                DB.deleteObjectField('category:' + category.cid, '_imported_name', cb);
                                            },
                                            function(cb) {
                                                DB.deleteObjectField('category:' + category.cid, '_imported_description', cb);
                                            },
                                            function(cb) {
                                                DB.deleteObjectField('category:' + category.cid, '_imported_slug', cb);
                                            },
                                            function(cb) {
                                                DB.deleteObjectField('category:' + category.cid, '_imported_link', cb);
                                            }
                                        ], done);
                                    } else {
                                        done();
                                    }
                                }, function() {
                                    Controller.phase('deleteExtraFieldsCategoriesDone');
                                    next();
                                });
                            });
                        }
                    ], done);

                },
                function(done) {
                    Controller.phase('deleteExtraFieldsTopicsStart');

                    async.waterfall([
                        function (next) {
                            DB.getSortedSetRange('topics:tid', 0, -1, next);
                        },
                        function (tids, next) {
                            Topics.getTopicsData(tids, function(err, topics) {
                                var index = 0, len = topics.length;
                                async.eachLimit(topics, CONVERT_BATCH_SIZE, function(topic, done) {
                                    Controller.progress(index++, len);
                                    if (topic && topic._imported_tid) {
                                        _mainPids[topic.mainPid] = 1;

                                        async.parallel([
                                            function(cb) {
                                                DB.deleteObjectField('topic:' + topic.tid, '_imported_tid', cb);
                                            },
                                            function(cb) {
                                                DB.deleteObjectField('topic:' + topic.tid, '_imported_cid', cb);
                                            },
                                            function(cb) {
                                                DB.deleteObjectField('topic:' + topic.tid, '_imported_uid', cb);
                                            },
                                            function(cb) {
                                                DB.deleteObjectField('topic:' + topic.tid, '_imported_slug', cb);
                                            },
                                            function(cb) {
                                                DB.deleteObjectField('topic:' + topic.tid, '_imported_title', cb);
                                            },
                                            function(cb) {
                                                DB.deleteObjectField('topic:' + topic.tid, '_imported_content', cb);
                                            }
                                        ], done);
                                    } else {
                                        done();
                                    }
                                }, function() {
                                    Controller.phase('deleteExtraFieldsTopicsDone');
                                    next();
                                });
                            });
                        }
                    ], done);
                },
                function(done) {
                    Controller.phase('deleteExtraFieldsPostsStart');

                    async.waterfall([
                        function (next) {
                            DB.getSortedSetRange('posts:pid', 0, -1, next);
                        },
                        function (pids, next) {
                            var keys = [];
                            for(var x=0, numPids=pids.length; x<numPids; ++x) {
                                keys.push('post:' + pids[x]);
                            }
                            DB.getObjects(keys, function(err, posts) {
                                var index = 0, len = posts.length;
                                async.eachLimit(posts, CONVERT_BATCH_SIZE, function(post, done) {
                                    Controller.progress(index++, len);
                                    if (post && post._imported_pid) {
                                        async.parallel([
                                            function(cb) {
                                                DB.deleteObjectField('post:' + post.pid, '_imported_pid', cb);
                                            },
                                            function(cb) {
                                                DB.deleteObjectField('post:' + post.pid, '_imported_tid', cb);
                                            },
                                            function(cb) {
                                                DB.deleteObjectField('post:' + post.pid, '_imported_uid', cb);
                                            },
                                            function(cb) {
                                                DB.deleteObjectField('post:' + post.pid, '_imported_content', cb);
                                            }
                                        ], done);
                                    } else {
                                        done();
                                    }
                                }, function() {
                                    Controller.phase('deleteExtraFieldsPostsDone');
                                    next();
                                });
                            });
                        }
                    ], done);

                }
            ], function(err, results) {
                Controller.phase('deleteExtraFieldsDone');
                if (err) {
                    Controller.state({
                        now: 'errored',
                        event: 'controller.deletingExtraFieldsError',
                        details: err
                    });
                    callback(err);
                } else {
                    fs.remove(LAST_IMPORT_TIMESTAMP_FILE, function(err) {
                        Controller.state({
                            now: 'idle',
                            event: 'delete.done'
                        });
                        callback(null);
                    });
                }
            });
        } else {
            Controller.phase('deleteExtraFieldsDone');
            var err = {error: 'Cannot delete now.'};
            Controller.state({
                now: 'errored',
                event: 'controller.deletingExtraFieldsError',
                details: err
            });
            callback(err);
        }
    };

})(module.exports);
