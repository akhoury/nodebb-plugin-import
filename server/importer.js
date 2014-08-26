var async = require('async'),
    EventEmitter2 = require('eventemitter2').EventEmitter2,

    _ = require('underscore'),
    window = require("jsdom").jsdom(null, null, {features: {FetchExternalResources: false}}).createWindow(),
    htmlMd = require('html-md-optional_window'),
    $ = require('jQuery')(window),
    fs = require('fs-extra'),

    utils = require('../../../public/src/utils.js'),

    Group = require('../../../src/groups.js'),
    Meta = require('../../../src/meta.js'),
    User = require('../../../src/user.js'),
    Topics = require('../../../src/topics.js'),
    Posts = require('../../../src/posts.js'),
    Categories = require('../../../src/categories.js'),
    DB = module.parent.require('../../../src/database.js'),

    nextTick = function(cb) {
        setTimeout(cb, 0);
    },

    logPrefix = '[nodebb-plugin-import]',

    backupConfigFilepath = __dirname + '/tmp/importer.nbb.backedConfig.json',

    defaults = {
        convert: null,
        passwordGen: {
            enabled: false,
            chars: '{}.-_=+qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM1234567890',
            len: 13
        },
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
        },
        categoriesTextColors: ['#FFFFFF'],
        categoriesBgColors: ['#ab1290','#004c66','#0059b2'],
        categoriesIcons: ['fa-comment'],
        autoConfirmEmails: true,
        userReputationMultiplier: 1,
        nbbTmpConfig: {
            postDelay: 0,
            minimumPostLength: 1,
            minimumPasswordLength: 0,
            minimumTitleLength: 1,
            maximumTitleLength: 300,
            maximumUsernameLength: 100,
            allowGuestPosting: 1
        }
    };

(function(Importer) {

    Importer._dispatcher = new EventEmitter2({
        wildcard: true
    });

    Importer.init = function(data, config, callback) {
        Importer.setup(data, config, callback);
    };

    Importer.setup = function(data, config, callback) {

        Importer.emit('importer.setup.start');

        Importer._config = $.extend(true, {}, defaults, config && config.importer ? config.importer : config || {});

        Importer.data = data || {};
        Importer.data.users = Importer.data.users || {};
        Importer.data.users._uids = Object.keys(Importer.data.users);

        Importer.data.categories = Importer.data.categories || {};
        Importer.data.categories._cids = Object.keys(Importer.data.categories);

        Importer.data.topics = Importer.data.topics || {};
        Importer.data.topics._tids = Object.keys(Importer.data.topics);

        Importer.data.posts = Importer.data.posts || {};
        Importer.data.posts._pids = Object.keys(Importer.data.posts);

        //precompile redirection templates
        Importer.redirectTemplates = {categories: {}, users: {}, topics: {}, posts: {}};
        Object.keys(Importer.config().redirectionTemplates || {}).forEach(function(key) {
            var model = Importer.config().redirectionTemplates[key];
            if (model && model.oldPath && model.newPath) {
                Importer.redirectTemplates[key].oldPath = _.template(model.oldPath);
                Importer.redirectTemplates[key].newPath = _.template(model.newPath);
            }
        });

        // setup conversion template
        Importer.convert = (function() {
            var fnNames = [];
            (Importer.config().convert || '').split(',').forEach(function(fnName) {
                fnName = fnName.trim();
                if (typeof Importer[fnName] === 'function') {
                    fnNames.push(fnName);
                }
            });
            return function(s) {
                fnNames.forEach(function(fnName) {
                    s = Importer[fnName](s);
                });
                return s;
            };
        })();

        Importer.DBKeys = (function() {
            return DB.helpers.redis ? // if redis
                function(key, callback) {
                    return DB.client.keys(key, callback);
                }
                // if mongo
                : DB.helpers.mongo ?
                function(key, callback) {
                    DB.client.collection('objects').find( { _key: { $regex: key.replace(/\*/, '.*') } }, function(err, result) {
                        if (err) {
                            callback(err);
                        } else {
                            result.toArray(function(err, arr) {
                                if (err) {
                                    callback(err);
                                }
                                callback(err, !err && arr && arr[0] ?
                                    Object.keys(arr[0]).map(function(v) {
                                        return key.replace(/\*/, v).replace(/\uff0E/g, '.');
                                    }) : []);
                            });
                        }
                    });
                }
                // if leveldb, keys not supported yet
                : null;
        })();

        Importer.emit('importer.setup.done');
        Importer.emit('importer.ready');
        if (_.isFunction(callback)) {
            callback();
        }
    };

    Importer.start = function(callback) {
        Importer.emit('importer.start');
        async.series([
            Importer.flushData,
            Importer.backupConfig,
            Importer.setTmpConfig,
            Importer.importUsers,
            Importer.importCategories,
            Importer.importTopics,
            Importer.importPosts,
            Importer.relockUnlockedTopics,
            Importer.restoreConfig,
            Importer.teardown
        ], callback);
    };

    Importer.flushData = function(next) {
        Importer.log('importer.purge.start');
        async.series([
            function(next){
                Importer.log('importer.purge.categories-topics-posts.start');
                DB.getSortedSetRange('categories:cid', 0, -1, function(err, cids){
                    async.eachLimit(cids || [], 5, function(cid, done) {
                            Categories.purge(cid, done);
                        },
                        function(){
                            Importer.log('importer.purge.categories-topics-posts.done');
                            next();
                        }
                    );
                });
            },
            function(next) {
                Importer.log('importer.purge.users.start');
                DB.getSortedSetRange('users:joindate', 0, -1, function(err, uids) {
                    async.eachLimit(uids || [], 5, function(uid, done) {
                            if (parseInt(uid, 10) !== 1) {
                                User.delete(uid, done);
                            } else {
                                done();
                            }
                        },
                        function(){
                            Importer.log('importer.purge.users.done');
                            next();
                        }
                    );
                });

            },
            function(next) {
                Importer.log('importer.purge.reset.globals.start');
                async.parallel([
                    function(done) {
                        DB.setObjectField('global', 'nextUid', 1, done);
                    },
                    function(done) {
                        DB.setObjectField('global', 'userCount', 1, done);
                    },
                    function(done) {
                        DB.setObjectField('global', 'nextCid', 1, done);
                    },
                    function(done) {
                        DB.setObjectField('global', 'categoryCount', 1, done);
                    },
                    function(done) {
                        DB.setObjectField('global', 'nextTid', 1, done);
                    },
                    function(done) {
                        DB.setObjectField('global', 'topicCount', 1, done);
                    },
                    function(done) {
                        DB.setObjectField('global', 'nextPid', 1, done);
                    },
                    function(done) {
                        DB.setObjectField('global', 'postCount', 1, done);
                    }
                ], function() {
                    Importer.log('importer.purge.reset.globals.end');
                    next();
                });
            }
        ], function(err) {
            if (err) {
                Importer.error(err);
                throw err;
            }
            Importer.log('importer.purge.done');
            next();
        });
    };

    Importer.importUsers = function(next) {
        Importer.emit('importer.users.start');
        var count = 0,
            imported = 0,
            config = Importer.config(),
            startTime = +new Date(),
            passwordGen = config.passwordGen.enabled ?
                function() {
                    return Importer.genRandPwd(config.passwordGen.len, config.passwordGen.chars);
                } :
                function() {
                    // undefined, no password
                },
            users = Importer.data.users;

        async.eachLimit(users._uids, 10, function(_uid, done) {
            count++;

            var user = users[_uid];

            var u = Importer.makeValidNbbUsername(user._username || '', user._alternativeUsername || '');

            var userData = {
                username: u.username,
                email: user._email,
                password: user._password || passwordGen()
            };

            if (!userData.username) {
                Importer.warn('[count:' + count + '] skipping user: "' + user._username + '" username is invalid.');
                nextTick(done);
            } else {
                Importer.log('[count: ' + count + '] saving user:_uid: ' + _uid);

                User.create(userData, function(err, uid) {
                    if (err) {
                        Importer.warn('skipping username: "' + user.username + '" ' + err);
                        nextTick(done);
                    } else {
                        user.imported = true;
                        imported++;

                        if (('' + user._level).toLowerCase() == 'moderator') {
                            Importer.makeModeratorOnAllCategories(uid);
                            Importer.warn(userData.username + ' just became a moderator on all categories');
                        } else if (('' + user._level).toLowerCase() == 'administrator') {
                            Group.join('administrators', uid, function(){
                                Importer.warn(userData.username + ' became an Administrator');
                            });
                        }

                        var fields = {
                            // preseve the signature, but Nodebb allows a max of 255 chars, so i truncate with an '...' at the end
                            signature: Importer.convert(Importer.truncateStr(user._signature || '', 252)),
                            website: user._website || '',
                            banned: user._banned ? 1 : 0,
                            location: user._location || '',
                            joindate: user._joindate || startTime,
                            reputation: (user._reputation || 0) * config.userReputationMultiplier,
                            profileviews: user._profileViews || 0,
                            fullname: user._fullname || '',
                            birthday: user._birthday || '',
                            showemail: user._showemail ? 1 : 0,
                            // this is a migration script, no one is online
                            status: 'offline'
                        };

                        var keptPicture = false;
                        if (user._picture) {
                            fields.gravatarpicture = user._picture;
                            fields.picture = user._picture;
                            keptPicture = true;
                        }

                        Importer.log('[user-json] {"email":"' + userData.email + '","username":"' + userData.username + '","pwd":"' + userData.password + '",_uid":' + _uid + ',"uid":' + uid +',"ms":' + fields.joindate + '},');
                        Importer.log('[user-csv] ' + userData.email + ',' + userData.username + ',' + userData.password + ',' + _uid + ',' + uid + ',' + fields.joindate);

                        User.setUserFields(uid, fields, function(err, result) {
                            if (err) { done(err); throw err; }

                            fields.uid = uid;

                            user = $.extend(true, {}, user, fields);
                            user.keptPicture = keptPicture;
                            user.userslug = u.userslug;

                            var oldPath = Importer.redirectTemplates.users.oldPath;
                            var newPath = Importer.redirectTemplates.users.newPath;
                            if (oldPath && newPath) {
                                user.redirect = Importer.redirect(user, oldPath, newPath);
                            }

                            users[_uid] = user;

                            if (config.autoConfirmEmails) {
                                DB.setObjectField('email:confirmed', user.email, '1', function() {
                                    nextTick(done);
                                });
                            } else {
                                nextTick(done);
                            }
                        });
                    }
                });
            }
        }, function(err) {
            if (err) {
                throw err;
            }

            Importer.log('Importing ' + imported + '/' + users._uids.length + ' users took: ' + ((+new Date() - startTime)/1000).toFixed(2) + ' seconds');

            if (config.autoConfirmEmails && Importer.DBkeys) {
                async.parallel([
                    function(done){
                        Importer.DBkeys('confirm:*', function(err, keys){
                            keys.forEach(function(key){
                                DB.delete(key);
                            });
                            done();
                        });
                    },
                    function(done){
                        Importer.DBkeys('email:*:confirm', function(err, keys){
                            keys.forEach(function(key){
                                DB.delete(key);
                            });
                            done();
                        });
                    }
                ], function() {
                    Importer.emit('importer.users.done');
                    next();
                });
            } else {
                Importer.emit('importer.users.done');
                next();
            }
        });
    };

    Importer.importCategories = function(next) {
        Importer.emit('importer.categories.start');
        var count = 0,
            imported = 0,
            startTime = +new Date(),
            config = Importer.config(),
            categories = Importer.data.categories;

        async.eachLimit(categories._cids, 10, function(_cid, done) {
            count++;

            var category = categories[_cid];

            Importer.log('[count:' + count + '] saving category:_cid: ' + _cid);

            var categoryData = {
                name: category._name || ('Category ' + (count + 1)),
                description: category._description || 'no description available',

                // you can fix the order later, nbb/admin
                order: category._order || count + 1,

                disabled: category._disabled || 0,

                link: category._link || 0,

                // roulette, that too,
                icon: config.categoriesIcons[Math.floor(Math.random() * config.categoriesIcons.length)],
                bgColor: config.categoriesBgColors[Math.floor(Math.random() * config.categoriesBgColors.length)],
                color: config.categoriesTextColors[Math.floor(Math.random() * config.categoriesTextColors.length)]
            };

            Categories.create(categoryData, function(err, categoryReturn) {
                if (err) {
                    Importer.warn('skipping category:_cid: ' + _cid + ' : ' + err);
                    nextTick(done);
                } else {
                    category.imported = true;
                    imported++;
                    category = $.extend(true, {}, category, categoryReturn);

                    var oldPath = Importer.redirectTemplates.categories.oldPath;
                    var newPath = Importer.redirectTemplates.categories.newPath;
                    if (oldPath && newPath) {
                        category.redirect = Importer.redirect(category, oldPath, newPath);
                    }

                    categories[_cid] = category;
                    nextTick(done);
                }
            });

        }, function(err) {
            if (err) {
                throw err;
            }
            Importer.log('Importing ' + imported + '/' + categories._cids.length + ' categories took: ' + ((+new Date()-startTime)/1000).toFixed(2) + ' seconds');
            Importer.emit('importer.categories.done');
            next();
        });
    };

    Importer.importTopics = function(next) {
        Importer.emit('importer.topics.start');
        var count = 0,
            imported = 0,
            startTime = +new Date(),
            config = Importer.config(),
            users = Importer.data.users,
            categories = Importer.data.categories,
            topics = Importer.data.topics;

        async.eachLimit(topics._tids, 10, function(_tid, done) {
            count++;

            var topic = topics[_tid];
            var category = categories[topic._cid];
            var user = users[topic._uid] || {};

            if (!category || !category.imported) {
                Importer.warn('[count:' + count + '] skipping topic:_tid:"'
                    + _tid + '" --> _cid: ' + topic._cid + ':imported:' + !!(category && category.imported));

                nextTick(done);
            } else {
                Importer.log('[count:' + count + '] saving topic:_tid: ' + _tid);

                Topics.post({
                    uid: user.uid,
                    title: topic._title,
                    content: Importer.convert(topic._content),
                    cid: category.cid,
                    thumb: topic._thumb
                }, function(err, returnTopic){
                    if (err) {
                        Importer.warn('skipping topic:_tid: ' + _tid + ' ' + err);
                        nextTick(done);
                    } else {

                        topic.imported = true;
                        imported++;

                        var timestamp = topic._timestamp || startTime;
                        var relativeTime = new Date(timestamp).toISOString();

                        var topicFields = {
                            viewcount: topic._viewcount || 0,

                            // assume that this topic not locked for now, but will iterate back again at the end and lock it back after finishing the importPosts()
                            // locked: normalizedTopic._locked ? 1 : 0,
                            locked: 0,

                            deleted: topic._deleted ? 1 : 0,

                            // if pinned, we should set the db.sortedSetAdd('categories:' + cid + ':tid', Math.pow(2, 53), tid);
                            pinned: topic._pinned ? 1 : 0,
                            timestamp: timestamp,
                            lastposttime: timestamp,

                            // todo: not sure if I need these two
                            teaser_timestamp: relativeTime,
                            relativeTime: relativeTime
                        };

                        var postFields = {
                            timestamp: timestamp,
                            // todo: not sure if I need this
                            relativeTime: relativeTime
                        };

                        // pinned = 1 not enough to float the topic to the top in it's category
                        if (topicFields.pinned) {
                            DB.sortedSetAdd('categories:' + category.cid + ':tid', Math.pow(2, 53), returnTopic.topicData.tid);
                        }

                        DB.setObject('topic:' + returnTopic.topicData.tid, topicFields, function(err, result) {

                            if (err) { done(err); throw err; }

                            Posts.setPostFields(returnTopic.postData.pid, postFields, function(){
                                topic = $.extend(true, {}, topic, topicFields, returnTopic.topicData);

                                var oldPath = Importer.redirectTemplates.topics.oldPath;
                                var newPath = Importer.redirectTemplates.topics.newPath;

                                if (oldPath && newPath) {
                                    topic.redirect = Importer.redirect(topic, oldPath, newPath);
                                }

                                topics[_tid] = topic;
                                nextTick(done);
                            });
                        });
                    }
                });
            }
        }, function(err) {
            if (err) {
                throw err;
            }
            Importer.log('Importing ' + imported + '/' + topics._tids.length + ' topics took: ' + ((+new Date()-startTime)/1000).toFixed(2) + ' seconds');
            Importer.emit('importer.topics.done');
            next();
        });
    };

    Importer.importPosts = function(next) {
        Importer.emit('importer.posts.start');
        var count = 0,
            imported = 0,
            startTime = +new Date(),
            config = Importer.config(),
            users = Importer.data.users,
            topics = Importer.data.topics,
            posts = Importer.data.posts;

        async.eachLimit(posts._pids, 10, function(_pid, done) {
            count++;

            var post = posts[_pid];
            var topic = topics[post._tid];
            var user = users[post._uid] || {};

            if (!topic || !topic.imported) {
                Importer.warn('skipping post:_pid: ' + _pid + ' _tid:valid: ' + !!(topic && topic.imported));
                nextTick(done);
            } else {

                Importer.log('[count: ' + count + '] saving post: ' + _pid);

                Posts.create({
                    uid: user.uid,
                    tid: topic.tid,
                    content: Importer.convert(post._content || ''),

                    // i seriously doubt you have this, but it's ok if you don't
                    toPid: post['_nbb-toPid']

                }, function(err, postReturn){
                    if (err) {
                        Importer.warn('skipping post: ' + post._pid + ' ' + err);
                        nextTick(done);
                    } else {

                        post.imported = true;
                        imported++;

                        var fields = {
                            timestamp: post._timestamp || startTime,
                            reputation: post._reputation || 0,
                            votes: post._votes || 0,
                            edited: post._edited || 0,
                            deleted: post._deleted || 0,

                            // todo: not sure if I need this
                            relativeTime: new Date(post._timestamp || startTime).toISOString()
                        };
                        Posts.setPostFields(postReturn.pid, fields, function(){

                            post = $.extend(true, {}, post, fields, postReturn);
                            post.imported = true;

                            var oldPath = Importer.redirectTemplates.posts.oldPath;
                            var newPath = Importer.redirectTemplates.posts.newPath;
                            if (oldPath && newPath) {
                                post.redirect = Importer.redirect(post, oldPath, newPath);
                            }

                            posts[_pid] = post;
                            nextTick(done);
                        });
                    }
                });
            }
        }, function(){
            Importer.log('Importing ' + imported + '/' + posts._pids.length + ' posts took: ' + ((+new Date() - startTime)/1000).toFixed(2) + ' seconds');
            Importer.emit('importer.posts.done');
            next();
        });
    };

    Importer.teardown = function(next) {
        Importer.emit('importer.teardown.start');

        Importer.emit('importer.teardown.done');
        Importer.emit('importer.complete');

        Importer.log('Importer completed');
        next();
    };

    Importer.relockUnlockedTopics = function(next) {
        var count = 0,
            startTime = +new Date();

        async.eachLimit(Importer.data.topics._tids, 5, function(_tid, done) {
            count++;

            var topic = Importer.data.topics[_tid];
            if (!topic) {
                Importer.warn('[count:' + count + '] imported topic:_tid: ' + _tid + ' doesn\'t exist in storage, probably skipped some time earlier');
                nextTick(done);
            } else {
                if (topic._locked) {
                    DB.setObjectField('topic:' + topic.tid, 'locked', '1', function(err) {
                        if (err) {
                            Importer.warn(err);
                        } else {
                            Importer.log('[count: ' + count + '] locked topic:' + topic.tid + ' back');
                        }
                        nextTick(done);
                    });
                } else {
                    nextTick(done);
                }
            }
        }, function(err) {
            if (err) throw err;

            Importer.log('Relocking ' + Importer.data.topics._tids.length + ' topics took: ' + ((+new Date()-startTime)/1000).toFixed(2) + ' seconds');
            next();
        });
    };

    Importer.backupConfig = function(next) {
        DB.getObject('config', function(err, data) {
            if (err) throw err;
            Importer.config('backedConfig', data || {});
            if (!fs.existsSync(backupConfigFilepath)) {
                fs.outputJsonSync(backupConfigFilepath, Importer.config().backedConfig);
            }
            next();
        });
    };

    Importer.setTmpConfig = function(next) {
        // get the nbb backedConfigs, change them, then set them back to the db
        // just to make the transition a little less flexible
        // yea.. i dont know .. i have a bad feeling about this
        var config = $.extend(true, {}, Importer.config().backedConfig, Importer.config().nbbTmpConfig);

        // if you want to auto confirm email, set the host to null, if there is any
        // this will prevent User.sendConfirmationEmail from setting expiration time on the email address
        // per https://github.com/designcreateplay/NodeBB/blob/master/src/user.js#L458'ish
        if (Importer.config().autoConfirmEmails) {
            config['email:smtp:host'] = '';
        }

        DB.setObject('config', config, function(err){
            if (err) throw err;
            next();
        });
    };

    // im nice
    Importer.restoreConfig = function(next) {
        Importer.config('backedConfig', fs.readJsonFileSync(backupConfigFilepath));
        DB.setObject('config', Importer.config().backedConfig, function(err){
            if (err) {
                Importer.warn('Something went wrong while restoring your nbb configs');
                Importer.warn('here are your backed-up configs, you do it.');
                Importer.warn(JSON.stringify(Importer.config().backedConfig));
            }

            Importer.log('Config restored:' + JSON.stringify(Importer.config().backedConfig));
            next();
        });
    };

    // using my fork of html-md, we create the window via jsdom once at the top, then just pass the reference,
    // which will avoid jsdom.jsdom().createWindow() every time, much, much faster, and avoids memory leaks
    Importer['html-to-md'] = (function(window){
        var brRe = /<br\s*(\/)?>/gmi;
        return function(str){
            return htmlMd(str, {window: window}).replace(brRe, "\n");
        }
    })(window);

    Importer['bbcode-to-md'] = require('bbcode-to-markdown');

    // aka forums
    Importer.makeModeratorOnAllCategories = function(uid) {
        Importer.data.categories._cids.forEach(function(cid) {
            var category = Importer.data.categories[cid];
            if (category) {
                Group.join('group:cid:' + cid + ':privileges:mods:members', uid, function(err){
                    if (err) {
                        Importer.warn(err);
                    }
                });
            }
        });
    };

    Importer.redirect = function(data, oldPath, newPath) {
        var o = oldPath(data);
        var n = newPath(data);

        //todo: save them somewhere more than the just logs
        // that'll make them for a quick json map
        // gotta replace the [redirect] though
        Importer.log('[redirect] "' + o + '":"' + n +'",');
        return {oldPath: o, newPath: n};
    };

    // which of the values is falsy
    Importer.whichIsFalsy = function(arr){
        for (var i = 0; i < arr.length; i++) {
            if (!arr[i])
                return i;
        }
        return null;
    };

    // a helper method to generate temporary passwords
    Importer.genRandPwd = function(len, chars) {
        var index = (Math.random() * (chars.length - 1)).toFixed(0);
        return len > 0 ? chars[index] + Importer.genRandPwd(len - 1, chars) : '';
    };

    Importer.truncateStr = function (str, len) {
        if (typeof str != 'string') return str;
        len = Importer.isNumber(len) && len > 3 ? len : 20;
        return str.length <= len ? str : str.substr(0, len - 3) + '...';
    };

    Importer.isNumber  = function (n) {
        return !isNaN(parseFloat(n)) && isFinite(n);
    };

    // todo: i think I got that right?
    Importer.cleanUsername = function(str) {
        str = str.replace(/[^\u00BF-\u1FFF\u2C00-\uD7FF\-.*\w\s]/gi, '');
        // todo: i don't know what I'm doing HALP
        return str.replace(/ /g,'').replace(/\*/g, '').replace(/æ/g, '').replace(/ø/g, '').replace(/å/g, '');
    };

    // todo: holy fuck clean this shit
    Importer.makeValidNbbUsername = function(_username, _alternativeUsername) {
        var _userslug = utils.slugify(_username || '');

        if (utils.isUserNameValid(_username) && _userslug) {
            return {username: _username, userslug: _userslug};

        } else {
            var username = Importer.cleanUsername(_username);
            var userslug = utils.slugify(username);

            if (utils.isUserNameValid(username) && userslug) {
                return {username: username, userslug: userslug};

            } else if (_alternativeUsername) {

                var _alternativeUsernameSlug = utils.slugify(_alternativeUsername);

                if (utils.isUserNameValid(_alternativeUsername) && _alternativeUsernameSlug) {
                    return {username: _alternativeUsername, userslug: _alternativeUsernameSlug};

                } else {

                    var alternativeUsername = Importer.cleanUsername(_alternativeUsername);
                    var alternativeUsernameSlug = utils.slugify(alternativeUsername);

                    if (utils.isUserNameValid(alternativeUsername) && alternativeUsernameSlug) {
                        return {username: alternativeUsername, userslug: alternativeUsernameSlug};
                    } else {
                        return {username: null, userslug: null};
                    }
                }
            } else {
                return {username: null, userslug: null};
            }
        }
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

    Importer.warn = function() {
        var args = _.toArray(arguments);
        args.unshift('importer.warn');
        Importer.emit.apply(Importer, args);
        args.unshift(logPrefix);
        console.warn.apply(console, args);
    };

    Importer.log = function() {
        var args = _.toArray(arguments);
        args.unshift('importer.log');
        Importer.emit.apply(Importer, args);
        args.unshift(logPrefix);
        console.log.apply(console, args);
    };

    Importer.error = function() {
        var args = _.toArray(arguments);
        args.unshift('importer.error');
        Importer.emit.apply(Importer, args);
        args.unshift(logPrefix);
        console.error.apply(console, args);
    };

    Importer.config = function(config, val) {
        if (config != null) {
            if (typeof config === 'object') {
                Importer._config = config;
            } else if (typeof config === 'string') {
                if (val != null) {
                    Importer._config = Importer._config || {};
                    Importer._config[config] = val;
                }
                return Importer._config[config];
            }
        }
        return Importer._config;
    };

})(module.exports);