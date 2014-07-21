'use strict';

var Group, Meta, User, Topics, Posts, Categories, CategoryTools, DB, nconf,

// nodebb utils, useful
	utils = require('../../../public/src/utils.js'),

// I'm lazy, dont hire me
	async = require('async'),
	fs = require('fs-extra'),
	path = require('path'),
	events = require('events'),
	storage = require('node-persist'),
	Logger = require('tiny-logger'),
	logger,

    parse = require('../parse'),

// using a temporary manual fork till https://github.com/neocotic/html.md/pull/43 gets merged
	htmlMd = require('html-md-optional_window'),

// i use that for the lodash template
	_ = require('underscore'),

// dont ask, well, jquery needs it and at the bottom 'html-to-md' also needs a window object, because it uses jsdom
	window = require("jsdom").jsdom(null, null, {features: {FetchExternalResources: false}}).createWindow(),
// i use that to deep extend, yea that's it
	nodeExtend = require('node.extend'),
// yup im that lazy, you're only using this once, y do u care?

	Import = function (config) {
		var self = this;

		this.dispatcher = new events.EventEmitter();

		this.config = nodeExtend(true, {}, {

				log: 'info,warn,error,debug',
				// generate passwords for the users, yea
				passwordGen: {
					enabled: false,
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

						adminConfig: {
							'admin:username': 'admin',
							'admin:password': 'password',
							'admin:password:confirm': 'password',
							'admin:email': 'admin@example.com'
						},

						fileConfig: null
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
						minimumPasswordLength: 0,
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

		var nbbFileConfig,
			nbbConfigFile = path.resolve('../../config.json');

		if (this.config.nbb.setup.fileConfig) {

			// user passed own fileConfig
			nbbFileConfig = this.config.nbb.setup.fileConfig;
		} else if (fs.existsSync(nbbConfigFile)) {

			// if not, check if NodeBB/config.json exists
			// if yes, load it and use these values
			nbbFileConfig = fs.readJsonSync(nbbConfigFile);
		}

		if (!nbbFileConfig) {
			throw new Error('Either specify a \'config.nbb.setup.fileConfig\' or create a valid ' + nbbConfigFile + ' file by running the initial NodeBB setup');
		}

		nbbFileConfig.use_port = nbbFileConfig.use_port === true || nbbFileConfig.use_port === 'true' || nbbFileConfig.use_port === 'y' ? 'y' : 'n';
		this.config.nbb.setup.fileConfig = nbbFileConfig;

		// combine both fileConfig and adminConfig into a single nbb.setup.config
		this.config.nbb.setup.config = nodeExtend(true, {}, this.config.nbb.setup.fileConfig, this.config.nbb.setup.adminConfig);

		// get nconf to read new configs
		nconf.defaults(this.config.nbb.setup.config);

		// requiring DB after configs, since it could be either mongo or redis now
		// assumed in NodeBB/node_modules/nodebb-plugin-importer
		// the try catch are a workaround in case plugin was deactived, since this a terminal use only plugin
		// same for the rest of the objects right below
		if (this.config.nbb.setup.config.database === 'redis') {
			nconf.set('database', 'redis');
		} else if (this.config.nbb.setup.config.database === 'mongo') {
			nconf.set('database', 'mongo');
		} else if (this.config.nbb.setup.config.database === 'level') {
			nconf.set('database', 'level');
			throw new Error('Leveldb is not supported yet :/ issue#19');
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
	};

Import.prototype = {

	init: function() {
		var self = this;

		//init logger
		logger = Logger.init(this.config.log, '[import]');
		logger.debug('init()');

		// find storage dir
		this.config.storageDir = path.resolve(this.config.storageDir);
		if(!fs.existsSync(this.config.storageDir) || !fs.lstatSync(this.config.storageDir).isDirectory()) {
			throw new Error(this.config.storageDir + ' does not exist or is not a directory');
		}

		logger.info("Loading storage directory: " + this.config.storageDir + ' into memory, please be patient, that might take few minutes depending on many records you are importing...');

		// init storage module
		storage.initSync({dir: this.config.storageDir});

		logger.info("Loading storage done");

		//compile this.config.redirectTemplatesStrings strings, and save them in this.redirectTemplates
		this.redirectTemplates = {
			categories: {},
			users: {},
			topics: {},
			posts: {}
		};

		Object.keys(this.config.redirectTemplatesStrings || {}).forEach(function(key) {
            var model = self.config.redirectTemplatesStrings[key];
            if (model && model.oldPath && model.newPath) {
				self.redirectTemplates[key].oldPath = _.template(model.oldPath);
                self.redirectTemplates[key].newPath = _.template(model.newPath);
            }
        });

		this.convert = (function() {
			var fnNames = [];
			(self.config.convert || '').split(',').forEach(function(fnName) {
				fnName = fnName.trim();
				if (typeof self[fnName] === 'function') {
					fnNames.push(fnName);
				}
			});
			return function(s) {
				s = parse.before(s);

                fnNames.forEach(function(fnName) {
					s = self[fnName](s);
				});

                s = parse.after(s);
                return s;
			};
		})();

		logger.info("Connecting to Database");

		DB.init(function(err) {
			if (err) {
				throw err;
			}

			DB.keys = nconf.get('database') == 'redis' ?
				function(key, callback) {
					DB.client.keys(key, callback);
				}
				: nconf.get('database') == 'mongo' ?
				function(key, callback) {
					DB.client.collection('objects').find( { _key: { $regex: key.replace(/\*/, '.*') } }, function(err, result) {
						if (err) {
							logger.warn('db.keys()');
							logger.warn(err);
							callback(err);
						} else {
							result.toArray(function(err, arr) {
								if (err) {
									logger.warn(err);
								}
								callback(err, !err && arr && arr[0] ?
									Object.keys(arr[0]).map(function(v) {
										return key.replace(/\*/, v).replace(/\uff0E/g, '.');
									}) : []);
							});
						}
					});
				}
				: function(key, callback) {
				throw new Error(nconf.get('database') + ' database keys() function is not supported yet, bug me, I\'ll add it.');
			};

			self.trigger('init.done');
		});
	},

	start: function() {
		var self = this;
		logger.debug('start()');
		async.series([
			function(next){
				self.setup(next);
			},
			function(next) {
				logger.info('\n\nImporting Categories ...\n\n');
				self.importCategories(next);
			},
			function(next) {
				logger.info('\n\nImporting Users ...\n\n');
				self.importUsers(next);
			},
			function(next) {
				logger.info('\n\nImporting Topics ...\n\n');
				self.importTopics(next);
			},
			function(next) {
				logger.info('\n\nImporting Posts ...\n\n');
				self.importPosts(next);
			},
			function(next) {
				logger.info('\n\nLocking temp-unlocked Topics back  ...\n\n');
				self.relockUnlockedTopics(next);
			},
			function(next) {
				logger.info('\n\nFixing topic timestamp to last posts in topic  ...\n\n');
				self.fixTopicTimestamps(next);
			},
			function(next) {
				self.restoreConfig(next);
			},
			function(next) {
				self.report(next);
			},
			function(){
				self.exit();
			}
		]);
	},

	setup: function(next) {
		logger.debug('setup()');

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
			self = this,
			startTime = +new Date(),
			flushed = this.config.nbb.setup.runFlush;

		async.eachLimit(this.mem._cids, this.config.nbb.categoriesBatchSize, function(_cid, done) {
			count++;

			var storedCategory = storage.getItem('c.' + _cid);
			if (!storedCategory || !storedCategory.normalized) {
				logger.warn('[count:' + count + '] normalized category:_cid: ' + _cid + ' it doesn\'t exist in storage');

				// todo [async-going-sync-hack]
				setTimeout(function(){done();}, 0); return;
			}

			var	normalizedCategory = storedCategory.normalized,
				importedCategory = flushed ? null : storedCategory.imported,
				skippedCategory = normalizedCategory._skip ? {_cid: _cid} : flushed ? null : storedCategory.skipped;

			if (importedCategory || skippedCategory) {
				logger.warn('[count:' + count + '] category:_cid: ' + _cid + ' already processed, destiny: ' + (importedCategory ? 'imported' : 'skipped'));

				// todo [async-going-sync-hack]
				setTimeout(function(){done();}, 0);
			} else {
				logger.debug('[count:' + count + '] saving category:_cid: ' + _cid);

				var category = {
					name:  self.convert(normalizedCategory._name || ('Category ' + (count + 1))),
					description: self.convert(normalizedCategory._description || 'no description available'),

					// you can fix the order later, nbb/admin
					order: normalizedCategory._order || count + 1,

					disabled: normalizedCategory._disabled || 0,

					link: normalizedCategory._link || 0,

					// roulette, that too,
					icon: self.config.nbb.categoriesIcons[Math.floor(Math.random() * self.config.nbb.categoriesIcons.length)],
					bgColor: self.config.nbb.categoriesBgColors[Math.floor(Math.random() * self.config.nbb.categoriesBgColors.length)],
					background: self.config.nbb.categoriesBackgrounds[Math.floor(Math.random() * self.config.nbb.categoriesBackgrounds.length)],
					color: self.config.nbb.categoriesTextColors[Math.floor(Math.random() * self.config.nbb.categoriesTextColors.length)]
				};

				Categories.create(category, function(err, categoryReturn) {
					if (err) {
						logger.warn('skipping category:_cid: ' + _cid + ' : ' + err);
						storedCategory.skipped = normalizedCategory;
						storage.setItem('c.' + _cid, storedCategory, function(err){
							if (err) throw err;

							// todo [async-going-sync-hack]
							setTimeout(function(){done();}, 0);
						});
					} else {
						storedCategory.imported = categoryReturn;

						if (self.redirectTemplates.categories.oldPath && self.redirectTemplates.categories.newPath)
							storedCategory.imported._redirect = self._redirect(
								nodeExtend(true, {}, storedCategory.normalized, storedCategory.imported),
								self.redirectTemplates.categories.oldPath,
								self.redirectTemplates.categories.newPath
							);

						storage.setItem('c.' + _cid, storedCategory, function(err){
							if (err) throw err;

							// todo [async-going-sync-hack]
							setTimeout(function(){done();}, 0);
						});
					}
				});
			}
		}, function(err) {
			if (err) throw err;

			logger.debug('Importing ' + self.mem._cids.length + ' categories took: ' + ((+new Date()-startTime)/1000).toFixed(2) + ' seconds');
			next();
		});
	},

	importUsers: function(next) {
		var count = 0,
			self = this,
			startTime = +new Date(),
			flushed = this.config.nbb.setup.runFlush,
			passwordGen = this.config.passwordGen.enabled ?
				function() {
					return self._genRandPwd(self.config.passwordGen.len, self.config.passwordGen.chars);
				} :
				function() {
					// undefined, no password
				};

		async.eachLimit(this.mem._uids, this.config.nbb.usersBatchSize, function(_uid, done) {
			count++;

			var storedUser = storage.getItem('u.' + _uid);
			if (!storedUser || !storedUser.normalized) {
				logger.warn('[count:' + count + '] normalized user:_uid: ' + _uid + ' it doesn\'t exist in storage');

				// todo [async-going-sync-hack]
				setTimeout(function(){done();}, 0); return;
			}
			var	normalizedUser = storedUser.normalized,
				importedUser = flushed ? null : storedUser.imported,
				skippedUser = normalizedUser._skip ? {_uid: _uid} : flushed ? null : storedUser.skipped;

			if (importedUser || skippedUser) {
				logger.warn('[count:' + count + '] user:_uid: ' + _uid + ' already processed, destiny: ' + (importedUser ? 'imported' : 'skipped'));

				// todo [async-going-sync-hack]
				setTimeout(function(){done();}, 0);
			} else {

				var u = self._makeValidNbbUsername(normalizedUser._username || '', normalizedUser._alternativeUsername || '');
				var user = {
					username: u.username,
					email: normalizedUser._email,
					password: normalizedUser._password || passwordGen()
				};


				if (!user.username) {
					storedUser.skipped = user;
					logger.warn('[count:' + count + '] skipping user: "' + user._username + '" username is invalid.');

					// todo [async-going-sync-hack]
					setTimeout(function(){done();}, 0);
				} else {
					logger.debug('[count: ' + count + '] saving user:_uid: ' + _uid);
					User.create(nodeExtend(true, {}, user), function(err, uid) {

						if (err) {
							logger.error('skipping username: "' + user.username + '" ' + err);
							storedUser.skipped = user;
							storage.setItem('u.' + _uid, storedUser, function(err){
								if (err) throw err;

								// todo [async-going-sync-hack]
								setTimeout(function(){done();}, 0);
							});
						} else {

							if (('' + normalizedUser._level).toLowerCase() == 'moderator') {
								self._makeModeratorOnAllCategories(uid);
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
								signature: self.convert(self._truncateStr(normalizedUser._signature || '', 252)),
								// preserve the website, no check if valid or not though
								website: normalizedUser._website || '',
								// if that user is banned, we would still h/im/er to be
								banned: normalizedUser._banned ? 1 : 0,
								// reset the location
								location: normalizedUser._location || '',
								// preserse the  joindate, these must be in Milliseconds
								joindate: normalizedUser._joindate || startTime,
								reputation: (normalizedUser._reputation || 0) * self.config.nbb.userReputationMultiplier,
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
								storedUser.imported = nodeExtend(true, {}, user, fields);
								storedUser.imported._keptPicture = keptPicture;
								storedUser.imported.userslug = u.userslug;

								if (self.redirectTemplates.users.oldPath && self.redirectTemplates.users.newPath)
									storedUser.imported._redirect = self._redirect(
										nodeExtend(true, {}, storedUser.normalized, storedUser.imported),
										self.redirectTemplates.users.oldPath,
										self.redirectTemplates.users.newPath
									);

								if (self.config.nbb.autoConfirmEmails) {
									DB.setObjectField('email:confirmed', user.email, '1', function() {
										storage.setItem('u.' + _uid, storedUser, function(err){
											if (err) throw err;

											// todo [async-going-sync-hack]
											setTimeout(function(){done();}, 0);
										});
									});
								} else {
									storage.setItem('u.' + _uid, storedUser, function(err){
										if (err) throw err;

										// todo [async-going-sync-hack]
										setTimeout(function(){done();}, 0);
									});
								}
							});
						}
					});
				}
			}
		}, function(err) {
			if (err) throw err;

			logger.info('Importing ' + self.mem._uids.length + ' users took: ' + ((+new Date() - startTime)/1000).toFixed(2) + ' seconds');

			if (self.config.nbb.autoConfirmEmails) {
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
		var self = this,
			count = 0,
			startTime = +new Date(),
			flushed = this.config.nbb.setup.runFlush;

		async.eachLimit(this.mem._tids, this.config.nbb.topicsBatchSize, function(_tid, done) {
			count++;

			var storedTopic = storage.getItem('t.' + _tid);
			if (!storedTopic || !storedTopic.normalized) {
				logger.warn('[count:' + count + '] normalized topic:_tid: ' + _tid + ' it doesn\'t exist in storage');

				// todo [async-going-sync-hack]
				setTimeout(function(){done();}, 0); return;
			}
			var normalizedTopic = storedTopic.normalized,
				importedTopic = flushed ?  null : storedTopic.imported,
				skippedTopic = normalizedTopic._skip ? {_tid: _tid} : flushed ? null : storedTopic.skipped;

			if (importedTopic || skippedTopic) {
				logger.warn('[count:' + count + '] topic:_tid: ' + _tid + ' already processed, destiny: ' + (importedTopic ? 'imported' : 'skipped'));

				// todo [async-going-sync-hack]
				setTimeout(function(){done();}, 0);
			}  else {

				var importedCategory = (storage.getItem('c.' + normalizedTopic._cid) || {}).imported;
				var importedUser = (storage.getItem('u.' + normalizedTopic._uid) || {}).imported || {};

				if (!importedCategory) {
					logger.warn('[count:' + count + '] skipping topic:_tid:"' + _tid + '" --> _cid:valid: ' + !!importedCategory);
					storedTopic.skipped = normalizedTopic;
					storage.setItem('t.' + _tid, storedTopic, function(err){
						if (err) throw err;

						// todo [async-going-sync-hack]
						setTimeout(function(){done();}, 0);
					});
				} else {
					logger.debug('[count:' + count + '] saving topic:_tid: ' + _tid);

					Topics.post({

						uid: importedUser.uid,
						title:  self.convert(normalizedTopic._title),
						content: self.convert(normalizedTopic._content),
						cid: importedCategory.cid,
						thumb: normalizedTopic.thumb

					}, function(err, returnTopic){
						if (err) {
							logger.warn('skipping topic:_tid: ' + _tid + ' ' + err);
							storedTopic.skipped = normalizedTopic;
							storage.setItem('t.' + _tid, storedTopic, function(err){
								if (err) throw err;

								// todo [async-going-sync-hack]
								setTimeout(function(){done();}, 0);
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
							if (topicFields.pinned) {
								DB.sortedSetAdd('categories:' + importedCategory.cid + ':tid', Math.pow(2, 53), returnTopic.topicData.tid);
							}  else {
								DB.sortedSetAdd('categories:' + importedCategory.cid + ':tid', timestamp, returnTopic.topicData.tid);
							}

							DB.setObject('topic:' + returnTopic.topicData.tid, topicFields, function(err, result) {

								if (err) {done(err); throw err;}

								Posts.setPostFields(returnTopic.postData.pid, postFields, function(){
									storedTopic.imported = nodeExtend(true, {}, returnTopic.topicData, topicFields);

									if (self.redirectTemplates.topics.oldPath && self.redirectTemplates.topics.newPath)
										storedTopic.imported._redirect = self._redirect(
											nodeExtend(true, {}, storedTopic.normalized, storedTopic.imported),
											self.redirectTemplates.topics.oldPath,
											self.redirectTemplates.topics.newPath
										);

									// keep a field on it to lock it back later
									storedTopic.imported._lockme = normalizedTopic._locked ? 1 : 0;

									storage.setItem('t.' + _tid, storedTopic, function(err){
										if (err) throw err;

										// todo [async-going-sync-hack]
										setTimeout(function(){done();}, 0);
									});
								});
							});

						}
					});
				}
			}
		}, function(err) {
			if (err) throw err;

			logger.info('Importing ' + self.mem._tids.length + ' topics took: ' + ((+new Date()-startTime)/1000).toFixed(2) + ' seconds');
			next();
		});
	},

	importPosts: function(next) {
		var self = this,
			count = 0,
			startTime = +new Date(),
			flushed = this.config.nbb.setup.runFlush;

		async.eachLimit(this.mem._pids, this.config.nbb.postsBatchSize, function(_pid, done) {
			count++;

			var storedPost = storage.getItem('p.' + _pid);
			if (!storedPost || !storedPost.normalized) {
				logger.warn('[count:' + count + '] skipped post:_pid: ' + _pid + ' it doesn\'t exist in storage');

				// todo [async-going-sync-hack]
				setTimeout(function(){done();}, 0); return;
			}

			var	normalizedPost = storedPost.normalized,
				importedPost = flushed ? null : storedPost.imported,
				skippedPost = normalizedPost._skip ? {_pid: _pid} : flushed ? null : storedPost.skipped;

			if (importedPost || skippedPost) {
				logger.warn('skipping post:_pid: ' + _pid + ' already processed, destiny: ' + (importedPost ? 'imported' : 'skipped'));

				// todo [async-going-sync-hack]
				setTimeout(function(){done();}, 0);
			} else {

				var importedTopic = (storage.getItem('t.' + normalizedPost._tid) || {}).imported;
				var importedUser = (storage.getItem('u.' + normalizedPost._uid) || {}).imported || {};

				if (!importedTopic) {
					logger.warn('skipping post:_pid: ' + _pid + ' _tid:valid: ' + !!importedTopic);
					storedPost.skipped = normalizedPost;
					storage.setItem('p.' + _pid, storedPost, function(err) {
						if (err) throw err;

						// todo [async-going-sync-hack]
						setTimeout(function(){done();}, 0);
					});
				} else {

					logger.debug('[count: ' + count + '] saving post: ' + _pid);
					Posts.create({

						uid: importedUser.uid,
						tid: importedTopic.tid,
						content: self.convert(normalizedPost._content || ''),
						timestamp: normalizedPost._timestamp || startTime,

						// i seriously doubt you have this, but it's ok if you don't
						toPid: normalizedPost['_nbb-toPid']

					}, function(err, postReturn){
						if (err) {
							logger.warn('skipping post: ' + normalizedPost._pid + ' ' + err);
							storedPost.skipped = normalizedPost;
							storage.setItem('p.' + _pid, storedPost, function(err){
								if (err) throw err;

								// todo [async-going-sync-hack]
								setTimeout(function(){done();}, 0);
							});
						} else {
							var fields = {
								reputation: normalizedPost._reputation || 0,
								votes: normalizedPost._votes || 0,
								edited: normalizedPost._edited || 0,
								deleted: normalizedPost._deleted || 0,

								// todo: not sure if I need this
								relativeTime: new Date(normalizedPost._timestamp || startTime).toISOString()
							};
							Posts.setPostFields(postReturn.pid, fields, function(){
								if (self.redirectTemplates.posts && self.redirectTemplates.posts.oldPath && self.redirectTemplates.posts.newPath)
									postReturn._redirect = self._redirect(
										nodeExtend(true, {}, storedPost.normalized, storedPost.imported),
										self.redirectTemplates.posts.oldPath,
										self.redirectTemplates.posts.newPath
									);

								storedPost.imported = nodeExtend(true, {}, postReturn, fields);

								storage.setItem('p.' + _pid, storedPost, function(err) {
									if (err) throw err;

									// todo [async-going-sync-hack]
									setTimeout(function(){done();}, 0);
								});
							});
						}
					});
				}
			}
		}, function(){
			logger.info('Importing ' + self.mem._pids.length + ' posts took: ' + ((+new Date() - startTime)/1000).toFixed(2) + ' seconds');
			next();
		});
	},

	relockUnlockedTopics: function(next) {
		var self = this,
			count = 0,
			startTime = +new Date();

		async.eachLimit(this.mem._tids, 5, function(_tid, done) {
			count++;

			var storedTopic = storage.getItem('t.' + _tid);
			if (!storedTopic || !storedTopic.imported || !storedTopic.imported.tid) {
				logger.warn('[count:' + count + '] imported topic:_tid: ' + _tid + ' doesn\'t exist in storage, probably skipped some time earlier in the import process, dont freak out');

				// todo [async-going-sync-hack]
				setTimeout(function(){done();}, 0); return;
			} else {
				if (storedTopic.imported._lockme) {
					DB.setObjectField('topic:' + storedTopic.imported.tid, 'locked', '1', function(err){
						if (err) {
							logger.error(err);
						} else {
							logger.info('[count: ' + count + '] locked topic:' + storedTopic.imported.tid + ' back');
						}
						// todo [async-going-sync-hack]
						setTimeout(function(){done();}, 0);
					});
				} else {
					// todo [async-going-sync-hack]
					setTimeout(function(){done();}, 0);
				}
			}
		}, function(err) {
			if (err) throw err;

			logger.info('Relocking ' + self.mem._tids.length + ' topics took: ' + ((+new Date()-startTime)/1000).toFixed(2) + ' seconds');
			next();
		});
	},

	fixTopicTimestamps: function(next) {
		var self = this,
			startTime = +new Date();

		async.eachLimit(this.mem._tids, 5, function(_tid, done) {
			DB.getSortedSetRevRange('tid:' + _tid + ':posts', 0, -1, function(err, pids) {
				if (err) {
					return done(err);
				}

				if (!Array.isArray(pids) || !pids.length) {
					return done();
				}
				async.parallel({
					cid: function(next) {
						DB.getObjectField('topic:' + _tid, 'cid', next);
					},
					lastPostTimestamp: function(next) {
						DB.getObjectField('post:' + pids[0], 'timestamp', next);
					}
				}, function(err, results) {
					if (err) {
						return done(err);
					}

					DB.sortedSetAdd('categories:' + results.cid + ':tid', results.lastPostTimestamp, _tid, done);
				});
			});
		}, function(err) {
			if (err) throw err;

			logger.info('Fixing  ' + self.mem._tids.length + ' topic timestamps took: ' + ((+new Date()-startTime)/1000).toFixed(2) + ' seconds');
			next();
		});
	},

	report: function(next) {
		logger.raw('if you saved these stdout logs, '
			+ '\n\t look for "[user-json]" or "[user-csv]" to find all the users mapping.'
			+ '\n\t look for "[redirect]" to find all the old --> new paths mapping.\n');
		logger.info('DONE, Took ' + ((+new Date() - this.mem.startTime) / 1000 / 60).toFixed(2) + ' minutes.');
		next();
	},

	exit: function(code, msg){
		code = this._isNumber(code) ? code : 0;
		logger.info('Exiting ... code: ' + code + ( msg ? ' msg: ' + msg : '') );
		process.exit(code);
	},

	// helpers
	_runNbbSetup: function(next) {
		var node,
			result,
			which = 'which node',
			command,
			self = this,
			execSync = require('exec-sync'),
			config = JSON.stringify(this.config.nbb.setup.config).replace(/"/g, '\\"'),

			setup = function(next) {
				logger.debug('starting nodebb setup');
				try {

					// todo: won't work on windows
					// todo: do i even need this?
					node = path.resolve(execSync(which, true).stdout);
					logger.debug('node lives here: ' + node);

					// assuming we're in nodebb/node_modules/nodebb-plugin-import
					command = node + ' ' + path.resolve(__dirname, './../../../app.js') + ' --setup="' + config + '"';
					logger.info('Calling this command on your behalf: \n' + command + '\n\n');
					result = execSync(command, true);

				} catch (e){
					logger.error(e);
					logger.info('COMMAND');
					logger.info(result);
					self.exit(1);
				}

				//todo: result.stderr has value? even though there wasn't any actually error? dafuq?
				if (true || !result.stderr) {
					logger.info('\n\nNodeBB re-setup completed.');

					if (result.stderr) {
						logger.warn('\n\n The setup command returned an stderr value, it\'s most likely nothing');
						logger.warn('\n-------------STDERR-START---------');
						logger.warn('\n\n' + result.stderr);
						logger.warn('\n-------------STDERR-END---------');
					}

					self._clearDefaultCategories(next);
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
		var self = this;

		// deleting the first 12 default categories by nbb
		DB.keys('category:*', function(err, arr) {
			arr.forEach(function(k){
				DB.delete(k);
			});
			DB.delete('categories:cid', function(){
				self._backupConfig(next);
			});
		});
	},

	_backupConfig: function(next) {
		var self = this;

		DB.getObject('config', function(err, data) {
			if (err) throw err;
			logger.debug('backing up configs');
			logger.debug(JSON.stringify(data));

			self.config.backedConfig = data || {};
			storage.setItem('import.backedConfig', self.config.backedConfig);
			self._setTempConfig(next);
		});
	},

	_setTempConfig: function(next) {

		// get the nbb backedConfigs, change them, then set them back to the db
		// just to make the transition a little less flexible
		// yea.. i dont know .. i have a bad feeling about this
		var config = nodeExtend(true, {}, this.config.backedConfig, this.config.nbb.tempConfig);


		// if you want to auto confirm email, set the host to null, if there is any
		// this will prevent User.sendConfirmationEmail from setting expiration time on the email address
		// per https://github.com/designcreateplay/NodeBB/blob/master/src/user.js#L458'ish
		if (this.config.nbb.autoConfirmEmails)
			config['email:smtp:host'] = '';

		logger.debug('setting temp configs');
		logger.debug(JSON.stringify(config));

		DB.setObject('config', config, function(err){
			if (err) throw err;
			next();
		});
	},


	// im nice
	restoreConfig: function(next) {
		var self = this;

		this.config.backedConfig = storage.getItem('import.backedConfig');

		logger.debug('restoring configs');
		logger.debug(JSON.stringify(this.config.backedConfig));

		DB.setObject('config', this.config.backedConfig, function(err){
			if (err) {
				logger.error('Something went wrong while restoring your nbb configs');
				logger.warn('here are your backed-up configs, you do it.');
				logger.warn(JSON.stringify(self.config.backedConfig));
			}
			next();
		});
	},

	// aka forums
	_makeModeratorOnAllCategories: function(uid){
		var self = this;
		this.mem._cids.forEach(function(cid) {
			//
			var category = storage.getItem('c.' + cid);
			if (category && category.imported) {
				Group.join('group:cid:' + cid + ':privileges:mods:members', uid, function(err){
					if (err)
						logger.error(err);
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
		logger.raw('[redirect] "' + o + '":"' + n +'",');
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
		var self = this,
			_userslug = utils.slugify(_username || '');

		if (utils.isUserNameValid(_username) && _userslug) {
			return {username: _username, userslug: _userslug};

		} else {

			logger.warn(_username + ' [_username] is invalid, attempting to clean.');
			var username = self._cleanUsername(_username);
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
					var alternativeUsername = self._cleanUsername(_alternativeUsername);
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
	'html-to-md': (function(window){
		var brRe = /<br\s*(\/)?>/gmi;
		return function(str){
			return htmlMd(str, {window: window}).replace(brRe, "\n");
		}
	})(window),

	// edited a little bit to close over the regexps
	'bbcode-to-md': require('bbcode-to-markdown'),

	on: function() {
		this.dispatcher.on.apply(this.dispatcher, arguments);
	},
	once: function() {
		this.dispatcher.once.apply(this.dispatcher, arguments);
	},
	emit: function() {
		this.dispatcher.emit.apply(this.dispatcher, arguments);
	},
	off: function() {
		this.dispatcher.removeListener.apply(this.dispatcher, arguments);
	}
};

Import.prototype.trigger = Import.prototype.emit;
Import.prototype.one = Import.prototype.once;
Import.prototype.removeListener = Import.prototype.off;
Import.prototype.listen = Import.prototype.on;


module.exports = Import;
