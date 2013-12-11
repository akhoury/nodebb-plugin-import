'use strict';

var Group, Meta, User, Topics, Posts, Categories, DB, nconf,

// nodebb utils, useful
	utils = require('../../../public/src/utils.js'),
// I'm lazy
	_ = require('underscore'),
	async = require('async'),
	fs = require('fs-extra'),
	path = require('path'),
	http = require('http'),
	argv = require('optimist').argv,
	storage = require('node-persist'),
	Logger = require('tiny-logger'),


	Import = function (config) {

		this.config = _.extend({}, {

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
					categoriesIcons: ['fa-comment'],

					// this will set the nodebb 'email:*:confirm' records to true
					// and will del all the 'confirm:*KEYS*:emails' too
					// if you want to auto confirm the user's accounts..
					autoConfirmEmails: true,

					// if you want to boost the Karma
					userReputationMultiplier: 1,

					// async.eachLimit
					// todo: dafuq am i doing?
					categoriesBatchSize: 10000,
					usersBatchSize: 10000,
					topicsBatchSize: 10000,
					postsBatchSize: 10000
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
			this.config.nbb.setup.setupVal = _.extend(this.config.nbb.setup.setupVal, nconfigs);
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

		this.init();
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
			return new Error(this.config.storageDir + ' does not exist or is not a directory');
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
			// empty the storage dir
			// storage.clear();
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

		async.eachLimit(this.mem._cids, 5, function(_cid, done) {
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

					// roulette, that too,
					icon: _self.config.nbb.categoriesIcons[Math.floor(Math.random() * _self.config.nbb.categoriesIcons.length)],
					bgColor: _self.config.nbb.categoriesBgColors[Math.floor(Math.random() * _self.config.nbb.categoriesBgColors.length)],
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
								_.extend(storedCategory.normalized, storedCategory.imported),
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
			nbbAdministratorsGid = storage.getItem('nbb.groups.administrators.gid'),
			startTime = +new Date(),
			flushed = this.config.nbb.setup.runFlush;

		logger.debug("Administrator gid: " + nbbAdministratorsGid);

		async.eachLimit(this.mem._uids, 5, function(_uid, done) {
			count++;

			var storedUser = storage.getItem('u.' + _uid);
			if (!storedUser || !storedUser.normalized) {
				logger.warn('[c:' + count + '] normalized user:_uid: ' + _uid + ' it doesn\'t exist in storage');

				// todo [async-going-sync-hack]
				setTimeout(function(){done();}, 1); return;
			}
			var	normalizedUser = storedUser.normalized,
				importedUser = storedUser.imported,
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
					setTimeout(function(){done();}, 1);
				} else {
					logger.debug('[c: ' + count + '] saving user:_uid: ' + _uid);
					User.create(user.username, user.password, user.email, function(err, uid) {

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
								logger.warn(user.username + ' just became a moderator on all categories');
								_self._makeModeratorOnAllCategories(uid);
							} else if (('' + normalizedUser._level).toLowerCase() == 'administrator') {
								Group.join(nbbAdministratorsGid, uid, function(){
									logger.warn(user.username + ' became an Administrator');
								});
							}

							var fields = {
								// preseve the signature, but Nodebb allows a max of 150 chars, so i truncate with an '...' at the end
								signature: _self._truncateStr(normalizedUser._signature || '', 150),
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
								showemail: normalizedUser._showemail ? 1 : 0
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
								storedUser.imported = _.extend(user, fields);
								storedUser.imported._keptPicture = keptPicture;
								storedUser.imported.userslug = u.userslug;

								if (_self.redirectTemplates.users.oldPath && _self.redirectTemplates.users.newPath)
									storedUser.imported._redirect = _self._redirect(
										_.extend(storedUser.normalized, storedUser.imported),
										_self.redirectTemplates.users.oldPath,
										_self.redirectTemplates.users.newPath
									);

								if (_self.config.nbb.autoConfirmEmails) {
									DB.set('email:' + user.email + ':confirm', true, function(){
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
				DB.keys('confirm:*:email', function(err, keys){
					keys.forEach(function(key){
						DB.delete(key);
					});
					next();
				});
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
		async.eachLimit(this.mem._tids, 5, function(_tid, done) {
			count++;

			var storedTopic = storage.getItem('t.' + _tid);
			if (!storedTopic || !storedTopic.normalized) {
				logger.warn('[c:' + count + '] normalized topic:_tid: ' + _tid + ' it doesn\'t exist in storage');

				// todo [async-going-sync-hack]
				setTimeout(function(){done();}, 1); return;
			}
			var normalizedTopic = storedTopic.normalized,
				importedTopic = storedTopic.imported,
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

					Topics.post(importedUser.uid, normalizedTopic._title, normalizedTopic._content, importedCategory.cid, function(err, returnTopic){
						if (err) {
							logger.warn('skipping topic:_tid: ' + _tid + ' ' + err);
							storedTopic.skipped = normalizedTopic;
							storage.setItem('t.' + _tid, storedTopic, function(err){
								if (err) throw err;

								// todo [async-going-sync-hack]
								setTimeout(function(){done();}, 1);
							});
						} else {

							var fields = {
								'timestamp': normalizedTopic._timestamp || startTime,
								'viewcount': normalizedTopic._viewcount || 0,
								'locked': normalizedTopic._locked ? 1 : 0,
								'deleted': normalizedTopic._deleted ? 1 : 0,
								'pinned': normalizedTopic._pinned ? 1 : 0
							};

							fields.teaser_timestamp = fields.timestamp;
							fields.relativeTime = new Date(fields.timestamp).toISOString();

							DB.setObject('topic:' + returnTopic.tid, fields, function(err, result) {
								if (err) {done(err); throw err;}

								storedTopic.imported = _.extend(returnTopic.topicData, fields);

								if (_self.redirectTemplates.topics.oldPath && _self.redirectTemplates.topics.newPath)
									storedTopic.imported._redirect = _self._redirect(
										_.extend(storedTopic.normalized, storedTopic.imported),
										_self.redirectTemplates.topics.oldPath,
										_self.redirectTemplates.topics.newPath
									);

								storage.setItem('t.' + _tid, storedTopic, function(err){
									if (err) throw err;

									// todo [async-going-sync-hack]
									setTimeout(function(){done();}, 1);
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

		async.eachLimit(this.mem._pids, 5, function(_pid, done) {
			count++;

			var storedPost = storage.getItem('p.' + _pid);
			if (!storedPost || !storedPost.normalized) {
				logger.warn('[c:' + count + '] skipped post:_pid: ' + _pid + ' it doesn\'t exist in storage');

				// todo [async-going-sync-hack]
				setTimeout(function(){done();}, 1); return;
			}

			var	normalizedPost = storedPost.normalized,
				importedPost = storedPost.imported,
				skippedPost = normalizedPost._skip ? {_pid: _pid} : flushed ? null : storedPost.skipped;

			if (importedPost || skippedPost) {
				logger.warn('skipping post:_pid: ' + _pid + ' already processed, destiny: ' + (importedPost ? 'imported' : 'skipped'));

				// todo [async-going-sync-hack]
				setTimeout(function(){done();}, 1);
			} else {
				var importedTopic = storage.getItem('t.' + normalizedPost._tid).imported;
				var importedUser = storage.getItem('u.' + normalizedPost._uid).imported;

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
					Posts.create(importedUser.uid, importedTopic.tid, normalizedPost._content || '', function(err, postReturn){
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
								relativeTime: new Date(normalizedPost._timestamp || startTime).toISOString()
							};
							Posts.setPostField(postReturn.pid, 'timestamp', fields.timestamp);
							Posts.setPostField(postReturn.pid, 'relativeTime', fields.relativeTime);
							storedPost.imported = _.extend(postReturn, fields);

							if (_self.redirectTemplates.posts && _self.redirectTemplates.posts.oldPath && _self.redirectTemplates.posts.newPath)
								postReturn.redirectRule = _self._redirect(
									_.extend(storedPost.normalized, storedPost.imported),
									_self.redirectTemplates.posts.oldPath,
									_self.redirectTemplates.posts.newPath
								);

							storage.setItem('p.' + _pid, storedPost, function(err) {
								if (err) throw err;

								// todo [async-going-sync-hack]
								setTimeout(function(){done();}, 1);
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
				if (result.stdout.indexOf('NodeBB Setup Completed') > -1) {
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
				_self._setupGroups(next);
			});
		});
	},

	_setupGroups: function(next) {
		var _self = this;

		Group.getGidFromName('Administrators', function(err, gid) {
			if (err) {_self.logger.error(err);}
			// save it
			storage.setItem('nbb.groups.administrators.gid', gid);
			_self._backupConfig(next);
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
			_self._setTmpConfig(next);
		});
	},

	_setTmpConfig: function(next) {

		// clone the configs
		var config = _.clone(this.config.backedConfig);

		// get the nbb backedConfigs, change them, then set them back to the db
		// just to make the transition a little less flexible
		// yea.. i dont know .. i have a bad feeling about this
		config.postDelay = 0;
		config.minimumPostLength = 1;
		config.minimumTitleLength = 1;
		config.maximumUsernameLength = 50;
		config.maximumProfileImageSize = 1024;

		// if you want to auto confirm email, set the host to null, if there is any
		// this will prevent User.sendConfirmationEmail from setting expiration time on the email address
		// per https://github.com/designcreateplay/NodeBB/blob/master/src/user.js#L458'ish
		if (this.config.nbb.autoConfirmEmails)
			config['email:smtp:host'] = 'host.temporarily.set.by.nodebb-plugin-import.to.disable.email.confirmation';

		DB.setObject('config', config, function(err){
			if (err) throw err;
			next();
		});
	},

	// aka forums
	_makeModeratorOnAllCategories: function(uid){
		var _self = this;
		this.mem._cids.forEach(function(_cid) {
			var category = storage.getItem('c.' + _cid);
			if (category && category.imported) {
				DB.setAdd('cid:' + category.imported.cid + ':moderators', uid, function(err){
					if (err)
						_self.logger.error(err);
				});
			}
		});
	},

	// im nice
	restoreConfig: function(next) {
		var _self = this, logger = this.logger;


		this.config.backedConfig = storage.getItem('import.backedConfig');
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

	_redirect: function(data, oldPath, newPath) {
		var o = oldPath(data);
		var n = newPath(data);
		//todo: save them somewhere more than the just logs
		// that'll make them for a quick json map
		// gotta replacce the [redirect] though
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
	}
};

module.exports = Import;
