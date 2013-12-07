'use strict';

var Group, Meta, User, Topics, Posts, Categories, DB;

// activated or not, still works if it lives in NodeBB/node_modules/nodebb-plugin-importer
try {
	Group = module.parent.require('./groups.js');
	Meta = module.parent.require('./meta.js');
	User = module.parent.require('./user.js');
	Topics = module.parent.require('./topics.js');
	Posts = module.parent.require('./posts.js');
	Categories = module.parent.require('./categories.js');
	DB = module.parent.require('./db.js');
} catch (e) {
	Group = require('../../../src/groups.js');
	Meta = require('../../../src/meta.js');
	User = require('../../../src/user.js');
	Topics = require('../../../src/topics.js');
	Posts = require('../../../src/posts.js');
	Categories = require('../../../src/categories.js');
	DB = module.parent.require('./db.js');
}
var
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
	glob = require('glob'),
// a quick logger
	Logger = require('./logger.js'),


	Import = function (config) {

		this.config = _.extend({}, {

				log: 'info,warn,error,debug,grep',
				// generate passwords for the users, yea
				passwordGen: {
					// chars selection menu
					chars: '{}.-_=+qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM1234567890',
					// password length
					len: 13
				},
				redirectTemplates: {
					// uses the underscore's templating engine
					// all variables that start an an '_' are the old variables
					users: {
						// this is an example (the ubb way)
						oldPath: '/users/<%= _uid %>',
						// this is the nbb way
						newPath: '/user/<%= userslug %>'
					},
					categories: {
						// this is an example (the ubb way)
						oldPath: '/forums/<%= _cid %>',
						// this is the nbb way
						newPath: '/category/<%= cid %>'
					},
					topics: {
						// this is an example (the ubb way)
						oldPath: '/topics/<%= _tid %>',
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
				markdown: false,
				nbb: {
					flush: {
						run: false,
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
					// to be randomly selected from migrating the ubb.forums
					categoriesTextColors: ['#FFFFFF'],
					categoriesBgColors: ['#ab1290','#004c66','#0059b2'],
					categoriesIcons: ['fa-comment'],
					// this will set the nodebb 'email:*:confirm' records to true
					// and will del all the 'confirm:*KEYS*:emails' too
					// if you want to auto confirm the user's accounts..
					autoConfirmEmails: true,
					userReputationMultiplier: 1,

					// async.eachLimit
					// todo: clean that up
					categoriesBatchSize: 10000,
					usersBatchSize: 10000,
					topicsBatchSize: 10000,
					postsBatchSize: 10000
				}

			},
			config
		);

		return this.init();
	};

Import.prototype = {

	init: function() {
		var _self = this;
		this.logger.debug('init()');

		//init logger
		this.logger = Logger.init(this.config.log);

		// find storage dir
		this.config.storageDir = path.normalize(this.config.storageDir);
		if(!fs.existsSync(this.config.storageDir) || !fs.lstatSync(this.config.storageDir).isDirectory()) {
			return new Error(this.config.storageDir + ' does not exist or is not a directory');
		}
		this.logger.info("Storage directory is: " + this.config.storageDir);

		// init storage module
		storage.initSync({dir: this.config.storageDir});

		//compile redirectMap templates
		Object.keys(this.config.redirectTemplates || {}).forEach(function(key) {
			var model = _self.config.redirectTemplates[key];
			if (model && model.oldPath && model.newPath) {
				model.oldPath = _.template(model.oldPath);
				model.newPath = _.template(model.newPath);
			}
		});

		return this;
	},

	start: function() {
		var _self = this;
		this.logger.debug('start()');

		async.series([
			function(next){
				_self.setup(next);
			},
			function(next) {
				_self.importCategories(next);
			},
			function(next) {
				_self.importUsers(next);
			},
			function(next) {
				_self.importTopics(next);
			},
			function(next) {
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
		this.logger.info('Loading storage into memory, please be patient ... ');
		this.mem = {
			_cids: fs.readJsonSync(path.join(this.config.storageDir + './_cids.json')),
			_uids: fs.readJsonSync(path.join(this.config.storageDir + './_uids.json')),
			_tids: fs.readJsonSync(path.join(this.config.storageDir + './_tids.json')),
			_pids: fs.readJsonSync(path.join(this.config.storageDir + './_pids.json'))
		};

		this.mem.startTime = new Date().getTime();

		if (this.config.nbb.flush.run == true) {
			// empty the storage dir
			storage.clear();
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
			startTime = new Date().getTime();

		async.eachLimit(this.mem._cids, this.config.categoriesBatchSize, function(_cid, done) {
			count++;

			var storedCategory = storage.getItem('c.' + _cid),
				normalizedCategory = storedCategory.normalized,
				importedCategory = storedCategory.imported,
				skippedCategory = storedCategory.skipped;

			if (importedCategory || skippedCategory) {
				logger.info('[c:' + count + '] categpry: ' + _cid + ' already processed, destiny: ' + (importedCategory ? 'imported' : 'skipped'));

				// todo hack! process.nextTick is also crashing
				setTimeout(function(){done();}, 1);
			} else {
				logger.debug('[c:' + count + '] saving category: ' + normalizedCategory._name);

				var category = {
					name: normalizedCategory._name,
					description: normalizedCategory._description,

					// you can fix the order later, nbb/admin
					order: count + 1,

				    // roulette, that too,
					icon: _self.config.nbb.categoriesIcons[Math.floor(Math.random() * _self.config.nbb.categoriesIcons.length)],
					bgColor: _self.config.nbb..categoriesBgColors[Math.floor(Math.random() * _self.config.nbb.categoriesBgColors.length)],
					color: _self.config.nbb..categoriesTextColors[Math.floor(Math.random() * _self.config.nbb.categoriesTextColors.length)]
				};

				Categories.create(category, function(err, categoryReturn) {
					if (err) {
						logger.error('category: ' + category.name + ' : ' + err);
						storedCategory.skipped = normalizedCategory;
						storage.setItem('c.' + _cid, storedCategory);

						// todo hack! process.nextTick is also crashing
						setTimeout(function(){done();}, 1);
					} else {
						storedCategory.imported = categoryReturn;
						storage.setItem('c.' + _cid, forumData);

						// todo hack! process.nextTick is also crashing
						setTimeout(function(){done();}, 1);
					}
				});
			}
		}, function(){
			logger.debug('Importing ' + _self.mem._cids.length + ' categories took: ' + ((new Date().getTime()-startTime)/1000).toFixed(2) + ' seconds');
			next();
		});
	},

	importUsers: function(next) {
		var count = 0,
			_self = this,
			logger = this.logger,
			nbbAdministratorsGid = storage.getItem('nbb.groups.administrators.gid'),
			startTime = new Date().getTime();

		logger.debug("Administrator gid: " + nbbAdministratorsGid);

		async.eachLimit(this.mem._uids, this.config.nbb.usersBatchSize, function(_uid, done) {
			count++;

			var storedUser = storage.getItem('u.' + _uid),
			normalizedUser = userData.normalized,
			migratedUser = userData.migrated,
			skippedUser = userData.skipped;

			if (migratedUser || skippedUser) {
				logger.info('[c:' + count + '] user: ' + _ouid + ' already processed, destiny: ' + (migratedUser ? 'migrated' : 'skipped'));
				// todo hack!
				// process.nextTick is also crashing
				setTimeout(function(){
					done();
				}, 1);
			} else {
				if (!user.username) {
					userData.skipped = user;
					logger.warn('[c:' + count + '] user: "' + (user.username || user._username) + '" is invalid.');
					// todo hack!
					// process.nextTick is also crashing
					setTimeout(function(){
						done();
					}, 1);
				} else {
					logger.debug('[c: ' + count + '] saving user: ' + user.username);
					User.create(user.username, user.password, user.email, function(err, uid) {

						if (err) {
							logger.error(' username: "' + user.username + '" ' + err + ' .. skipping');
							userData.skipped = user;
							storage.setItem('u.' + _ouid, userData);
							// todo hack!
							// process.nextTick is also crashing
							setTimeout(function(){
								done();
							}, 1);
						} else {

							if (user._level == 'Moderator') {
								logger.info(user.username + ' just became a moderator on all categories');
								m.nbb.makeModeratorOnAllCategories(uid);
							} else if (user._level == 'Administrator') {
								Group.join(nbbAdministratorsGid, uid, function(){
									logger.info(user.username + ' became an Administrator');
								});
							}

							// set some of the fields got from the ubb
							var _u_ = {
								// preseve the signature and website if there is any
								signature: user.signature,
								website: user.website || '',
								// if that user is banned, we would still h/im/er to be
								banned: user._banned || 0,
								// reset the location
								location: user._location || '',
								// preserse the  joindate, luckily here, ubb uses timestamps too
								joindate: user._joindate,
								// that's the best I could come up with I guess
								reputation: (user._rating || 0) * m.nbb.config.userReputationMultiplier,
								profileviews: user._totalRates || 0
							};

							if (user.avatar) {
								_u_.gravatarpicture = user.avatar;
								_u_.picture = user.avatar;
								user.customPicture = true;
							} else {
								user.customPicture = false;
							}

							_u_.redirectRule = m.common.redirectRule('users/' + user._ouid + '/' + user._username + '/', 'user/' + user.userslug);
							logger.useful('[user-json] {"email":"' + user.email + '","username":"' + user.username + '","pwd":"' + user.password + '",_ouid":' + user._ouid + ',"uid":' + uid +',"ms":' + _u_.joindate + '},');
							logger.useful('[user-csv] ' + user.email + ',' + user.username + ',' + user.password + ',' + user._ouid + ',' + uid + ',' + _u_.joindate);
							m.common.setUbbRedirectorKey("users", user._ouid, user.userslug);

							User.setUserFields(uid, _u_, function() {
								_u_.uid = uid;
								userData.migrated = $.extend({}, user, _u_);
								if (m.nbb.config.autoConfirmEmails) {
									RDB.set('email:' + user.email + ':confirm', true, function(){
										storage.setItem('u.' + _ouid, userData);
										// todo hack!
										// process.nextTick is also crashing
										setTimeout(function(){
											done();
										}, 1);
									});
								} else {
									storage.setItem('u.' + _ouid, userData);
									// todo hack!
									// process.nextTick is also crashing
									setTimeout(function(){
										done();
									}, 1);
								}
							});
						}
					});
				}
			}
		}, function(){
			logger.debug('Persisting ' + m.mem._ouids.length + ' users took: ' + ((new Date().getTime()-startTime)/1000).toFixed(2) + ' seconds');

			// hard code the first UBB Admin user as migrated, as it may actually own few posts/topics
			storage.setItem('u.1', {normalized: {_ouid: 1}, migrated: {_ouid: 1, uid: 1}});

			if (m.common.config.genUbbRedirectorMap) {
				// we can write the ubbRedirectorMap just in case
				// be aware that if the an interruption happens during the users migration, the users map may not complete
				storage.setItem('ubbRedirectorMap.json', m.mem.ubbRedirectorMap);
			}

			if (m.nbb.config.autoConfirmEmails) {
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

	importTopics: function() {
		var count = 0;
		var startTime = new Date().getTime();

		async.eachLimit(m.mem._otids, m.nbb.config.topicsBatchSize, function(_otid, done) {
			count++;

			var topicData = storage.getItem('t.' + _otid);

			var topic = topicData.normalized;
			var migratedTopic = topicData.migrated;
			var skippedTopic = topicData.skipped;

			if (migratedTopic || skippedTopic) {
				logger.info('[c:' + count + '] topic: ' + _otid + ' already processed, destiny: ' + (migratedTopic ? 'migrated' : 'skipped'));
				// todo hack!
				// process.nextTick is also crashing
				setTimeout(function(){
					done();
				}, 1);
			}  else {

				var forumData = storage.getItem('f.' + topic._forumId);
				var userData = storage.getItem('u.' + topic._userId);

				var forum = (forumData || {}).migrated;
				var user = (userData || {}).migrated;

				if (!user || !forum) {
					logger.error('[c:' + count + '] topic: "' + topic._title + '" _old-forum-valid: ' + !!forum  + ' _old-user-valid: ' + !!user + ' .. skipping');
					topicData.skipped = topic;
					storage.setItem('t.' + _otid, topicData);
					// todo hack!
					// process.nextTick is also crashing
					setTimeout(function(){
						done();
					}, 1);
				} else {

					// forum aka categories, that's why the cid here from nbb (instead of a fid)
					topic.cid = forum.cid;
					topic.uid = user.uid;

					logger.debug('[c:' + count + '] saving topic: ' + topic.title);
					Topics.post(topic.uid, topic.title, topic.content, topic.cid, function(err, ret){
						if (err) {
							logger.error('topic: ' + topic.title + ' ' + err + ' ... skipping');
							topicData.skipped = topic;
							storage.setItem('t.' + _otid, topicData);
							// todo hack!
							// process.nextTick is also crashing
							setTimeout(function(){
								done();
							}, 1);
						} else {
							ret.topicData.redirectRule = m.common.redirectRule('topics/' + _otid + '/', 'topic/' + ret.topicData.slug);
							logger.useful('{"_otid":' + topic._otid + ',"tid":' + ret.topicData.tid + ',"ms":' + topic.timestamp +'}');
							m.common.setUbbRedirectorKey("topics", topic._otid, ret.topicData.tid);

							Topics.setTopicField(ret.topicData.tid, 'timestamp', topic.timestamp);
							Topics.setTopicField(ret.topicData.tid, 'viewcount', topic.viewcount);
							Topics.setTopicField(ret.topicData.tid, 'pinned', topic.pinned);
							Posts.setPostField(ret.postData.pid, 'timestamp', topic.timestamp);
							Posts.setPostField(ret.postData.pid, 'relativeTime', topic.relativeTime);

							topicData.migrated = $.extend({}, topic, ret.topicData);
							storage.setItem('t.' + topic, topicData);
							// todo hack!
							// process.nextTick is also crashing
							setTimeout(function(){
								done();
							}, 1);
						}
					});
				}
			}
		}, function() {
			logger.debug('Persisting' + m.mem._otids.length + ' topics took: ' + ((new Date().getTime()-startTime)/1000).toFixed(2) + ' seconds');

			if (m.common.config.genUbbRedirectorMap) {
				// we can write the ubbRedirectorMap here. dont have to wait for posts to be done, since
				// be aware that if the an interruption happens during the topics migration, the topics map may not complete
				storage.setItem('ubbRedirectorMap.json', m.mem.ubbRedirectorMap);
				// free up that memory for the setPosts
				// I know, I'm cheap
				m.mem.ubbRedirectorMap = null;
			}

			next();
		});
	},

	importPosts: function() {
		var count = 0;
		var startTime = new Date().getTime();

		async.eachLimit(m.mem._opids, m.nbb.config.postsBatchSize, function(_opid, done) {
			count++;

			var postData = storage.getItem('p.' + _opid);

			var post = postData.normalized;
			var migratedPost = postData.migrated;
			var skippedPost = postData.skipped;

			if (migratedPost || skippedPost) {
				logger.info('post: ' + _opid + ' already processed, destiny: ' + (migratedPost ? 'migrated' : 'skipped'));
				// todo hack!
				// process.nextTick is also crashing
				setTimeout(function(){
					done();
				}, 1);
			} else {
				var topicData = storage.getItem('t.' + post._topicId);
				var userData = storage.getItem('u.' + post._userId);

				var topic = (topicData || {}).migrated;
				var user = (userData || {}).migrated;

				if (!user || !topic) {
					logger.error('post: "' + _opid + '" _old-topic-valid: ' + !!topic + ' _old-user-valid: ' + !!user +   ' .. skipping');
					postData.skipped = post;
					storage.setItem('p.' + _opid, postData);
					// todo hack!
					// process.nextTick is also crashing
					setTimeout(function(){
						done();
					}, 1);
				} else {

					post.tid = topic.tid;
					post.uid = user.uid;

					logger.debug('[c: ' + count + '] saving post: ' + _opid);
					Posts.create(post.uid, post.tid, post.content || '', function(err, postReturn){
						if (err) {
							logger.error('post: ' + post._opid + ' ' + err + ' ... skipping');
							postData.skipped = post;
							storage.setItem('p.' + _opid, postData);
							// todo hack!
							// process.nextTick is also crashing
							setTimeout(function(){
								done();
							}, 1);
						} else {
							postReturn.redirectRule = m.common.redirectRule('topics/' + post._topicId + '/(.)*#Post' + _opid, 'topic/' + post.tid + '#' + postReturn.pid);
							logger.useful('{"_opid":' + post._opid + ',"pid":' + postReturn.pid + ',"ms":' + post.timestamp + '}');
							Posts.setPostField(postReturn.pid, 'timestamp', post.timestamp);
							Posts.setPostField(postReturn.pid, 'relativeTime', post.relativeTime);

							postData.migrated = $.extend({}, post, postReturn);
							storage.setItem('p.' + _opid, postData);
							// todo hack!
							// process.nextTick is also crashing
							setTimeout(function(){
								done();
							}, 1);
						}
					});
				}
			}
		}, function(){
			logger.debug('Persisting' + m.mem._opids.length + ' posts took: ' + ((new Date().getTime()-startTime)/1000).toFixed(2) + ' seconds');
			next();
		});
	},

	report: function(next) {
		var logger = this.logger;

		logger.log('\n\n====  REMEMBER TO:\n'
			+ '\n\t*-) Email all your users their new passwords, find them in the map file reported few lines up.'
			+ '\n\t*-) Go through all users in the saved users map, each who has user.customPicture == true, test the image url if 200 or not, also filter the ones pointing to your old forum avatar dir, or keep that dir ([YOUR_UBB_PATH]/images/avatars/*) path working, your call'
			+ '\n\t*-) Create a nodebb-theme that works with your site'
			+ '\n\t*-) I may write a NodeBB plugin to enforce one time use of temp passwords, if you beat me to it, let me know');

		logger.log('\n\nFind a gazillion file (for your redirection maps and user\'s new passwords) in: ' + this.config.storageDir + '\n');
		logger.log('These files have a pattern u.[_uid], c.[_cid], t.[_tid], p.[_pid], \'cat\' one of each to view the structure.\n');
		logger.log('----> Or if you saved these stdout logs, look for [user-json] or [user-csv] to find all the users mapping.\n');
		logger.info('DONE, Took ' + (((new Date()).getTime() - this.mem.startTime) / 1000 / 60).toFixed(2) + ' minutes.');
		next();
	},

	exit: function(code, msg){
		code = this.isNumber(code) ? code : 0;
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
			setupVal = JSON.stringify(this.config.nbb.flush.setupVal).replace(/"/g, '\\"'),

			setup = function(next) {
				logger.debug('starting nodebb setup');

				try {
					// todo: won't work on windows
					// todo: do i even need this?
					node = execSync('which node', true).stdout;
					logger.debug('node lives here: ' + node);

					// assuming we're in nodebb/node_modules/nodebb-plugin-import
					command = node + ' ' + __dirname + '/../../app.js --setup="' + setupVal + '"';
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

				if (typeof next == 'function')
					next();
			};

		// todo this won't work anymore
		// use other means
		DB.flushdb(function(err, res) {
			if (err) throw err;
			logger.info('flushdb done. ' + res);
			setup(next);
		});
	},

	_clearDefaultCategories: function(next) {
		var _self = this;

		// todo this won't work anymore
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
			// save it
			storage.setItem('nbb.groups.administrators.gid', gid);
			_self._backupConfig(next);
		});
	},

	_backupConfig: function(next) {
		var _self = this;

		// todo this won't work anymore
		DB.hgetall('config', function(err, data) {
			if (err) throw err;
			_self.config.backedConfig = data || {};
			storage.setItem('nbb.config', _self.config);
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
			config['email:smtp:host'] = 'this.host.is.set.by.nodebb-plugin-import.to.disable.email.confirmation';

		// todo this won't work anymore
		DB.hmset('config', config, function(err){
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
				// todo this won't work anymore
				DB.sadd('cid:' + category.migrated.cid + ':moderators', uid, function(err){
					if (err)
						_self.logger.error(err);
				});
			}
		});
	},

	// im nice
	restoreConfig: function(next) {
		var _self = this, logger = this.logger;

		this.config = storage.getItem('nbb.config');
		// todo this won't work anymore
		DB.hmset('config', this.config.backedConfig, function(err){
			if (err) {
				logger.error('Something went wrong while restoring your nbb configs');
				logger.warn('here are your backed-up configs, you do it.');
				logger.warn(_self.config.backedConfig);
				throw err;
			}
			next();
		});
	},

	_redirect: function(data, oldPath, newPath) {
		this.logger.grep(oldPath(data) + ' ---> ' + newPath(data));
	},

	_maybeMarkdown: function(str){
		if (!this.config.markdown) return str || '';
		return htmlToMarkdown(str || '');
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
		var _userslug = utils.slugify(_username || '');

		if (utils.isUserNameValid(_username) && _userslug) {
			return {username: _username, userslug: _userslug, validUsername: true, _username: _username, _alternativeUsername: _alternativeUsername};

		} else {

			logger.warn(_username + ' [_username] is invalid, attempting to clean.');
			var username = m.common.cleanUsername(_username);
			var userslug = utils.slugify(username);

			if (utils.isUserNameValid(username) && userslug) {
				return {username: username, userslug: userslug, validUsername: true, _username: _username, _alternativeUsername: _alternativeUsername};

			} else {

				logger.warn(username + ' [username.cleaned] is still invalid, attempting to use the userDisplayName.');
				var _userDisplaySlug = utils.slugify(_alternativeUsername);

				if (utils.isUserNameValid(_alternativeUsername) && _userDisplaySlug) {
					return {username: _alternativeUsername, userslug: _userDisplaySlug, validUsername: true, _username: _username, _alternativeUsername: _alternativeUsername};

				} else {

					logger.warn(_alternativeUsername + ' [_alternativeUsername] is invalid, attempting to clean.');
					var userDisplayName = m.common.cleanUsername(_alternativeUsername);
					var userDisplaySlug = utils.slugify(userDisplayName);

					if (utils.isUserNameValid(userDisplayName) && userDisplaySlug) {
						return {username: userDisplayName, userslug: userDisplaySlug, validUsername: true, _username: _username, _alternativeUsername: _alternativeUsername};
					} else {
						logger.warn(userDisplayName + ' [_alternativeUsername.cleaned] is still invalid. sorry. no luck');
						return {username: userDisplayName, userslug: userDisplaySlug, validUsername: false, _username: _username, _alternativeUsername: _alternativeUsername};
					}
				}
			}
		}
	}
};