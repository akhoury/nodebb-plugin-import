'use strict';

var Group, Meta, User, Topics, Posts, Categories, CategoryTools, DB, nconf,

// nodebb utils, useful
    utils = require('../../../public/src/utils.js'),

// I'm lazy, dont hire me
    async = require('async'),
    fs = require('fs-extra'),
    path = require('path'),
    storage = require('node-persist'),
    Logger = require('tiny-logger'),

// using a temporary manual fork till https://github.com/neocotic/html.md/pull/43 gets merged
    htmlMd = require('html-md-optional_window'),

// i use that for the lodash template
    _ = require('underscore'),

// dont ask, well, jquery needs it and at the bottom _htmlToMd also needs a window object, because it uses jsdom
    window = require("jsdom").jsdom(null, null, {features: {FetchExternalResources: false}}).createWindow(),
// i use that to deep extend, yea that's it, no really, i may be doing HTML manipulation later
    $ = require('jQuery')(window),
// yup im that lazy, you're only using this once, y do u care?

    Import = function (config) {
        var self = this;

        this.config = $.extend(true, {}, {

                log: 'info,warn,error,debug',
                // generate passwords for the users, yea
                passwordGen: {
                    // chars selection menu
                    chars: '{}.-_=+qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM1234567890',
                    // password length
                    len: 13
                },
                redirectTemplatesStrings: {
                    // uses the underscore's templating engine
                    // all variables that start an an '_' are the old variables
                    users: {
                        // this is an example (the ubb way), with prefix /forums
                        oldPath: '/forums/ubbthreads.php/users/<%= _uid %>',
                        // this is the nbb way
                        newPath: '/user/<%= userslug %>'
                    },
                    categories: {
                        // this is an example (the ubb way), with prefix /forums
                        oldPath: '/forums/ubbthreads.php/forums/<%= _cid %>',
                        // this is the nbb way
                        newPath: '/category/<%= cid %>'
                    },
                    topics: {
                        // this is an example (the ubb way), with prefix /forums
                        oldPath: '/forums/ubbthreads.php/topics/<%= _tid %>',
                        // this is the nbb way
                        newPath: '/topic/<%= tid %>'
                    },
                    // most Forums uses the # to add the post id to the path, this cannot be easily redirected
                    // without some client side JS 'Redirector' that grabs that # value and add to the query string or something
                    // but if you're old-forums doesn't, feel free to edit that config
                    // by default this is null to disable it and increase performance
                    posts: null
                    /*
                     posts: {
                     // here's an example on how ubb's post paths are:
                     oldPath: "/topics/<%= _tid %>/*#Post<%= _pid %>",
                     // even nbb does that too, it's easier to let javascript handle the "scroll" to a post this way
                     newPath: null // "/topic/<%= tid %>/#<%= pid %>"
                     }
                     */
                },
                storageDir: path.join(__dirname,  '../storage'),

                nbb: {
                    setup: {
                        runFlush: false,
                        setupVal:  {
                            'admin:username': 'admin',
                            'admin:password': 'password',
                            'admin:password:confirm': 'password',
                            'admin:email': 'you@example.com',
                            'base_url': 'http://localhost',
                            'port': '4567',
                            'use_port': 'y',
                            'bind_address': '0.0.0.0',
                            'secret': '',

                            // default is 'redis', change to 'mongo' if needed, but then fill out the 'mongo:*' config
                            'database': 'redis',

                            // redisdb
                            'redis:host': '127.0.0.1',
                            'redis:port': 6379,
                            'redis:password': '',
                            'redis:database': 0,

                            // mongodb
                            'mongo:host': '127.0.0.1',
                            'mongo:port': 27017,
                            'mongo:user': '',
                            'mongo:password': '',
                            'mongo:database': 0
                        }
                    },

                    // to be randomly selected
                    categoriesTextColors: ['#FFFFFF'],
                    categoriesBgColors: ['#ab1290','#004c66','#0059b2'],
                    categoriesBackgrounds: ['#ab1290','#004c66','#0059b2'],
                    categoriesIcons: ['fa-comment'],

                    // this will set the nodebb 'email:*:confirm' records to true
                    // and will del all the 'confirm:*KEYS*:emails' too
                    // if you want to auto confirm the user's accounts..
                    autoConfirmEmails: true,

                    // if you want to boost the Karma
                    userReputationMultiplier: 1,

                    // NodeBB specific restrictive configs,
                    // I temporarly relax the configs to migrate as much as possible of your data
                    // don't worry, I set the originals back at the end, i think see _backupConfig() and _restoreConfig()
                    // feel free to change them if you have usernames > 100 chars or topic title > 300 chars (are you fucking kidding me?)
                    tempConfig: {
                        postDelay: 0,
                        minimumPostLength: 1,
                        minimumPasswordLength: 3, // please don't generate 3 chars passwords
                        minimumTitleLength: 1,
                        maximumTitleLength: 300,
                        maximumUsernameLength: 100,
                        allowGuestPosting: 1
                    },

                    // async.eachLimit batch size
                    // todo: I don't know what am i doing
                    categoriesBatchSize: 5,
                    usersBatchSize: 5,
                    topicsBatchSize: 5,
                    postsBatchSize: 5
                }

            },
            config
        );

        // todo: this is such a bummer !!!
        // in order to require any NodeBB Object, nconf.get('database') needs to be set
        // so let's require nconf first
        try {
            nconf = require('../../nconf');
        } catch (err) {
            throw err;
        }
        var nconfFile = '../../../config.json';
        // see if the NodeBB config.json exists
        if (fs.existsSync(nconfFile)) {
            // if yes, load it and use these values
            var nconfigs = fs.readJsonSync(nconfFile);
            nconfigs.use_port = nconfigs.use_port ? 'y' : 'n';
            this.config.nbb.setup.setupVal = $.extend(true, {}, this.config.nbb.setup.setupVal, nconfigs);
        } else {
            // no? assume the user passed in the setupVals
            fs.writeJsonSync(nconfFile, this.config.nbb.setup.setupVal);
        }
        // tell nconf to read it, not sure if I can pass the valus in memory, but what the hell, it's not a huge file anyways
        nconf.file({file: nconfFile});

        // requiring DB after configs, since it could be either mongo or redis now
        // assumed in NodeBB/node_modules/nodebb-plugin-importer
        // the try catch are a workaround in case plugin was deactived, since this a terminal use only plugin
        // same for the rest of the objects right below
        if (this.config.nbb.setup.setupVal.database === 'redis') {
            nconf.set('database', 'redis');
        } else if (this.config.nbb.setup.setupVal.database === 'mongo') {
            nconf.set('database', 'mongo');
        } else {
            throw new Error('NodeBB Database config is not set');
        }
        // activated or not, still works if it lives in NodeBB/node_modules/nodebb-plugin-importer
        try {
            Group = module.parent.require('./groups.js');
            Meta = module.parent.require('./meta.js');
            User = module.parent.require('./user.js');
            Topics = module.parent.require('./topics.js');
            Posts = module.parent.require('./posts.js');
            Categories = module.parent.require('./categories.js');
            DB = module.parent.require('./database.js');
        } catch (e) {
            Group = require('../../../src/groups.js');
            Meta = require('../../../src/meta.js');
            User = require('../../../src/user.js');
            Topics = require('../../../src/topics.js');
            Posts = require('../../../src/posts.js');
            Categories = require('../../../src/categories.js');
            DB = require('../../../src/database.js');
        }

        DB.init(function() {

            DB.keys = nconf.get('database') == 'redis' ?
                function(key, callback) {
                    DB.client.keys(key, callback);
                }
                :
                function(key, callback) {
                    DB.client.collection('objects').find( { _key: { $regex: key /*, $options: 'i'*/ } }, function(err, result) {
                        callback(err, result);
                    });
                };

            self.init();
        });
    };

Import.prototype = {

    init: function() {
        var _self = this;
        //init logger
        this.logger = Logger.init(this.config.log, '[import]');
        this.logger.debug('init()');

        // find storage dir
        this.config.storageDir = path.resolve(this.config.storageDir);
        if(!fs.existsSync(this.config.storageDir) || !fs.lstatSync(this.config.storageDir).isDirectory()) {
            throw new Error(this.config.storageDir + ' does not exist or is not a directory');
        }

        this.logger.info("Loading storage directory: " + this.config.storageDir + ' into memory, please be patient');

        // init storage module
        storage.initSync({dir: this.config.storageDir});

        //compile this.config.redirectTemplatesStrings strings, and save them in this.redirectTemplates
        this.redirectTemplates = {
            categories: {},
            users: {},
            topics: {},
            posts: {}
        };
        Object.keys(this.config.redirectTemplatesStrings || {}).forEach(function(key) {
            var model = _self.config.redirectTemplatesStrings[key];
            if (model && model.oldPath && model.newPath) {
                _self.redirectTemplates[key].oldPath = _.template(model.oldPath);
                _self.redirectTemplates[key].newPath = _.template(model.newPath);
            }
        });

        this.convert =
                this.config.convert === 'html-to-md' ? this._htmlToMd :
                this.config.convert === 'bbcode-to-md' ? this._bbcodeToMd : function(s){return s;};
    },

    start: function() {
        var _self = this;
        this.logger.debug('start()');

        async.series([
            function(next){
                _self.setup(next);
            },
            function(next) {
                _self.logger.info('\n\nImporting Categories ...\n\n');
                _self.importCategories(next);
            },
            function(next) {
                _self.logger.info('\n\nImporting Users ...\n\n');
                _self.importUsers(next);
            },
            function(next) {
                _self.logger.info('\n\nImporting Topics ...\n\n');
                _self.importTopics(next);
            },
            function(next) {
                _self.logger.info('\n\nImporting Posts ...\n\n');
                _self.importPosts(next);
            },
            function(next) {
                _self.logger.info('\n\nLocking temp-unlocked Topics back  ...\n\n');
                _self.relockUnlockedTopics(next);
            },
            function(next) {
                _self.restoreConfig(next);
            },
            function(next) {
                _self.report(next);
            },
            function(){
                _self.exit();
            }
        ]);
    },

    setup: function(next) {
        this.logger.debug('setup()');

        // temp memory
        this.mem = {
            _cids: storage.getItem('_cids.json'),
            _uids: storage.getItem('_uids.json'),
            _tids: storage.getItem('_tids.json'),
            _pids: storage.getItem('_pids.json')
        };
        // todo sanity check around dem mem ids

        this.mem.startTime = +new Date();

        if (this.config.nbb.setup.runFlush == true) {
            // re-rerun nodebb's --setup
            this._runNbbSetup(next);
        } else {
            next();
        }
    },

    importCategories: function(next) {
        var count = 0,
            _self = this,
            logger = this.logger,
            startTime = +new Date(),
            flushed = this.config.nbb.setup.runFlush;

        async.eachLimit(this.mem._cids, this.config.nbb.categoriesBatchSize, function(_cid, done) {
            count++;

            var storedCategory = storage.getItem('c.' + _cid);
            if (!storedCategory || !storedCategory.normalized) {
                logger.warn('[c:' + count + '] normalized category:_cid: ' + _cid + ' it doesn\'t exist in storage');

                // todo [async-going-sync-hack]
                setTimeout(function(){done();}, 1); return;
            }

            var	normalizedCategory = storedCategory.normalized,
                importedCategory = flushed ? null : storedCategory.imported,
                skippedCategory = normalizedCategory._skip ? {_cid: _cid} : flushed ? null : storedCategory.skipped;

            if (importedCategory || skippedCategory) {
                logger.warn('[c:' + count + '] category:_cid: ' + _cid + ' already processed, destiny: ' + (importedCategory ? 'imported' : 'skipped'));

                // todo [async-going-sync-hack]
                setTimeout(function(){done();}, 1);
            } else {
                logger.debug('[c:' + count + '] saving category:_cid: ' + _cid);

                var category = {
                    name: normalizedCategory._name || ('Category ' + (count + 1)),
                    description: normalizedCategory._description || 'no description available',

                    // you can fix the order later, nbb/admin
                    order: normalizedCategory._order || count + 1,

                    disabled: normalizedCategory._disabled || 0,

                    link: normalizedCategory._link || 0,

                    // roulette, that too,
                    icon: _self.config.nbb.categoriesIcons[Math.floor(Math.random() * _self.config.nbb.categoriesIcons.length)],
                    bgColor: _self.config.nbb.categoriesBgColors[Math.floor(Math.random() * _self.config.nbb.categoriesBgColors.length)],
                    background: _self.config.nbb.categoriesBackgrounds[Math.floor(Math.random() * _self.config.nbb.categoriesBackgrounds.length)],
                    color: _self.config.nbb.categoriesTextColors[Math.floor(Math.random() * _self.config.nbb.categoriesTextColors.length)]
                };

                Categories.create(category, function(err, categoryReturn) {
                    if (err) {
                        logger.warn('skipping category:_cid: ' + _cid + ' : ' + err);
                        storedCategory.skipped = normalizedCategory;
                        storage.setItem('c.' + _cid, storedCategory, function(err){
                            if (err) throw err;

                            // todo [async-going-sync-hack]
                            setTimeout(function(){done();}, 1);
                        });
                    } else {
                        storedCategory.imported = categoryReturn;

                        if (_self.redirectTemplates.categories.oldPath && _self.redirectTemplates.categories.newPath)
                            storedCategory.imported._redirect = _self._redirect(
                                $.extend(true, {}, storedCategory.normalized, storedCategory.imported),
                                _self.redirectTemplates.categories.oldPath,
                                _self.redirectTemplates.categories.newPath
                            );

                        storage.setItem('c.' + _cid, storedCategory, function(err){
                            if (err) throw err;

                            // todo [async-going-sync-hack]
                            setTimeout(function(){done();}, 1);
                        });
                    }
                });
            }
        }, function(err) {
            if (err) throw err;

            logger.debug('Importing ' + _self.mem._cids.length + ' categories took: ' + ((+new Date()-startTime)/1000).toFixed(2) + ' seconds');
            next();
        });
    },

    importUsers: function(next) {
        var count = 0,
            _self = this,
            logger = this.logger,
            startTime = +new Date(),
            flushed = this.config.nbb.setup.runFlush;

        async.eachLimit(this.mem._uids, this.config.nbb.usersBatchSize, function(_uid, done) {
            count++;

            var storedUser = storage.getItem('u.' + _uid);
            if (!storedUser || !storedUser.normalized) {
                logger.warn('[c:' + count + '] normalized user:_uid: ' + _uid + ' it doesn\'t exist in storage');

                // todo [async-going-sync-hack]
                setTimeout(function(){done();}, 1); return;
            }
            var	normalizedUser = storedUser.normalized,
                importedUser = flushed ? null : storedUser.imported,
                skippedUser = normalizedUser._skip ? {_uid: _uid} : flushed ? null : storedUser.skipped;

            if (importedUser || skippedUser) {
                logger.warn('[c:' + count + '] user:_uid: ' + _uid + ' already processed, destiny: ' + (importedUser ? 'imported' : 'skipped'));

                // todo [async-going-sync-hack]
                setTimeout(function(){done();}, 1);
            } else {

                var u = _self._makeValidNbbUsername(normalizedUser._username || '', normalizedUser._alternativeUsername || '');
                var user = {
                    username: u.username,
                    email: normalizedUser._email,
                    password: normalizedUser._password || _self._genRandPwd(_self.config.passwordGen.len, _self.config.passwordGen.chars)
                };

                if (!user.username) {
                    storedUser.skipped = user;
                    logger.warn('[c:' + count + '] skipping user: "' + user._username + '" username is invalid.');

                    // todo [async-going-sync-hack]
                    setTimeout(function(){done();}, 0);
                } else {
                    logger.debug('[c: ' + count + '] saving user:_uid: ' + _uid);
                    User.create(user, function(err, uid) {

                        if (err) {
                            logger.error('skipping username: "' + user.username + '" ' + err);
                            storedUser.skipped = user;
                            storage.setItem('u.' + _uid, storedUser, function(err){
                                if (err) throw err;

                                // todo [async-going-sync-hack]
                                setTimeout(function(){done();}, 1);
                            });
                        } else {

                            if (('' + normalizedUser._level).toLowerCase() == 'moderator') {
                                _self._makeModeratorOnAllCategories(uid);
                                logger.warn(user.username + ' just became a moderator on all categories');

                            } else if (('' + normalizedUser._level).toLowerCase() == 'administrator') {

                                // if admin, joind the admins group
                                // no needs to joing the registered-users group
                                Group.join('administrators', uid, function(){
                                    logger.warn(user.username + ' became an Administrator');
                                });
                            }

                            var fields = {
                                // preseve the signature, but Nodebb allows a max of 255 chars, so i truncate with an '...' at the end
                                signature: _self.convert(_self._truncateStr(normalizedUser._signature || '', 252)),
                                // preserve the website, no check if valid or not though
                                website: normalizedUser._website || '',
                                // if that user is banned, we would still h/im/er to be
                                banned: normalizedUser._banned ? 1 : 0,
                                // reset the location
                                location: normalizedUser._location || '',
                                // preserse the  joindate, these must be in Milliseconds
                                joindate: normalizedUser._joindate || startTime,
                                reputation: (normalizedUser._reputation || 0) * _self.config.nbb.userReputationMultiplier,
                                profileviews: normalizedUser._profileViews || 0,
                                fullname: normalizedUser._fullname || '',
                                birthday: normalizedUser._birthday || '',
                                showemail: normalizedUser._showemail ? 1 : 0,

                                // this is a migration script, no one is online
                                status: 'offline'
                            };

                            var keptPicture = false;
                            if (normalizedUser._picture) {
                                fields.gravatarpicture = normalizedUser._picture;
                                fields.picture = normalizedUser._picture;
                                keptPicture = true;
                            }

                            logger.raw('[user-json] {"email":"' + user.email + '","username":"' + user.username + '","pwd":"' + user.password + '",_uid":' + _uid + ',"uid":' + uid +',"ms":' + fields.joindate + '},');
                            logger.raw('[user-csv] ' + user.email + ',' + user.username + ',' + user.password + ',' + _uid + ',' + uid + ',' + fields.joindate);

                            User.setUserFields(uid, fields, function(err, result) {
                                if (err){done(err); throw err;}

                                fields.uid = uid;
                                storedUser.imported = $.extend(true, {}, user, fields);
                                storedUser.imported._keptPicture = keptPicture;
                                storedUser.imported.userslug = u.userslug;

                                if (_self.redirectTemplates.users.oldPath && _self.redirectTemplates.users.newPath)
                                    storedUser.imported._redirect = _self._redirect(
                                        $.extend(true, {}, storedUser.normalized, storedUser.imported),
                                        _self.redirectTemplates.users.oldPath,
                                        _self.redirectTemplates.users.newPath
                                    );

                                if (_self.config.nbb.autoConfirmEmails) {
                                    DB.setObjectField('email:confirmed', user.email, '1', function() {
                                        storage.setItem('u.' + _uid, storedUser, function(err){
                                            if (err) throw err;

                                            // todo [async-going-sync-hack]
                                            setTimeout(function(){done();}, 1);
                                        });
                                    });
                                } else {
                                    storage.setItem('u.' + _uid, storedUser, function(err){
                                        if (err) throw err;

                                        // todo [async-going-sync-hack]
                                        setTimeout(function(){done();}, 1);
                                    });
                                }
                            });
                        }
                    });
                }
            }
        }, function(err) {
            if (err) throw err;

            logger.info('Importing ' + _self.mem._uids.length + ' users took: ' + ((+new Date() - startTime)/1000).toFixed(2) + ' seconds');

            // hard code the first UBB Admin user as imported, as it may actually own few posts/topics
            storage.setItem('u.1', {normalized: {_uid: 1}, imported: {uid: 1}});

            if (_self.config.nbb.autoConfirmEmails) {
                async.parallel([
                    function(done){
                        DB.keys('confirm:*', function(err, keys){
                            keys.forEach(function(key){
                                DB.delete(key);
                            });
                            done();
                        });
                    },
                    function(done){
                        DB.keys('email:*:confirm', function(err, keys){
                            keys.forEach(function(key){
                                DB.delete(key);
                            });
                            done();
                        });
                    }
                ], next);

            } else {
                next();
            }
        });
    },

    importTopics: function(next) {
        var _self = this,
            count = 0,
            logger = this.logger,
            startTime = +new Date(),
            flushed = this.config.nbb.setup.runFlush;

        async.eachLimit(this.mem._tids, this.config.nbb.topicsBatchSize, function(_tid, done) {
            count++;

            var storedTopic = storage.getItem('t.' + _tid);
            if (!storedTopic || !storedTopic.normalized) {
                logger.warn('[c:' + count + '] normalized topic:_tid: ' + _tid + ' it doesn\'t exist in storage');

                // todo [async-going-sync-hack]
                setTimeout(function(){done();}, 1); return;
            }
            var normalizedTopic = storedTopic.normalized,
                importedTopic = flushed ?  null : storedTopic.imported,
                skippedTopic = normalizedTopic._skip ? {_tid: _tid} : flushed ? null : storedTopic.skipped;

            if (importedTopic || skippedTopic) {
                logger.warn('[c:' + count + '] topic:_tid: ' + _tid + ' already processed, destiny: ' + (importedTopic ? 'imported' : 'skipped'));

                // todo [async-going-sync-hack]
                setTimeout(function(){done();}, 1);
            }  else {

                var importedCategory = (storage.getItem('c.' + normalizedTopic._cid) || {}).imported;
                var importedUser = (storage.getItem('u.' + normalizedTopic._uid) || {}).imported;

                if (!importedUser || !importedCategory) {
                    logger.warn('[c:' + count + '] skipping topic:_tid:"' + _tid + '" --> _cid:valid: ' + !!importedCategory  + ' _uid:valid: ' + !!importedUser);
                    storedTopic.skipped = normalizedTopic;
                    storage.setItem('t.' + _tid, storedTopic, function(err){
                        if (err) throw err;

                        // todo [async-going-sync-hack]
                        setTimeout(function(){done();}, 1);
                    });
                } else {
                    logger.debug('[c:' + count + '] saving topic:_tid: ' + _tid);

                    Topics.post({

                        uid: importedUser.uid,
                        title: normalizedTopic._title,
                        content: _self.convert(normalizedTopic._content),
                        cid: importedCategory.cid,
                        thumb: normalizedTopic.thumb

                    }, function(err, returnTopic){
                        if (err) {
                            logger.warn('skipping topic:_tid: ' + _tid + ' ' + err);
                            storedTopic.skipped = normalizedTopic;
                            storage.setItem('t.' + _tid, storedTopic, function(err){
                                if (err) throw err;

                                // todo [async-going-sync-hack]
                                setTimeout(function(){done();}, 1);
                            });
                        } else {

                            var timestamp = normalizedTopic._timestamp || startTime;
                            var relativeTime = new Date(timestamp).toISOString();

                            var topicFields = {
                                viewcount: normalizedTopic._viewcount || 0,

                                // assume that this topic not locked for now, but will iterate back again at the end and lock it back after finishing the importPosts()
                                // locked: normalizedTopic._locked ? 1 : 0,
                                locked: 0,

                                deleted: normalizedTopic._deleted ? 1 : 0,

                                // if pinned, we should set the db.sortedSetAdd('categories:' + cid + ':tid', Math.pow(2, 53), tid);
                                pinned: normalizedTopic._pinned ? 1 : 0,
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
                            if (topicFields.pinned)
                                DB.sortedSetAdd('categories:' + importedCategory.cid + ':tid', Math.pow(2, 53), returnTopic.topicData.tid);

                            DB.setObject('topic:' + returnTopic.topicData.tid, topicFields, function(err, result) {

                                if (err) {done(err); throw err;}

                                Posts.setPostFields(returnTopic.postData.pid, postFields, function(){
                                    storedTopic.imported = $.extend(true, {}, returnTopic.topicData, topicFields);

                                    if (_self.redirectTemplates.topics.oldPath && _self.redirectTemplates.topics.newPath)
                                        storedTopic.imported._redirect = _self._redirect(
                                            $.extend(true, {}, storedTopic.normalized, storedTopic.imported),
                                            _self.redirectTemplates.topics.oldPath,
                                            _self.redirectTemplates.topics.newPath
                                        );

                                    // keep a field on it to lock it back later
                                    storedTopic.imported._lockme = normalizedTopic._locked ? 1 : 0;

                                    storage.setItem('t.' + _tid, storedTopic, function(err){
                                        if (err) throw err;

                                        // todo [async-going-sync-hack]
                                        setTimeout(function(){done();}, 1);
                                    });
                                });
                            });

                        }
                    });
                }
            }
        }, function(err) {
            if (err) throw err;

            logger.info('Importing ' + _self.mem._tids.length + ' topics took: ' + ((+new Date()-startTime)/1000).toFixed(2) + ' seconds');
            next();
        });
    },

    importPosts: function(next) {
        var _self = this,
            count = 0,
            logger = this.logger,
            startTime = +new Date(),
            flushed = this.config.nbb.setup.runFlush;

        async.eachLimit(this.mem._pids, this.config.nbb.postsBatchSize, function(_pid, done) {
            count++;

            var storedPost = storage.getItem('p.' + _pid);
            if (!storedPost || !storedPost.normalized) {
                logger.warn('[c:' + count + '] skipped post:_pid: ' + _pid + ' it doesn\'t exist in storage');

                // todo [async-going-sync-hack]
                setTimeout(function(){done();}, 1); return;
            }

            var	normalizedPost = storedPost.normalized,
                importedPost = flushed ? null : storedPost.imported,
                skippedPost = normalizedPost._skip ? {_pid: _pid} : flushed ? null : storedPost.skipped;

            if (importedPost || skippedPost) {
                logger.warn('skipping post:_pid: ' + _pid + ' already processed, destiny: ' + (importedPost ? 'imported' : 'skipped'));

                // todo [async-going-sync-hack]
                setTimeout(function(){done();}, 1);
            } else {

                var importedTopic = (storage.getItem('t.' + normalizedPost._tid) || {}).imported;
                var importedUser = (storage.getItem('u.' + normalizedPost._uid) || {}).imported;

                if (!importedUser || !importedTopic) {
                    logger.warn('skipping post:_pid: ' + _pid + ' _tid:valid: ' + !!importedTopic + ' _uid:valid: ' + !!importedUser);
                    storedPost.skipped = normalizedPost;
                    storage.setItem('p.' + _pid, storedPost, function(err) {
                        if (err) throw err;

                        // todo [async-going-sync-hack]
                        setTimeout(function(){done();}, 1);
                    });
                } else {

                    logger.debug('[c: ' + count + '] saving post: ' + _pid);
                    Posts.create({

                        uid: importedUser.uid,
                        tid: importedTopic.tid,
                        content: _self.convert(normalizedPost._content || ''),

                        // i seriously doubt you have this, but it's ok if you don't
                        toPid: normalizedPost['_nbb-toPid']

                    }, function(err, postReturn){
                        if (err) {
                            logger.warn('skipping post: ' + normalizedPost._pid + ' ' + err);
                            storedPost.skipped = normalizedPost;
                            storage.setItem('p.' + _pid, storedPost, function(err){
                                if (err) throw err;

                                // todo [async-going-sync-hack]
                                setTimeout(function(){done();}, 1);
                            });
                        } else {
                            var fields = {
                                timestamp: normalizedPost._timestamp || startTime,
                                reputation: normalizedPost._reputation || 0,
                                votes: normalizedPost._votes || 0,
                                edited: normalizedPost._edited || 0,
                                deleted: normalizedPost._deleted || 0,

                                // todo: not sure if I need this
                                relativeTime: new Date(normalizedPost._timestamp || startTime).toISOString()
                            };
                            Posts.setPostFields(postReturn.pid, fields, function(){
                                if (_self.redirectTemplates.posts && _self.redirectTemplates.posts.oldPath && _self.redirectTemplates.posts.newPath)
                                    postReturn._redirect = _self._redirect(
                                        $.extend(true, {}, storedPost.normalized, storedPost.imported),
                                        _self.redirectTemplates.posts.oldPath,
                                        _self.redirectTemplates.posts.newPath
                                    );

                                storedPost.imported = $.extend(true, {}, postReturn, fields);

                                storage.setItem('p.' + _pid, storedPost, function(err) {
                                    if (err) throw err;

                                    // todo [async-going-sync-hack]
                                    setTimeout(function(){done();}, 1);
                                });
                            });
                        }
                    });
                }
            }
        }, function(){
            logger.info('Importing ' + _self.mem._pids.length + ' posts took: ' + ((+new Date() - startTime)/1000).toFixed(2) + ' seconds');
            next();
        });
    },

    relockUnlockedTopics: function(next) {
        var _self = this,
            count = 0,
            logger = this.logger,
            startTime = +new Date();

        async.eachLimit(this.mem._tids, 5, function(_tid, done) {
            count++;

            var storedTopic = storage.getItem('t.' + _tid);
            if (!storedTopic || !storedTopic.imported || !storedTopic.imported.tid) {
                logger.warn('[c:' + count + '] imported topic:_tid: ' + _tid + ' doesn\'t exist in storage, probably skipped some time earlier in the import process, dont freak out');

                // todo [async-going-sync-hack]
                setTimeout(function(){done();}, 1); return;
            } else {
                if (storedTopic.imported._lockme) {
                    DB.setObjectField('topic:' + storedTopic.imported.tid, 'locked', '1', function(err){
                        if (err) {
                            logger.error(err);
                        } else {
                            logger.info('[c: ' + count + '] locked topic:' + storedTopic.imported.tid + ' back');
                        }
                        // todo [async-going-sync-hack]
                        setTimeout(function(){done();}, 1);
                    });
                } else {
                    // todo [async-going-sync-hack]
                    setTimeout(function(){done();}, 1);
                }
            }
        }, function(err) {
            if (err) throw err;

            logger.info('Relocking ' + _self.mem._tids.length + ' topics took: ' + ((+new Date()-startTime)/1000).toFixed(2) + ' seconds');
            next();
        });
    },

    report: function(next) {
        var logger = this.logger;

        logger.raw('\n\n====  REMEMBER TO:\n'
            + '\n\t*-) Email all your users their new passwords, find them in the map file reported few lines down.'
            + '\n\t*-) Go through all users in the saved users map, eachs who has user.customPicture == true, test the image url if 200 or not, also filter the ones pointing to your old forum avatar dir, or keep that dir ([YOUR_UBB_PATH]/images/avatars/*) path working, your call'
            + '\n\t*-) Create a nodebb-theme that works with your site'
            + '\n\t*-) I may write a NodeBB plugin to enforce one time use of temp passwords, if you beat me to it, let me know');

        logger.raw('\n\nFind a gazillion file (for your redirection maps and user\'s new passwords) in: ' + this.config.storageDir + '\n');
        logger.raw('These files have a pattern u.[_uid], c.[_cid], t.[_tid], p.[_pid], \'cat\' one of each to view the structure.\n');
        logger.raw('----> Or if you saved these stdout logs, '
            + '\n\t look for "[user-json]" or "[user-csv]" to find all the users mapping.'
            + '\n\t look for "[redirect]" to find all the old --> new paths mapping.\n');
        logger.info('DONE, Took ' + ((+new Date() - this.mem.startTime) / 1000 / 60).toFixed(2) + ' minutes.');
        next();
    },

    exit: function(code, msg){
        code = this._isNumber(code) ? code : 0;
        this.logger.info('Exiting ... code: ' + code + ( msg ? ' msg: ' + msg : '') );
        process.exit(code);
    },

    // helpers
    _runNbbSetup: function(next) {
        var node,
            result,
            command,
            _self = this,
            logger = this.logger,
            execSync = require('exec-sync'),
            setupVal = JSON.stringify(this.config.nbb.setup.setupVal).replace(/"/g, '\\"'),

            setup = function(next) {
                logger.debug('starting nodebb setup');
                try {

                    // todo: won't work on windows
                    // todo: do i even need this?
                    node = execSync('which node', true).stdout;
                    logger.debug('node lives here: ' + node);

                    // assuming we're in nodebb/node_modules/nodebb-plugin-import
                    command = node + ' ' + __dirname + '/../../../app.js --setup="' + setupVal + '"';
                    logger.info('Calling this command on your behalf: \n' + command + '\n\n');
                    result = execSync(command, true);

                } catch (e){
                    logger.error(e);
                    logger.info('COMMAND');
                    logger.info(result);
                    _self.exit(1);
                }
                if (!result.stderr) {
                    logger.info('\n\nNodeBB re-setup completed.');
                    _self._clearDefaultCategories(next);
                } else {
                    logger.error(JSON.stringify(result));
                    throw new Error('NodeBB automated setup didn\'t go too well. ');
                }
            };

        DB.flushdb(function(err) {
            if (err) throw err;
            logger.info('flushdb done.');
            setup(next);
        });
    },

    _clearDefaultCategories: function(next) {
        var _self = this;

        // deleting the first 12 default categories by nbb
        DB.keys('category:*', function(err, arr) {
            arr.forEach(function(k){
                DB.delete(k);
            });
            DB.delete('categories:cid', function(){
                _self._backupConfig(next);
            });
        });
    },

    _backupConfig: function(next) {
        var _self = this;

        DB.getObject('config', function(err, data) {
            if (err) throw err;
            _self.logger.debug('backing up configs');
            _self.logger.debug(JSON.stringify(data));

            _self.config.backedConfig = data || {};
            storage.setItem('import.backedConfig', _self.config.backedConfig);
            _self._setTempConfig(next);
        });
    },

    _setTempConfig: function(next) {

        // get the nbb backedConfigs, change them, then set them back to the db
        // just to make the transition a little less flexible
        // yea.. i dont know .. i have a bad feeling about this
        var config = $.extend(true, {}, this.config.backedConfig, this.config.nbb.tempConfig);


        // if you want to auto confirm email, set the host to null, if there is any
        // this will prevent User.sendConfirmationEmail from setting expiration time on the email address
        // per https://github.com/designcreateplay/NodeBB/blob/master/src/user.js#L458'ish
        if (this.config.nbb.autoConfirmEmails)
            config['email:smtp:host'] = '';

        this.logger.debug('setting temp configs');
        this.logger.debug(JSON.stringify(config));

        DB.setObject('config', config, function(err){
            if (err) throw err;
            next();
        });
    },


    // im nice
    restoreConfig: function(next) {
        var _self = this, logger = this.logger;

        this.config.backedConfig = storage.getItem('import.backedConfig');

        this.logger.debug('restoring configs');
        this.logger.debug(JSON.stringify(this.config.backedConfig));

        DB.setObject('config', this.config.backedConfig, function(err){
            if (err) {
                logger.error('Something went wrong while restoring your nbb configs');
                logger.warn('here are your backed-up configs, you do it.');
                logger.warn(JSON.stringify(_self.config.backedConfig));
                throw err;
            }
            next();
        });
    },

    // aka forums
    _makeModeratorOnAllCategories: function(uid){
        var _self = this;
        this.mem._cids.forEach(function(cid) {
            //
            var category = storage.getItem('c.' + cid);
            if (category && category.imported) {
                Group.join('group:cid:' + cid + ':privileges:mods:members', uid, function(err){
                    if (err)
                        _self.logger.error(err);
                });
            }
        });
    },

    _redirect: function(data, oldPath, newPath) {
        var o = oldPath(data);
        var n = newPath(data);

        //todo: save them somewhere more than the just logs
        // that'll make them for a quick json map
        // gotta replace the [redirect] though
        this.logger.raw('[redirect] "' + o + '":"' + n +'",');
        return {oldPath: o, newPath: n};
    },

    // which of the values is falsy
    _whichIsFalsy: function(arr){
        for (var i = 0; i < arr.length; i++) {
            if (!arr[i])
                return i;
        }
        return null;
    },

    // a helper method to generate temporary passwords
    _genRandPwd: function(len, chars) {
        var index = (Math.random() * (chars.length - 1)).toFixed(0);
        return len > 0 ? chars[index] + this._genRandPwd(len - 1, chars) : '';
    },

    _truncateStr : function (str, len) {
        if (typeof str != 'string') return str;
        len = this._isNumber(len) && len > 3 ? len : 20;
        return str.length <= len ? str : str.substr(0, len - 3) + '...';
    },

    _isNumber : function (n) {
        return !isNaN(parseFloat(n)) && isFinite(n);
    },

    // todo: i think I got that right?
    _cleanUsername: function(str) {
        str = str.replace(/[^\u00BF-\u1FFF\u2C00-\uD7FF\-.*\w\s]/gi, '');
        // todo: i don't know what I'm doing HALP
        return str.replace(/ /g,'').replace(/\*/g, '').replace(/æ/g, '').replace(/ø/g, '').replace(/å/g, '');
    },

    // todo: holy fuck clean this shit
    _makeValidNbbUsername: function(_username, _alternativeUsername) {
        var _self = this,
            logger = this.logger,
            _userslug = utils.slugify(_username || '');

        if (utils.isUserNameValid(_username) && _userslug) {
            return {username: _username, userslug: _userslug};

        } else {

            logger.warn(_username + ' [_username] is invalid, attempting to clean.');
            var username = _self._cleanUsername(_username);
            var userslug = utils.slugify(username);

            if (utils.isUserNameValid(username) && userslug) {
                return {username: username, userslug: userslug};

            } else if (_alternativeUsername) {

                logger.warn(username + ' [_username.cleaned] is still invalid, attempting to use the _alternativeUsername.');
                var _alternativeUsernameSlug = utils.slugify(_alternativeUsername);

                if (utils.isUserNameValid(_alternativeUsername) && _alternativeUsernameSlug) {
                    return {username: _alternativeUsername, userslug: _alternativeUsernameSlug};

                } else {

                    logger.warn(_alternativeUsername + ' [_alternativeUsername] is invalid, attempting to clean.');
                    var alternativeUsername = _self._cleanUsername(_alternativeUsername);
                    var alternativeUsernameSlug = utils.slugify(alternativeUsername);

                    if (utils.isUserNameValid(alternativeUsername) && alternativeUsernameSlug) {
                        return {username: alternativeUsername, userslug: alternativeUsernameSlug};
                    } else {
                        logger.warn(alternativeUsername + ' [_alternativeUsername.cleaned] is still invalid. sorry. no luck');
                        return {username: null, userslug: null};
                    }
                }
            } else {
                return {username: null, userslug: null};
            }
        }
    },

    // using my fork of html-md, we create the window via jsdom once at the top, then just pass the reference,
    // which will avoid jsdom.jsdom().createWindow() every time, much, much faster, and avoids memory leaks
    _htmlToMd: (function(window){
        return function(str){
            return htmlMd(str, {window: window});
        }
    })(window),

    // from https://github.com/feralhosting/BBCode-To-Markdown-Converter
    // edited a little bit to close over the regexps
    _bbcodeToMd: (function(){
        //general BBcode conversion
        var r1 = [/^\[h1\](.*)\[\/h1\]\s*$/gmi, "$1\n===\n"], //h4; replace [h1] $1 [/h1] with # $1 adds a new line. Feral specific.
            r2 = [/^\[h2\](.*)\[\/h2\]\s*$/gmi, "$1\n---\n"], //h2; replace [h2] $1 [/h2] with ## $1 adds a new line. Feral specific.
            r3 = [/^\[h3\](.*)\[\/h3\]\s*$/gmi, "### $1\n"], //h3; replace [h3] $1 [/h3] with ### $1 adds a new line. Feral specific.
            r4 = [/^\[h4\](.*)\[\/h4\]\s*$/gmi, "#### $1\n"], //h4; replace [h4] $1 [/h4] with #### $1 adds a new line. Feral specific.
            r5 = [/^\[h5\](.*)\[\/h5\]\s*$/gmi, "##### $1\n"], //h2; replace [h5] $1 [/h5] with ##### $1 adds a new line. Feral specific.
            r6 = [/^\[h6\](.*)\[\/h6\]\s*$/gmi, "###### $1\n"], //h3; replace [h6] $1 [/h6] with ###### $1 adds a new line. Feral specific.
            r7 = [/\[b\]\[i\]((?:.|\n)+?)\[\/i\]\[\/b\]/gmi, "***$1***"], //bold + italic; replace [b][i] $1 [/i][/b] with ***$1***
            r8 = [/\[i\]\[b\]((?:.|\n)+?)\[\/b\]\[\/i\]/gmi, "***$1***"], //bold + italic; replace [b][i] $1 [/i][/b] with ***$1***
            r9 = [/\[b\]((?:.|\n)+?)\[\/b\]/gmi, "**$1**"], //bold; replace [b] $1 [/b] with ** $1 **
            r10 = [/\[strong\]((?:.|\n)+?)\[\/strong\]/gmi, "**$1**"], //bold; replace [b] $1 [/b] with ** $1 **
            r11 = [/\[i\]((?:.|\n)+?)\[\/i\]/gmi, "`$1`"],  //italic; replace [i] $1 [/i] with ` $1 `
            r12 = [/\[em\]((?:.|\n)+?)\[\/em\]/gmi, "`$1`"],  //italic; replace [em] $1 [/em] with ` $1 `
            r13 = [/\[code\]((?:.|\n)+?)\[\/code\]/gmi, "~~~\n$1\n~~~\n"],  //code; replace [code] $1 [/code] with $1 also adds a new line. Feral specific.
            r14 = [/\[code single\]((?:.|\n)+?)\[\/code\]/gmi, "`$1\`"],  //code; replace [code single] $1 [/code] with $1. Feral specific.
            r15 = [/\[img\]((?:.|\n)+?)\[\/img\]/gmi,"![]($1)"],
            r16 = [/\[url\]((?:.|\n)+?)\[\/url\]/gmi,"[$1]($1)"],
            r17 = [/\[url=(.+?)\]((?:.|\n)+?)\[\/url\]/gmi,"[$2]($1)"],
            r18 = [/\[s\]((?:.|\n)+?)\[\/s\]/gmi, "~~   $1 ~~"], //strikethrough; replace [s] $1 [/s] with ~~ $1 ~~
            r19 = [/\[color\=.+?\]((?:.|\n)+?)\[\/color\]/gmi, "$1"], //remove [color] tags
            r20 = [/(\n)\[\*\]/gmi, "$1* "], //lists; replace lists with + unordered lists.
            r21 = [/\[\/*list\]/gmi, ""],
            r22 = [/\[u\]((?:.|\n)+?)\[\/u\]/gmi, "*$1*"];    //underline; replace [u] $1 [/u] with * $1 *

        return function(str){
            return (str || '')
                .replace(r1[0], r1[1])
                .replace(r2[0], r2[1])
                .replace(r3[0], r3[1])
                .replace(r4[0], r4[1])
                .replace(r5[0], r5[1])
                .replace(r6[0], r6[1])
                .replace(r7[0], r7[1])
                .replace(r8[0], r8[1])
                .replace(r9[0], r9[1])
                .replace(r10[0], r10[1])
                .replace(r11[0], r11[1])
                .replace(r12[0], r12[1])
                .replace(r13[0], r13[1])
                .replace(r14[0], r14[1])
                .replace(r15[0], r15[1])
                .replace(r16[0], r16[1])
                .replace(r17[0], r17[1])
                .replace(r18[0], r18[1])
                .replace(r19[0], r19[1])
                .replace(r20[0], r20[1])
                .replace(r21[0], r21[1])
                .replace(r22[0], r22[1]);
        };
    })()
};

module.exports = Import;
