var async = require('async'),
    EventEmitter2 = require('eventemitter2').EventEmitter2,
    _ = require('underscore'),
    nodeExtend = require('node.extend'),
    fs = require('fs-extra'),
    path = require('path'),

    utils = require('../public/js/utils.js'),
    Data = require('./data.js'),

    Groups = require('../../../src/groups.js'),
    privileges = require('../../../src/privileges.js'),
    Meta = require('../../../src/meta.js'),
    User = require('../../../src/user.js'),
    Topics = require('../../../src/topics.js'),
    Posts = require('../../../src/posts.js'),
    Categories = require('../../../src/categories.js'),
    db = module.parent.require('../../../src/database.js'),

    IMPORT_BATCH_SIZE = 10,
    FLUSH_BATCH_SIZE = 10,

//todo use the real one
    LOGGEDIN_UID = 1,

    logPrefix = '[nodebb-plugin-import]',

    BACKUP_CONFIG_FILE = path.join(__dirname, '/tmp/importer.nbb.backedConfig.json'),

    DIRTY_USERS_FILE = path.join(__dirname, '/tmp/importer.dirty.users'),
    DIRTY_CATEGORIES_FILE = path.join(__dirname, '/tmp/importer.dirty.categories'),
    DIRTY_TOPICS_FILE = path.join(__dirname, '/tmp/importer.dirty.topics'),
    DIRTY_POSTS_FILE = path.join(__dirname, '/tmp/importer.dirty.posts'),

    areUsersDirty,
    areCategoriesDirty,
    areTopicsDirty,
    arePostsDirty,

    isAnythingDirty,

    alreadyImportedAllUsers = false,
    alreadyImportedAllCategories = false,
    alreadyImportedAllTopics = false,
    alreadyImportedAllPosts = false,

    flushed = false,

    defaults = {
        log: true,
        passwordGen: {
            enabled: false,
            chars: '{}.-_=+qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM1234567890',
            len: 13
        },
        categoriesTextColors: ['#FFFFFF'],
        categoriesBgColors: ['#ab1290','#004c66','#0059b2'],
        categoriesIcons: ['fa-comment'],
        autoConfirmEmails: true,
        userReputationMultiplier: 1,

        adminTakeOwnership: {
            enable: false,
            _username: null,
            _uid: null
        },

        nbbTmpConfig: {
            postDelay: 0,
            initialPostDelay: 0,
            newbiePostDelay: 0,
            minimumPostLength: 1,
            minimumPasswordLength: 0,
            minimumTitleLength: 0,
            maximumTitleLength: 2000,
            maximumUsernameLength: 100,
            requireEmailConfirmation: 0,
            allowGuestPosting: 1
        }
    };

(function(Importer) {

    Importer._dispatcher = new EventEmitter2({
        wildcard: true
    });

    Importer.init = function(exporter, config, callback) {
        Importer.setup(exporter, config, callback);
    };

    Importer.setup = function(exporter, config, callback) {
        Importer.exporter = exporter;

        Importer._config = nodeExtend(true, {}, defaults, config && config.importer ? config.importer : config || {});

        //todo I don't like this
        Importer._config.serverLog = !!config.log.server;
        Importer._config.clientLog = !!config.log.client;
        Importer._config.verbose = !!config.log.verbose;

        Importer.emit('importer.setup.start');

        Importer.dbKeys = (function() {
            return db.helpers.redis ? // if redis
                function(key, callback) {
                    return db.client.keys(key, callback);
                }
                // if mongo
                : db.helpers.mongo ?
                function(key, callback) {
                    db.client.collection('objects').find( { _key: { $regex: key.replace(/\*/, '.*') } }, function(err, result) {
                        if (err) {
                            return callback(err);
                        }
                        result.toArray(function(err, arr) {
                            if (err) {
                                return callback(err);
                            }
                            callback(null, !err && arr && arr[0] ?
                                Object.keys(arr[0]).map(function(v) {
                                    return key.replace(/\*/, v).replace(/\uff0E/g, '.');
                                }) : []);
                        });

                    });
                }
                // if leveldb
                : db.helpers.level ?
                // https://github.com/rvagg/node-levelup/issues/285
                // todo: not tested :(
                function(key, callback) {
                    var stream = db.client.createKeyStream({gte: key.replace(/\*/, '!'), lte: key.replace(/\*/, '~')});
                    var keys = [];
                    stream.on('data', function(key) {
                        keys.push(key);
                    });
                    stream.on('end', function() {
                        callback(null, keys);
                    })
                }
                : null;
        })();

        flushed = false;

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
            Importer.importCategories,
            Importer.allowGuestsOnAllCategories,
            Importer.importUsers,
            Importer.importTopics,
            Importer.importPosts,
            Importer.fixPostsToPids,
            Importer.relockUnlockedTopics,
            Importer.fixTopicTimestamps,
            Importer.restoreConfig,
            Importer.disallowGuestsOnAllCategories,
            Importer.teardown
        ], callback);
    };

    Importer.resume = function(callback) {
        Importer.emit('importer.start');
        Importer.emit('importer.resume');

        Importer.isDirty();

        var series = [];
        if (! alreadyImportedAllUsers) {
            series.push(Importer.importUsers);
        } else {
            Importer.warn('alreadyImportedAllUsers=true, skipping importUsers Phase');
        }
        if (! alreadyImportedAllCategories) {
            series.push(Importer.importCategories);
        } else {
            Importer.warn('alreadyImportedAllCategories=true, skipping importCategories Phase');
        }
        if (! alreadyImportedAllTopics) {
            series.push(Importer.importTopics);
        } else {
            Importer.warn('alreadyImportedAllTopics=true, skipping importTopics Phase');
        }
        if (! alreadyImportedAllPosts) {
            series.push(Importer.importPosts);
        } else {
            Importer.warn('alreadyImportedAllPosts=true, skipping importPosts Phase');
        }

        series.push(Importer.relockUnlockedTopics);
        series.push(Importer.fixTopicTimestamps);
        series.push(Importer.fixPostsToPids);
        series.push(Importer.restoreConfig);
        series.push(Importer.disallowGuestsOnAllCategories);
        series.push(Importer.teardown);

        async.series(series, callback);
    };

    // todo: really? wtf is this logic
    Importer.isDirty = function(done) {

        areUsersDirty = !! fs.existsSync(DIRTY_USERS_FILE);
        areCategoriesDirty = !! fs.existsSync(DIRTY_CATEGORIES_FILE);
        areTopicsDirty = !! fs.existsSync(DIRTY_TOPICS_FILE);
        arePostsDirty = !! fs.existsSync(DIRTY_POSTS_FILE);

        isAnythingDirty = areUsersDirty || areCategoriesDirty || areTopicsDirty || arePostsDirty;

        // order matters
        if (areUsersDirty) {
            alreadyImportedAllUsers = false;
            alreadyImportedAllCategories = false;
            alreadyImportedAllTopics = false;
            alreadyImportedAllPosts = false;
        } else if (areCategoriesDirty) {
            alreadyImportedAllUsers = true;
            alreadyImportedAllCategories = false;
            alreadyImportedAllTopics = false;
            alreadyImportedAllPosts = false;
        } else if (areTopicsDirty) {
            alreadyImportedAllUsers = true;
            alreadyImportedAllCategories = true;
            alreadyImportedAllTopics = false;
            alreadyImportedAllPosts = false;
        } else if (arePostsDirty) {
            alreadyImportedAllUsers = true;
            alreadyImportedAllCategories = true;
            alreadyImportedAllTopics = true;
            alreadyImportedAllPosts = false;
        }

        return _.isFunction(done) ? done(null, isAnythingDirty) : isAnythingDirty;
    };

    Importer.flushData = function(next) {
        async.series([
            function(done){
                Importer.phase('purgeCategories+Topics+PostsStart');
                Importer.progress(0, 1);

                Data.countCategories(function(err, total) {
                    var index = 0;
                    Data.processCategoriesCidsSet(
                        function (err, ids, nextBatch) {
                            async.mapLimit(ids, FLUSH_BATCH_SIZE, function(id, cb) {
                                Importer.progress(index++, total);
                                Categories.purge(id, cb);
                            }, nextBatch);
                        },
                        {alwaysStartAt: 0},
                        function(err) {
                            Importer.progress(1, 1);
                            Importer.phase('purgeCategories+Topics+PostsDone');
                            done(err)
                        });
                });

            },
            function(done) {
                Importer.phase('purgeUsersStart');
                Importer.progress(0, 1);

                Data.countUsers(function(err, total) {
                    var index = 0; var count = 0;
                    Data.processUsersUidsSet(
                        function(err, ids, nextBatch) {
                            async.mapLimit(ids, FLUSH_BATCH_SIZE, function(uid, cb) {
                                Importer.progress(index++, total);
                                if (parseInt(uid, 10) === 1) {
                                    return cb();
                                }
                                User.delete(uid, function() {
                                    count++;
                                    cb();
                                });
                            }, nextBatch);
                        }, {
                            // since we're deleting records the range is always shifting backwards, so need to advance the batch start boundary
                            alwaysStartAt: 0,
                            // done if the uid=1 in the only one in the db
                            doneIf: function(start, end, ids) {
                                return ids.length === 1;
                            }
                        },
                        function(err) {
                            Importer.progress(1, 1);
                            Importer.phase('purgeUsersDone');
                            done(err)
                        }
                    );
                });
            },
            function(done) {
                flushed = true;

                Importer.phase('resetGlobalsStart');
                Importer.progress(0, 1);

                async.parallel([
                    function(cb) {
                        db.setObjectField('global', 'nextUid', 1, cb);
                    },
                    function(cb) {
                        db.setObjectField('global', 'userCount', 1, cb);
                    },
                    function(cb) {
                        db.setObjectField('global', 'nextCid', 1, cb);
                    },
                    function(cb) {
                        db.setObjectField('global', 'categoryCount', 1, cb);
                    },
                    function(cb) {
                        db.setObjectField('global', 'nextTid', 1, cb);
                    },
                    function(cb) {
                        db.setObjectField('global', 'topicCount', 1, cb);
                    },
                    function(cb) {
                        db.setObjectField('global', 'nextPid', 1, cb);
                    },
                    function(cb) {
                        db.setObjectField('global', 'postCount', 1, cb);
                    }
                ], function() {
                    Importer.progress(1, 1);
                    done();
                });
            },
            Importer.deleteTmpImportedSetsAndObjects
        ], function(err) {
            if (err) {
                Importer.error(err);
                next(err);
            }
            Importer.progress(1, 1);
            Importer.phase('resetGlobalsDone');
            next();
        });
    };

    Importer.phasePercentage = 0;

    Importer.progress = function(count, total, interval) {
        interval = interval || 1;
        var percentage = count / total * 100;
        if (percentage === 0 || percentage >= 100 || (percentage - Importer.phasePercentage > interval)) {
            Importer.phasePercentage = percentage;
            Importer.emit('importer.progress', {count: count, total: total, percentage: percentage});
        }
    };

    Importer.phase = function(phase, data) {
        Importer.phasePercentage = 0;
        Importer.emit('importer.phase', {phase: phase, data: data});
    };

    var recoverImporterUser = function(_uid, callback) {
        if (! flushed && (alreadyImportedAllUsers || areUsersDirty)) {
            return Data.getImportedUser(_uid, callback);
        }
        return callback(null, null);
    };

    var recoverImportedCategory = function(_cid, callback) {
        if (! flushed && (alreadyImportedAllCategories || areCategoriesDirty)) {
            return Data.getImportedCategory(_cid, callback);
        }
        return callback(null, null);
    };

    var recoverImportedTopic = function(_tid, callback) {
        if (! flushed && (alreadyImportedAllTopics || areTopicsDirty)) {
            return Data.getImportedTopic(_tid, callback);
        }
        return callback(null, null);
    };

    var recoverImportedPost = function(_pid, callback) {
        if (! flushed && (alreadyImportedAllPosts || arePostsDirty)) {
            return Data.getImportedPost(_pid, callback);
        }
        return callback(null, null);
    };

    Importer.importUsers = function(next) {
        Importer._lastPercentage = 0;
        Importer.phase('usersImportStart');
        Importer.progress(0, 1);
        var count = 0,
            imported = 0,
            config = Importer.config(),
            oldOwnerNotFound = config.adminTakeOwnership.enable,
            startTime = +new Date(),
            passwordGen = config.passwordGen.enabled ?
                function() {
                    return Importer.genRandPwd(config.passwordGen.len, config.passwordGen.chars);
                } :
                function() { /* undefined, no password */ };

        fs.writeFileSync(DIRTY_USERS_FILE, +new Date(), {encoding: 'utf8'});

        Importer.exporter.countUsers(function(err, total) {
            Importer.success('Importing ' + total + ' users.');
            Importer.exporter.exportUsers(function(err, users, usersArr, nextExportBatch) {
                    async.eachLimit(usersArr, IMPORT_BATCH_SIZE, function(user, done) {
                            count++;
                            var _uid = user._uid;
                            recoverImporterUser(_uid, function(err, _user) {
                                if (_user) {
                                    // Importer.warn('[count:' + count + '] skipping user: ' + user._username + ':' + user._uid + ', already imported');
                                    Importer.progress(count, total);
                                    return done();
                                }
                                var u = Importer.makeValidNbbUsername(user._username || '', user._alternativeUsername || '');
                                var userData = {
                                    username: u.username,
                                    email: user._email,
                                    password: user._password || passwordGen()
                                };
                                if (!userData.username) {
                                    Importer.warn('[count:' + count + '] skipping _username:' + user._username + ':_uid:' + user._uid + ', username is invalid.');
                                    Importer.progress(count, total);
                                    return done();
                                }
                                Importer.log('[count: ' + count + '] saving user:_uid: ' + _uid);
                                var onCreate = function(err, uid) {
                                    if (err) {
                                        Importer.warn('[count: ' + count + '] skipping username: "' + user._username + '" ' + err);
                                        Importer.progress(count, total);
                                        done();
                                    } else {
                                        user.imported = true;
                                        imported++;
                                        var onLevel = function() {
                                            var fields = {
                                                // preseve the signature, but Nodebb allows a max of 255 chars, so i truncate with an '...' at the end
                                                signature: utils.truncateStr(user._signature || '', 252),
                                                website: user._website || '',
                                                banned: user._banned ? 1 : 0,
                                                location: user._location || '',
                                                joindate: user._joindate || startTime,
                                                reputation: (user._reputation || 0) * config.userReputationMultiplier,
                                                profileviews: user._profileViews || 0,
                                                fullname: user._fullname || '',
                                                birthday: user._birthday || '',
                                                showemail: user._showemail ? 1 : 0,
                                                lastposttime: user._lastposttime || 0,

                                                // this is a migration script, no one is online
                                                status: 'offline',

                                                _imported_path: user._path || '',
                                                _imported_uid: _uid,
                                                _imported_username: user._username || '',
                                                _imported_slug: user._slug || user._userslug || '',
                                                _imported_signature: user._signature
                                            };
                                            var keptPicture = false;
                                            if (user._picture) {
                                                fields.uploadedpicture = user._picture;
                                                fields.picture = user._picture;
                                                keptPicture = true;
                                            }
                                            var onUserFields = function(err, result) {
                                                if (err) {
                                                    return done(err);
                                                }
                                                fields.uid = uid;
                                                user = nodeExtend(true, {}, user, fields);
                                                user.keptPicture = keptPicture;
                                                user.userslug = u.userslug;
                                                users[_uid] = user;
                                                Importer.progress(count, total);
                                                var onEmailConfirmed = function() {
                                                    Data.setUserImported(_uid, uid, user, done);
                                                };
                                                if (config.autoConfirmEmails) {
                                                    db.setObjectField('email:confirmed', user.email, '1', onEmailConfirmed);
                                                } else {
                                                    onEmailConfirmed();
                                                }
                                            };
                                            User.setUserFields(uid, fields, onUserFields);
                                        };
                                        if (('' + user._level).toLowerCase() == 'moderator') {
                                            Importer.makeModeratorOnAllCategories(uid, onLevel);
                                            Importer.warn(userData.username + ' just became a moderator on all categories');
                                        } else if (('' + user._level).toLowerCase() == 'administrator') {
                                            Groups.join('administrators', uid, function(){
                                                Importer.warn(userData.username + ' became an Administrator');
                                                onLevel();
                                            });
                                        } else {
                                            onLevel();
                                        }
                                    }
                                };
                                if (oldOwnerNotFound
                                    && parseInt(user._uid, 10) === parseInt(config.adminTakeOwnership._uid, 10)
                                    || (user._username || '').toLowerCase() === config.adminTakeOwnership._username.toLowerCase()
                                ) {
                                    Importer.warn('[count:' + count + '] skipping user: ' + user._username + ':'+ user._uid + ', it was revoked ownership');
                                    // cache the _uid for the next phases
                                    Importer.config('adminTakeOwnership', {
                                        enable: true,
                                        username: user._username,
                                        // just an alias in this case
                                        _username: user._username,
                                        _uid: user._uid
                                    });
                                    // no need to make it a mod or an admin, it already is
                                    user._level = null;
                                    // set to false so we don't have to match all users
                                    oldOwnerNotFound = false;
                                    // dont create, but set the fields
                                    return onCreate(null, LOGGEDIN_UID);
                                } else {
                                    User.create(userData, onCreate);
                                }
                            });
                        },
                        nextExportBatch);
                },
                {
                    // options
                },
                function(err) {
                    if (err) {
                        throw err;
                    }
                    Importer.success('Importing ' + imported + '/' + total + ' users took: ' + ((+new Date() - startTime) / 1000).toFixed(2) + ' seconds');
                    var nxt = function () {
                        fs.remove(DIRTY_USERS_FILE, next);
                    };
                    if (config.autoConfirmEmails && Importer.dbkeys) {
                        async.parallel([
                            function (done) {
                                Importer.dbkeys('confirm:*', function (err, keys) {
                                    keys.forEach(function (key) {
                                        db.delete(key);
                                    });
                                    done();
                                });
                            },
                            function (done) {
                                Importer.dbkeys('email:*:confirm', function (err, keys) {
                                    keys.forEach(function (key) {
                                        db.delete(key);
                                    });
                                    done();
                                });
                            }
                        ], function () {
                            Importer.progress(1, 1);
                            Importer.phase('usersImportDone');
                            nxt();
                        });
                    } else {
                        Importer.progress(1, 1);
                        Importer.phase('usersImportDone');
                        nxt();
                    }
                });
        });
    };

    Importer.importCategories = function(next) {
        Importer.phase('categoriesImportStart');
        Importer.progress(0, 1);

        Importer._lastPercentage = 0;

        var count = 0,
            imported = 0,
            startTime = +new Date(),
            config = Importer.config();

        fs.writeFileSync(DIRTY_CATEGORIES_FILE, +new Date(), {encoding: 'utf8'});

        Importer.exporter.countCategories(function(err, total) {
            Importer.success('Importing ' + total + ' categories.');
            Importer.exporter.exportCategories(
                function(err, categories, categoriesArr, nextExportBatch) {
                    var onEach = function(category, done) {
                        count++;
                        var _cid = category._cid;

                        recoverImportedCategory(_cid, function(err, _category) {
                            if (_category) {
                                Importer.warn('skipping category:_cid: ' + _cid + ', already imported');
                                Importer.progress(count, total);
                                return done();
                            }

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

                            var onCreate = function(err, categoryReturn) {
                                if (err) {
                                    Importer.warn('skipping category:_cid: ' + _cid + ' : ' + err);
                                    Importer.progress(count, total);
                                    return done();
                                }

                                var onParentCid = function(err, parentCategory) {

                                    var fields = {
                                        _imported_cid: _cid,
                                        _imported_path: category._path || '',
                                        _imported_name: category._name || '',
                                        _imported_slug: category._slug || '',
                                        _imported_description: category._description || ''
                                    };

                                    if (!err && parentCategory) {
                                        fields.parentCid = parentCategory.cid;
                                    }

                                    var onFields = function(err) {
                                        if (err) {
                                            Importer.warn(err);
                                        }

                                        Importer.progress(count, total);

                                        category.imported = true;
                                        imported++;
                                        category = nodeExtend(true, {}, category, categoryReturn, fields);
                                        categories[_cid] = category;

                                        Data.setCategoryImported(_cid, categoryReturn.cid, category, done);
                                    };

                                    db.setObject('category:' + categoryReturn.cid, fields, onFields);

                                };

                                var _parentCid = category._parent || category._parentCid || undefined;
                                if (_parentCid) {
                                    Data.getImportedCategory(_parentCid, onParentCid);
                                } else {
                                    onParentCid();
                                }
                            };

                            Categories.create(categoryData, onCreate);
                        });
                    };
                    async.eachLimit(categoriesArr, 1, onEach, nextExportBatch);
                },
                {
                    // options
                },
                function(err) {
                    if (err) {
                        throw err;
                    }
                    Importer.success('Importing ' + imported + '/' + total + ' categories took: ' + ((+new Date()-startTime)/1000).toFixed(2) + ' seconds');
                    Importer.progress(1, 1);
                    Importer.phase('categoriesImportDone');
                    fs.remove(DIRTY_CATEGORIES_FILE, next);
                });
        });
    };

    Importer.allowGuestsOnAllCategories = function(done) {
        Data.eachCategory(function(category, next) {
                async.parallel([
                    function(nxt) {
                        Groups.join('cid:' + category.cid + ':privileges:groups:topics:create', 'registered-users', nxt);
                    },
                    function(nxt) {
                        Groups.join('cid:' + category.cid + ':privileges:groups:topics:reply', 'registered-users', nxt);
                    },
                    function(nxt) {
                        Groups.join('cid:' + category.cid + ':privileges:groups:find', 'registered-users', nxt);
                    },
                    function(nxt) {
                        Groups.join('cid:' + category.cid + ':privileges:groups:read', 'registered-users', nxt);
                    },
                    function(nxt) {
                        Groups.join('cid:' + category.cid + ':privileges:groups:topics:create', 'guests', nxt);
                    },
                    function(nxt) {
                        Groups.join('cid:' + category.cid + ':privileges:groups:topics:reply', 'guests', nxt);
                    },
                    function(nxt) {
                        Groups.join('cid:' + category.cid + ':privileges:groups:find', 'guests', nxt);
                    },
                    function(nxt) {
                        Groups.join('cid:' + category.cid + ':privileges:groups:read', 'guests', nxt);
                    }
                ], next);
            },
            {async: true, eachLimit: 10},
            function() {
                done();
            });
    };

    Importer.disallowGuestsOnAllCategories = function(done) {
        Data.eachCategory(function(category, next) {
                async.parallel([
                    function(nxt) {
                        Groups.leave('cid:' + category.cid + ':privileges:groups:topics:create', 'guests', nxt);
                    },
                    function(nxt) {
                        Groups.leave('cid:' + category.cid + ':privileges:groups:topics:reply', 'guests', nxt);
                    },
                    function(nxt) {
                        Groups.leave('cid:' + category.cid + ':privileges:groups:find', 'guests', nxt);
                    },
                    function(nxt) {
                        Groups.leave('cid:' + category.cid + ':privileges:groups:read', 'guests', nxt);
                    }
                ], next);
            },
            {async: true, eachLimit: 10},
            function() {
                done();
            });
    };

    Importer.importTopics = function(next) {
        Importer.phase('topicsImportStart');
        Importer.progress(0, 1);

        Importer._lastPercentage = 0;
        var count = 0,
            imported = 0,
            startTime = +new Date(),
            config = Importer.config();

        fs.writeFileSync(DIRTY_TOPICS_FILE, +new Date(), {encoding: 'utf8'});

        Importer.exporter.countTopics(function(err, total) {
            Importer.success('Importing ' + total + ' topics.');
            Importer.exporter.exportTopics(
                function(err, topics, topicsArr, nextExportBatch) {
                    var onEach = function(topic, done) {
                        count++;
                        var _tid = topic._tid;
                        recoverImportedTopic(_tid, function(err, _topic) {
                            if (_topic) {
                                // Importer.warn('[count:' + count + '] skipping topic:_tid: ' + _tid + ', already imported');
                                Importer.progress(count, total);
                                return done();
                            }

                            async.parallel([
                                function(cb) {
                                    Data.getImportedCategory(topic._cid, function(err, cat) {
                                        if (err) {
                                            Importer.warn('getImportedCategory: ' + topic._cid + ' err: ' + err);
                                        }
                                        cb(null, cat);
                                    });
                                },
                                function(cb) {
                                    Data.getImportedUser(topic._uid, function(err, usr) {
                                        if (err) {
                                            Importer.warn('getImportedUser: ' + topic._uid + ' err: ' + err);
                                        }
                                        cb(null, usr);
                                    });
                                }
                            ], function(err, results) {

                                var category = results[0];
                                var user = results[1] || {uid: '0'};

                                if (!category) {
                                    Importer.warn('[count:' + count + '] skipping topic:_tid:"' + _tid + '" --> _cid: ' + topic._cid + ':imported:' + !!category);
                                    Importer.progress(count, total);
                                    done();
                                } else {
                                    Importer.log('[count:' + count + '] saving topic:_tid: ' + _tid);

                                    var onPost = function (err, returnTopic) {
                                        if (err) {
                                            Importer.warn('[count:' + count + '] skipping topic:_tid: ' + _tid + ':cid:' + category.cid + ':_cid:' + topic._cid + ':uid:' + user.uid +  ':_uid:' + topic._uid + ' err: ' + err);
                                            Importer.progress(count, total);
                                            done();
                                        } else {

                                            topic.imported = true;
                                            imported++;

                                            var timestamp = topic._timestamp || startTime;
                                            var relativeTime = new Date(timestamp).toISOString();

                                            var topicFields = {
                                                viewcount: topic._viewcount || topic._viewscount || 0,

                                                // assume that this topic not locked for now, but will iterate back again at the end and lock it back after finishing the importPosts()
                                                // locked: normalizedTopic._locked ? 1 : 0,
                                                locked: 0,

                                                deleted: topic._deleted ? 1 : 0,

                                                // if pinned, we should set the db.sortedSetAdd('cid:' + cid + ':tids', Math.pow(2, 53), tid);
                                                pinned: topic._pinned ? 1 : 0,
                                                timestamp: timestamp,
                                                lastposttime: timestamp,

                                                _imported_tid: _tid,
                                                _imported_uid: topic._uid || '',
                                                _imported_cid: topic._cid,
                                                _imported_slug: topic._slug || '',
                                                _imported_path: topic._path || '',
                                                _imported_title: topic._title || '',
                                                _imported_content: topic._content || '',
                                                _imported_guest: topic._guest || '',
                                                _imported_ip: topic._ip || '',
                                                _imported_user_slug: user._slug || '',
                                                _imported_user_path: user._path || '',
                                                _imported_category_path: category._path || '',
                                                _imported_category_slug: category._slug || ''
                                            };

                                            var postFields = {
                                                timestamp: timestamp,
                                                // todo: not sure if I need this
                                                relativeTime: relativeTime
                                            };

                                            var onPinned = function() {

                                                var onFields = function(err, result) {
                                                    Importer.progress(count, total);
                                                    if (err) {
                                                        Importer.warn(err);
                                                    }

                                                    var onPostFields = function(){
                                                        topic = nodeExtend(true, {}, topic, topicFields, returnTopic.topicData);
                                                        topics[_tid] = topic;

                                                        Data.setTopicImported(_tid, returnTopic.topicData.tid, topic, done);
                                                    };

                                                    Posts.setPostFields(returnTopic.postData.pid, postFields, onPostFields);
                                                };

                                                db.setObject('topic:' + returnTopic.topicData.tid, topicFields, onFields);
                                            };

                                            // pinned = 1 not enough to float the topic to the top in it's category
                                            if (topicFields.pinned) {
                                                db.sortedSetAdd('cid:' + category.cid + ':tids', Math.pow(2, 53), returnTopic.topicData.tid, onPinned);
                                            }  else {
                                                db.sortedSetAdd('cid:' + category.cid + ':tids', timestamp, returnTopic.topicData.tid, onPinned);
                                            }
                                        }
                                    };
                                    Topics.post({
                                        uid: !config.adminTakeOwnership.enable ? user.uid : parseInt(config.adminTakeOwnership._uid, 10) === parseInt(topic._uid, 10) ? LOGGEDIN_UID : user.uid,
                                        title: topic._title || '',
                                        content: topic._content || '',
                                        cid: category.cid,
                                        thumb: topic._thumb
                                    }, onPost);
                                }
                            });
                        });
                    };

                    async.eachLimit(topicsArr, IMPORT_BATCH_SIZE, onEach, nextExportBatch);
                },
                {
                    //options
                },
                function(err) {
                    if (err) {
                        throw err;
                    }
                    Importer.success('Importing ' + imported + '/' + total + ' topics took: ' + ((+new Date()-startTime)/1000).toFixed(2) + ' seconds');
                    Importer.progress(1, 1);
                    Importer.phase('topicsImportDone');
                    fs.remove(DIRTY_TOPICS_FILE, next);
                });
        });

    };

    Importer.importPosts = function(next) {
        Importer.phase('postsImportStart');
        Importer.progress(0, 1);

        Importer._lastPercentage = 0;
        var count = 0,
            imported = 0,
            startTime = +new Date(),
            config = Importer.config();

        fs.writeFileSync(DIRTY_POSTS_FILE, +new Date(), {encoding: 'utf8'});
        Importer.exporter.countPosts(function(err, total) {
            Importer.success('Importing ' + total + ' posts.');
            Importer.exporter.exportPosts(
                function(err, posts, postsArr, nextExportBatch) {

                    var onEach = function(post, done) {
                        count++;
                        var _pid = post._pid;

                        recoverImportedPost(_pid, function(err, _post) {
                            if (_post) {
                                // Importer.warn('[count: ' + count + '] skipping post:_pid: ' + _pid + ', already imported');
                                Importer.progress(count, total);
                                return done();
                            }

                            async.parallel([
                                function(cb) {
                                    Data.getImportedTopic(post._tid, function(err, top) {
                                        if (err) {
                                            Importer.warn('getImportedTopic: ' + post._tid + ' err: ' + err);
                                        }
                                        cb(null, top);
                                    });
                                },
                                function(cb) {
                                    Data.getImportedUser(post._uid, function(err, usr) {
                                        if (err) {
                                            Importer.warn('getImportedUser: ' + post._uid + ' err: ' + err);
                                        }
                                        cb(null, usr);
                                    });
                                }
                            ], function(err, results) {
                                var topic = results[0];
                                var user = results[1] || {uid: '0'};

                                if (!topic) {
                                    Importer.warn('[count: ' + count + '] skipping post:_pid: ' + _pid + ' _tid:' + post._tid + ' imported: ' + topic);
                                    done();
                                } else {

                                    Importer.log('[count: ' + count + '] saving post: ' + _pid + ':tid:' + topic.tid + ':_tid:' + post._tid + ':uid:' + user.uid + ':_uid:' + post._uid);

                                    var onCreate = function(err, postReturn){
                                        if (err) {
                                            Importer.warn('[count: ' + count + '] skipping post: ' + post._pid + ':tid:' + topic.tid + ':_tid:' + post._tid + ':uid:' + user.uid + ':_uid:' + post._uid + ' ' + err);
                                            Importer.progress(count, total);
                                            done();
                                        } else {

                                            post.imported = true;
                                            imported++;

                                            var fields = {
                                                reputation: post._reputation || 0,
                                                votes: post._votes || 0,
                                                edited: post._edited || 0,
                                                deleted: post._deleted || 0,

                                                // todo: not sure if I need this
                                                relativeTime: new Date(post._timestamp || startTime).toISOString(),

                                                _imported_pid: _pid,
                                                _imported_uid: post._uid || '',
                                                _imported_tid: post._tid || '',
                                                _imported_content: post._content || '',
                                                _imported_cid: topic._cid || '',
                                                _imported_ip: post._ip || '',
                                                _imported_guest: post._guest || '',
                                                _imported_toPid: post._toPid || '',
                                                _imported_user_slug: user._slug || '',
                                                _imported_user_path: user._path || '',
                                                _imported_topic_slug: topic._slug || '',
                                                _imported_topic_path: topic._path || '',
                                                _imported_category_path: topic._imported_category_path || '',
                                                _imported_category_slug: topic._imported_category_slug || '',
                                                _imported_path: post._path || ''
                                            };

                                            var onPostFields = function() {
                                                Importer.progress(count, total);
                                                post = nodeExtend(true, {}, post, fields, postReturn);
                                                post.imported = true;
                                                posts[_pid] = post;
                                                Data.setPostImported(_pid, post.pid, post, done);
                                            };
                                            Posts.setPostFields(postReturn.pid, fields, onPostFields);
                                        }
                                    };

                                    Posts.create({
                                        uid: !config.adminTakeOwnership.enable ? user.uid : config.adminTakeOwnership._uid === post._uid ? 1 : user.uid,
                                        tid: topic.tid,
                                        content: post._content || '',
                                        timestamp: post._timestamp || startTime
                                    }, onCreate);
                                }
                            });
                        });
                    };
                    async.eachLimit(postsArr, IMPORT_BATCH_SIZE, onEach, nextExportBatch);
                },
                {
                    // options
                },
                function() {
                    Importer.progress(1, 1);
                    Importer.phase('postsImportDone');
                    Importer.success('Importing ' + imported + '/' + total+ ' posts took: ' + ((+new Date()-startTime)/1000).toFixed(2) + ' seconds');
                    fs.remove(DIRTY_POSTS_FILE, next);
                });
        });
    };

    Importer.teardown = function(next) {
        Importer.phase('importerTeardownStart');
        Importer.phase('importerTeardownDone');
        Importer.phase('importerComplete');

        Importer.emit('importer.complete');
        next();
    };

    Importer.relockUnlockedTopics = function(next) {
        var count = 0;

        Importer.phase('relockingTopicsStart');
        Importer.progress(0, 1);

        Data.countImportedTopics(function(err, total) {
            Data.eachImportedTopic(function(topic, done) {
                    Importer.progress(count++, total);
                    if (!topic || !topic._locked) {
                        return done();
                    }
                    db.setObjectField('topic:' + topic.tid, 'locked', '1', function(err) {
                        if (err) {
                            Importer.warn(err);
                        } else {
                            Importer.log('[count: ' + count + '] locked topic:' + topic.tid + ' back');
                        }
                        done();
                    });
                },
                {async: true, eachLimit: IMPORT_BATCH_SIZE},
                function(err) {
                    if (err) throw err;
                    Importer.progress(1, 1);
                    Importer.phase('relockingTopicsDone');
                    next();
                });
        });
    };

    Importer.fixTopicTimestamps = function(next) {
        var count = 0;

        Importer.phase('fixTopicTimestampsStart');
        Importer.progress(0, 1);

        Data.countTopics(function(err, total) {
            Data.eachTopic(function(topic, done) {
                    Importer.progress(count++, total);

                    if (!topic || !topic.tid)
                        return done();

                    // todo paginate this as well
                    db.getSortedSetRevRange('tid:' + topic.tid + ':posts', 0, -1, function(err, pids) {
                        if (err) {
                            return done(err);
                        }

                        if (!Array.isArray(pids) || !pids.length) {
                            return done();
                        }
                        async.parallel({
                            cid: function(next) {
                                db.getObjectField('topic:' + topic.tid, 'cid', next);
                            },
                            lastPostTimestamp: function(next) {
                                db.getObjectField('post:' + pids[0], 'timestamp', next);
                            }
                        }, function(err, results) {
                            if (err) {
                                return done(err);
                            }

                            db.sortedSetAdd('cid:' + results.cid + ':tids', results.lastPostTimestamp, topic.tid, done);
                        });
                    });
                },
                {async: true, eachLimit: IMPORT_BATCH_SIZE},
                function(err) {
                    if (err) throw err;
                    Importer.progress(1, 1);
                    Importer.phase('fixTopicTimestampsDone');
                    next();
                });
        });
    };

    Importer.fixPostsToPids = function(next) {

        var count = 0;

        Importer.phase('fixPostsToPidsStart');
        Importer.progress(0, 1);

        Data.countPosts(function(err, total) {
            Data.eachPost(function(post, done) {
                    Importer.progress(count++, total);
                    if (!post || !post._imported_toPid || !post.pid) {
                        return done();
                    }
                    Data.getImportedPost(post._imported_toPid, function(err, toPost) {
                        if (err || !toPost) {
                            return done();
                        }
                        Posts.setPostField(post.pid, 'toPid', toPost.pid, done);
                    });
                },
                {async: true, eachLimit: IMPORT_BATCH_SIZE},
                function(err) {
                    if (err) throw err;
                    Importer.progress(1, 1);
                    Importer.phase('fixPostsToPidsDone');
                    next();
                });
        });
    };

    Importer.backupConfig = function(next) {
        // if the backedConfig file exists, that means we did not complete the restore config last time,
        // so don't overwrite it, assuming the nodebb config in the db are the tmp ones
        if (fs.existsSync(BACKUP_CONFIG_FILE)) {
            Importer.config('backedConfig', fs.readJsonSync(BACKUP_CONFIG_FILE) || {});
            next();
        } else {
            db.getObject('config', function(err, data) {
                if (err) {
                    throw err;
                }
                Importer.config('backedConfig', data || {});
                fs.outputJsonSync(BACKUP_CONFIG_FILE, Importer.config('backedConfig'));
                next();
            });
        }
    };

    Importer.setTmpConfig = function(next) {
        // get the nbb backedConfigs, change them, then set them back to the db
        // just to make the transition a little less flexible
        // yea.. i dont know .. i have a bad feeling about this
        var config = nodeExtend(true, {}, Importer.config().backedConfig, Importer.config().nbbTmpConfig);

        // if you want to auto confirm email, set the host to null, if there is any
        // this will prevent User.sendConfirmationEmail from setting expiration time on the email address
        // per https://github.com/designcreateplay/NodeBB/blob/master/src/user.js#L458'ish
        if (Importer.config().autoConfirmEmails) {
            config['email:smtp:host'] = '';
        }

        db.setObject('config', config, function(err){
            if (err) {
                throw err;
            }

            Meta.configs.init(next);
        });
    };

    // im nice
    Importer.restoreConfig = function(next) {
        if (fs.existsSync(BACKUP_CONFIG_FILE)) {
            Importer.config('backedConfig', fs.readJsonFileSync(BACKUP_CONFIG_FILE));

            db.setObject('config', Importer.config().backedConfig, function(err){
                if (err) {
                    Importer.warn('Something went wrong while restoring your nbb configs');
                    Importer.warn('here are your backed-up configs, you do it manually');
                    Importer.warn(JSON.stringify(Importer.config().backedConfig));
                    return next();
                }

                Importer.success('Config restored:' + JSON.stringify(Importer.config().backedConfig));
                fs.removeSync(BACKUP_CONFIG_FILE);

                Meta.configs.init(function(err) {
                    if (err) {
                        Importer.warn('Could not re-init Meta configs, just restart NodeBB, you\'ll be fine');
                    }

                    next();
                });
            });
        } else {
            Importer.warn('Could not restore NodeBB tmp configs, because ' + BACKUP_CONFIG_FILE + ' does not exist');
            next();
        }
    };

    // aka forums
    Importer.makeModeratorOnAllCategories = function(uid, done) {
        Data.eachCategory(function(category, next) {
                Groups.join('group:cid:' + category.cid + ':privileges:mods:members', uid, function(err) {
                    next();
                });
            },
            {async: true, eachLimit: 10},
            done);
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

    Importer.emit = function () {
        var args = Array.prototype.slice.call(arguments, 0);

        if (args && args[args.length - 1] !== 'logged') {
            Importer.log.apply(Importer, args);
        } else {
            args.pop();
        }

        args.unshift(args[0]);
        Importer._dispatcher.emit.apply(Importer._dispatcher, args);
    };

    Importer.on = function () {
        Importer._dispatcher.on.apply(Importer._dispatcher, arguments);
    };

    Importer.once = function () {
        Importer._dispatcher.once.apply(Importer._dispatcher, arguments);
    };

    Importer.removeAllListeners = function () {
        Importer._dispatcher.removeAllListeners();
    };

    Importer.warn = function() {
        var args = _.toArray(arguments);

        args.unshift('importer.warn');
        args.push('logged');
        Importer.emit.apply(Importer, args);
        args.unshift(logPrefix);
        args.pop();

        console.warn.apply(console, args);
    };

    Importer.log = function() {
        if (!Importer.config.verbose) {
            return;
        }

        var args = _.toArray(arguments);

        args.unshift('importer.log');
        args.push('logged');
        if (Importer.config.clientLog) {
            Importer.emit.apply(Importer, args);
        }
        args.unshift(logPrefix);
        args.pop();
        if (Importer.config.serverLog) {
            console.log.apply(console, args);
        }
    };

    Importer.success = function() {
        var args = _.toArray(arguments);

        args.unshift('importer.success');
        args.push('logged');
        Importer.emit.apply(Importer, args);
        args.unshift(logPrefix);
        args.pop();

        console.log.apply(console, args);
    };

    Importer.error = function() {
        var args = _.toArray(arguments);

        args.unshift('importer.error');
        args.push('logged');
        Importer.emit.apply(Importer, args);
        args.unshift(logPrefix);
        args.pop();

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

    Importer.deleteTmpImportedSetsAndObjects = function(done) {
        Importer.phase('deleteTmpImportedSetsAndObjectsStart');
        Importer.progress(0, 1);

        var total = 0;
        async.parallel([
            function(next) {
                Data.count('_imported:_users', function(err, count) {
                    total += count;
                    next();
                });
            },
            function(next) {
                Data.count('_imported:_categories', function(err, count) {
                    total += count;
                    next();
                });
            },
            function(next) {
                Data.count('_imported:_topics', function(err, count) {
                    total += count;
                    next();
                });
            },
            function(next) {
                Data.count('_imported:_posts', function(err, count) {
                    total += count;
                    next();
                });
            }
        ], function(err) {
            if (err) {
                Importer.warn(err);
            }
            var index = 0;
            async.series([
                function(next) {
                    Data.processIdsSet(
                        '_imported:_users',
                        function(err, ids, nextBatch) {
                            async.mapLimit(ids, FLUSH_BATCH_SIZE, function(_uid, cb) {
                                Importer.progress(index++, total);
                                db.sortedSetRemove('_imported:_users', _uid, function() {
                                    db.delete('_imported_user:' + _uid, cb);
                                });
                            }, nextBatch);
                        },
                        {
                            alwaysStartAt: 0
                        },
                        next);
                },
                function(next) {
                    Data.processIdsSet(
                        '_imported:_categories',
                        function(err, ids, nextBatch) {
                            async.mapLimit(ids, FLUSH_BATCH_SIZE, function(_cid, cb) {
                                Importer.progress(index++, total);
                                db.sortedSetRemove('_imported:_categories', _cid, function() {
                                    db.delete('_imported_category:' + _cid, cb);
                                });
                            }, nextBatch);
                        },
                        {
                            alwaysStartAt: 0
                        },
                        next);
                },
                function(next) {
                    Data.processIdsSet(
                        '_imported:_topics',
                        function(err, ids, nextBatch) {
                            async.mapLimit(ids, FLUSH_BATCH_SIZE, function(_tid, cb) {
                                Importer.progress(index++, total);
                                db.sortedSetRemove('_imported:_topics', _tid, function() {
                                    db.delete('_imported_topic:' + _tid, cb);
                                });
                            }, nextBatch);
                        },
                        {
                            alwaysStartAt: 0
                        },
                        next);
                },
                function(next) {
                    Data.processIdsSet(
                        '_imported:_posts',
                        function(err, ids, nextBatch) {
                            async.mapLimit(ids, FLUSH_BATCH_SIZE, function(_pid, cb) {
                                Importer.progress(index++, total);
                                db.sortedSetRemove('_imported:_posts', _pid, function() {
                                    db.delete('_imported_post:' + _pid, cb);
                                });
                            }, nextBatch);
                        },
                        {
                            alwaysStartAt: 0
                        },
                        next);
                }
            ], function() {
                Importer.phase('deleteTmpImportedSetsAndObjectsDone');
                Importer.progress(1, 1);
                done();
            });
        });
    };

})(module.exports);
