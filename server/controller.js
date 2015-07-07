
var fs = require('fs-extra'),
		path = require('path'),
		_ = require('underscore'),
		async = require('async'),
		EventEmitter2 = require('eventemitter2').EventEmitter2,
		nodeExtend = require('node.extend'),
		noop = function(s) { return s;},
		db = module.parent.require('../../../src/database.js'),
		Data = require('./data.js'),
		Meta = require('../../../src/meta.js'),

		utils = require('../public/js/utils.js'),

		DELIVERABLES_TMP_DIR = path.join(__dirname, '/../public/tmp'),
		DELIVERABLES_TMP_URL = path.join('/plugins/nodebb-plugin-import/tmp'),
		LOG_FILE = path.join(__dirname, '/tmp/import.log'),

		LAST_IMPORT_TIMESTAMP_FILE = path.join(__dirname + '/tmp/lastimport'),

		DIRTY_FILE = path.join(__dirname + '/tmp/controller.dirty'),

		DELETE_BATCH_LIMIT = 50,
		CONVERT_BATCH_LIMIT = 50,

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

	Controller.isDirty = function () {
		if (!Controller._importer) {
			Controller._importer = require('./importer');
		}
		return Controller._importer.isDirty();
	};

	Controller.complete = function(callback) {
		fs.writeFileSync(LAST_IMPORT_TIMESTAMP_FILE, +new Date(), {encoding: 'utf8'});
		fs.remove(DIRTY_FILE, function(err) {
			Controller.state({
				now: 'idle',
				event: 'importer.complete'
			});
			if (typeof callback === 'function') {
				callback();
			}
			if (Controller._exporter) {
				Controller._exporter.teardown(noop);
			}
		});
	};

	Controller.start = function(config, callback) {
		Controller.config(config);
		config = Controller.config();

		var state = Controller.state();
		if (state.now !== 'idle' && state.now !== 'errored') {
			return Controller.emit('importer.warn', {message: 'Busy, cannot import now', state: state});
		}

		var start = function() {
			Controller.requireExporter(config, function(err, exporter) {
				Controller.startImport(exporter, config, callback);
			});
		};

		fs.remove(LAST_IMPORT_TIMESTAMP_FILE, function(err) {
			fs.remove(LOG_FILE, function (err) {
				if (config['log'].server) {
					fs.ensureFile(LOG_FILE, function () {
						start();
					});
				} else {
					start();
				}
			});
		});
	};

	Controller.resume = function(config, callback) {
		Controller.config(config);
		config = Controller.config();

		var state = Controller.state();
		if (state.now !== 'idle' && state.now !== 'errored') {
			return Controller.emit('importer.warn', {message: 'Busy, cannot import now', state: state});
		}

		var resume = function() {
			Controller.requireExporter(config, function(err, exporter) {
				Controller.resumeImport(exporter, config, callback);
			});
		};

		if (Controller.config('log').server) {
			fs.ensureFile(LOG_FILE, function () {
				resume();
			});
		} else {
			resume();
		}
	};

	Controller.requireExporter = function(config, callback) {
		if (_.isFunction(config)) {
			callback = config;
			config  = null;
		}
		callback = _.isFunction(callback) ? callback : function(){};

		if (config) {
			Controller.config(config);
		}

		if(Controller._exporter) {
			Controller._exporter.removeAllListeners();
		}

		var exporter = require('./exporter');

		exporter.on('exporter.*', function(type, data) {
			Controller.emit(type, data);
		});

		exporter.once('exporter.ready', function() {
			callback(null, exporter);
		});

		Controller.state({
			now: 'busy',
			event: 'exporter.require'
		});

		exporter.init(Controller.config());

		Controller._exporter = exporter;
	};

	Controller.state = function(state) {
		if (state != null) {
			Controller._state = state;
			Controller.emit('controller.state', Controller._state);
		}
		return Controller._state;
	};

	Controller._requireImporter = function(callback) {
		callback = _.isFunction(callback) ? callback : function(){};

		if (Controller._importer) {
			Controller._importer.removeAllListeners();
		}

		Controller._importer = require('./importer');

		Controller._importer.on('importer.*', function(type, data) {
			Controller.emit(type, data);
		});

		Controller._importer.once('importer.complete', function() {
			Controller.complete(callback);
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
	};

	Controller.startImport = function(exporter, config, callback) {
		fs.writeFileSync(DIRTY_FILE, +new Date(), {encoding: 'utf8'});
		Controller._requireImporter(callback);

		if (_.isFunction(config)) {
			callback = config;
			config  = null;
		}

		Controller._importer.once('importer.ready', function() {
			Controller._importer.start();
		});

		Controller._importer.init(exporter, config || Controller.config(), callback);
	};

	Controller.resumeImport = function(exporter, config, callback) {
		Controller._requireImporter(callback);

		if (_.isFunction(config)) {
			callback = config;
			config  = null;
		}

		Controller._importer.once('importer.resume', function() {
			Controller.state({
				now: 'busy',
				event: 'importer.resume'
			});
		});

		Controller._importer.once('importer.ready', function() {
			Controller._importer.resume();
		});

		Controller._importer.init(exporter, config || Controller.config(), callback);
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
	var jsdom = require("jsdom-nogyp");
	var htmlMd = require('html-md-optional_window');
	Controller['html-to-md'] = (function(){
		var brRe = /<br\s*(\/)?>/gmi;
		var entities = new (require('html-entities')).AllHtmlEntities();
		return function(str){
			var window = jsdom.jsdom(null, null, {features: {FetchExternalResources: false}}).parentWindow;
			str = str || '';
			str = entities.decode(str);
			str = htmlMd(str, {window: window}).replace(brRe, "\n");
			// Important! Prevents memory leaks.
			window.close();
			return str;
		}
	})();

	Controller['bbcode-to-md'] = require('bbcode-to-markdown');

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
		Controller.progress(0, 0);

		var error = function(err) {
			Controller.phase('usersCsvDone');
			Controller.state({
				now: 'errored',
				event: 'controller.downloadError',
				details: err
			});
			return callback(err);
		};

		if (Controller.postImportToolsAvailble()) {
			Controller.state({
				now: 'busy',
				event: 'controller.getUsersCsv'
			});

			Data.countUsers(function(err, total) {
				if (err) {
					return error(err);
				}
				var content = 'index,email,username,clear_text_autogenerated_password,imported_password,_uid,uid,joindate\n';
				var index = 0;
				Data.eachUser(function (user) {
					if (user && user._imported_uid) {
						content += index + ',' + user.email + ',' + user.username + ',' + user._imported_tmp_autogenerated_password + ',' + user._imported_password + ',' + user._imported_uid + ',' + user.uid + ',' + user.joindate + '\n';
					}
					Controller.progress(index++, total);
				}, function(err) {
					if (err) {
						return error(err);
					}
					Controller.progress(total, total);
					Controller.phase('usersCsvDone');

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
				});
			});
		} else {
			error({error: 'Cannot download file at the moment.'});
		}
	};

	Controller.getUsersJson = function(callback) {
		callback = _.isFunction(callback) ? callback : noop;

		Controller.phase('usersJsonStart');
		Controller.progress(0, 0);

		var error = function(err) {
			Controller.progress(1, 1);
			Controller.phase('usersJsonDone');
			Controller.state({
				now: 'errored',
				event: 'controller.downloadError',
				details: err
			});
			return callback(err);
		};

		if (Controller.postImportToolsAvailble()) {
			Controller.state({
				now: 'busy',
				event: 'controller.getUsersJson'
			});

			Data.countUsers(function(err, total) {
				if (err) {
					error(err);
				}
				var content = '[\n';
				var index = 0;
				Data.eachUser(function (user) {
					if (user && user._imported_uid) {
						content += '{'
						+ '"index":' + index + ','
						+ '"email":"' + user.email + '",'
						+ '"username":"' + user.username + '",'
						+ '"clear_text_autogenerated_password":' + (user._imported_tmp_autogenerated_password ? '"' + user._imported_tmp_autogenerated_password + '"' : null) + ','
						+ '"imported_password":' + (user._imported_password ? '"' + user._imported_password + '"' : null) + ','
						+ '"_uid":' + user._imported_uid + ','
						+ '"uid":' + user.uid + ','
						+ '"joindate":' + user.joindate
						+ '},\n';
					}
					Controller.progress(index++, total);
				}, function(err) {
					if (err) {
						return error(err);
					}
					Controller.progress(1, 1);
					Controller.phase('usersJsonDone');

					var lastCommaIdx = content.lastIndexOf(',');
					if (lastCommaIdx > -1) {
						content = content.substring(0, lastCommaIdx);
					}
					content += '\n]';

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
				});
			});
		} else {
			error({error: 'Cannot download files at the moment.'});
		}
	};

	Controller.getRedirectionJson = function(callback) {
		callback = _.isFunction(callback) ? callback : noop;

		Controller.phase('redirectionMapStart');

		var _mainPids = {};

		var error = function(err) {
			Controller.phase('redirectionMapDone');
			Controller.progress(1, 1);
			Controller.state({
				now: 'errored',
				event: 'controller.downloadError',
				details: err
			});
			return callback(err);
		};

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
						Controller.progress(0, 0);
						Data.countUsers(function(err, total) {
							var index = 0;
							Data.eachUser(function(user) {
								if (user && user._imported_uid) {
									// aliases
									user._uid = user._imported_uid;
									user._username = user._imported_username;
									user._slug = user._imported_slug;
									user._path = user._imported_path;
									user._userslug = user._imported_slug;

									var oldPath = Controller.redirectTemplates.users.oldPath(user);
									var newPath = Controller.redirectTemplates.users.newPath(user);
									content += '"' + oldPath + '":"' + newPath + '",\n';
								}
								Controller.progress(index++, total);
							}, function(err) {
								Controller.progress(1, 1);
								Controller.phase('redirectionMapUsersDone');
								done(err);
							});
						});
					} else {
						done();
					}
				},
				function(done) {
					if (Controller.redirectTemplates.categories.oldPath && Controller.redirectTemplates.categories.newPath) {
						Controller.phase('redirectionMapCategoriesStart');
						Controller.progress(0, 0);
						Data.countCategories(function(err, total) {
							var index = 0;
							Data.eachCategory(
									function (category) {
										if (category && category._imported_cid) {

											// aliases
											category._cid = category._imported_cid;
											category._slug = category._imported_slug;
											category._name = category._imported_name;
											category._path = category._imported_path;
											category._description = category._imported_description;

											var oldPath = Controller.redirectTemplates.categories.oldPath(category);
											var newPath = Controller.redirectTemplates.categories.newPath(category);
											content += '"' + oldPath + '":"' + newPath + '",\n';
										}
										Controller.progress(index++, total);
									},
									function (err) {
										Controller.progress(1, 1);
										Controller.phase('redirectionMapCategoriesDone');
										done(err);
									});
						});
					} else {
						done();
					}
				},
				function(done) {
					if (Controller.redirectTemplates.topics.oldPath && Controller.redirectTemplates.topics.newPath) {
						Controller.phase('redirectionMapTopicsStart');
						Controller.progress(0, 0);
						Data.countTopics(function(err, total) {
							var index = 0;
							Data.eachTopic(
									function(topic) {
										// cache mainPids
										_mainPids[topic.mainPid] = 1;

										if (topic && topic._imported_tid) {
											// aliases
											topic._uid = topic._imported_uid;
											topic._tid = topic._imported_tid;
											topic._cid = topic._imported_cid;
											topic._slug = topic._imported_slug;
											topic._path = topic._imported_path;
											topic._title = topic._imported_title;
											topic._content = topic._imported_content;
											topic._guest = topic._imported_guest;
											topic._ip = topic._imported_ip;
											topic._user_slug = topic._imported_user_slug;
											topic._user_path = topic._imported_user_path;
											topic._category_path = topic._imported_category_path;
											topic._category_slug = topic._imported_category_slug;

											var oldPath = Controller.redirectTemplates.topics.oldPath(topic);
											var newPath = Controller.redirectTemplates.topics.newPath(topic);
											content += '"' + oldPath + '":"' + newPath + '",\n';
										}
										Controller.progress(index++, total);
									},
									function(err) {
										Controller.progress(1, 1);
										Controller.phase('redirectionMapTopicsDone');
										done(err);
									});
						});
					} else {
						done();
					}
				},
				function(done) {
					if (Controller.redirectTemplates.posts.oldPath && Controller.redirectTemplates.posts.newPath) {
						Controller.phase('redirectionMapPostsStart');
						Controller.progress(0, 0);
						Data.countPosts(function(err, total) {
							var index = 0;
							Data.eachPost(
									function(post) {
										if (post && post._imported_pid && !_mainPids[post.pid] ) {
											// aliases
											post._pid = post._imported_pid;
											post._uid = post._imported_uid;
											post._tid = post._imported_tid;
											post._toPid = post._imported_toPid;
											post._content = post._imported_content;
											post._cid = post._imported_cid;
											post._ip = post._imported_ip;
											post._guest = post._imported_guest;
											post._path = post._imported_path;
											post._user_slug = post._imported_user_slug;
											post._user_path = post._imported_user_path;
											post._topic_path = post._imported_topic_path;
											post._topic_slug = post._imported_topic_slug;
											post._category_path = post._imported_category_path;
											post._category_slug = post._imported_category_slug;

											var oldPath = Controller.redirectTemplates.posts.oldPath(post);
											var newPath = Controller.redirectTemplates.posts.newPath(post);
											content += '"' + oldPath + '":"' + newPath + '",\n';
										}
										Controller.progress(index++, total);
									},
									function(err) {
										Controller.progress(1, 1);
										Controller.phase('redirectionMapPostsDone');
										done(err);
									}
							);
						});
					} else {
						done();
					}
				}
			], function(err, results) {
				if (err) {
					return error(err);
				}

				Controller.progress(1, 1);
				Controller.phase('redirectionMapDone');

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

			});
		} else {
			error({error: 'Cannot download files.'});
		}
	};


	Controller.deleteExtraFields = function(callback) {
		callback = _.isFunction(callback) ? callback : noop;
		Controller.phase('deleteExtraFieldsStart');

		var _mainPids = {};

		var error = function(err) {
			Controller.phase('deleteExtraFieldsDone');
			Controller.state({
				now: 'errored',
				event: 'controller.deletingExtraFieldsError',
				details: err
			});
			return callback(err);
		};

		if (Controller.postImportToolsAvailble()) {
			Controller.state({
				now: 'busy',
				event: 'controller.deleteExtraFields'
			});
			async.series([
				function(done) {
					Controller.phase('deleteExtraFieldsUsersStart');
					Controller.progress(0, 0);
					Data.countUsers(function(err, total) {
						var index = 0;

						Data.eachUser(
								function(user, next) {
									var nxt = function(err) {
										Controller.progress(index++, total);
										next(err);
									};

									if (user && user._imported_uid) {
										async.parallel([
											function(cb) {
												db.deleteObjectField('user:' + user.uid, '_imported_uid', cb);
											},
											function(cb) {
												db.deleteObjectField('user:' + user.uid, '_imported_username', cb);
											},
											function(cb) {
												db.deleteObjectField('user:' + user.uid, '_imported_password', cb);
											},
											function(cb) {
												db.deleteObjectField('user:' + user.uid, '_imported_hashed_password', cb);
											},
											function(cb) {
												db.deleteObjectField('user:' + user.uid, '_imported_tmp_autogenerated_password', cb);
											},
											function(cb) {
												db.deleteObjectField('user:' + user.uid, '_imported_slug', cb);
											},
											function(cb) {
												db.deleteObjectField('user:' + user.uid, '_imported_path', cb);
											},
											function(cb) {
												db.deleteObjectField('user:' + user.uid, '_imported_signature', cb);
											}
										], nxt);
									} else {
										nxt();
									}
								},
								{async: true, eachLimit: DELETE_BATCH_LIMIT},
								function(err) {
									Controller.progress(1, 1);
									Controller.phase('deleteExtraFieldsUsersDone');
									done(err);
								});
					});
				},
				function(done) {
					Controller.phase('deleteExtraFieldsMessagesStart');
					Controller.progress(0, 0);
					Data.countMessages(function(err, total) {
						var index = 0;
						Data.eachMessage(
								function(message, next) {
									var nxt = function(err) {
										Controller.progress(index++, total);
										next(err);
									};

									if (message && message._imported_content) {
										async.parallel([
											function(cb) {
												db.deleteObjectField('message:' + message.mid, '_imported_content', cb);
											}
										], nxt);
									} else {
										nxt();
									}
								},
								{async: true, eachLimit: DELETE_BATCH_LIMIT},
								function(err) {
									Controller.progress(1, 1);
									Controller.phase('deleteExtraFieldsMessagesDone');
									done(err);
								});
					});
				},
				function(done) {
					Controller.phase('deleteExtraFieldsGroupsStart');
					Controller.progress(0, 0);
					Data.countGroups(function(err, total) {
						var index = 0;
						Data.eachGroup(
								function(group, next) {
									var nxt = function(err) {
										Controller.progress(index++, total);
										next(err);
									};

									if (group && group._imported_name) {
										async.parallel([
											function(cb) {
												db.deleteObjectField('group:' + group.name, '_imported_gid', cb);
											},
											function(cb) {
												db.deleteObjectField('group:' + group.name, '_imported_name', cb);
											},
											function(cb) {
												db.deleteObjectField('group:' + group.name, '_imported_description', cb);
											},
											function(cb) {
												db.deleteObjectField('group:' + group.name, '_imported_ownerUid', cb);
											},
											function(cb) {
												db.deleteObjectField('group:' + group.name, '_imported_path', cb);
											},
											function(cb) {
												db.deleteObjectField('group:' + group.name, '_imported_slug', cb);
											}
										], nxt);
									} else {
										nxt();
									}
								},
								{async: true, eachLimit: DELETE_BATCH_LIMIT},
								function(err) {
									Controller.progress(1, 1);
									Controller.phase('deleteExtraFieldsGroupsDone');
									done(err);
								});
					});
				},
				function(done) {
					Controller.phase('deleteExtraFieldsCategoriesStart');
					Controller.progress(0, 0);
					Data.countCategories(function(err, total) {
						var index = 0;
						Data.eachCategory(
								function(category, next) {
									var nxt = function(err) {
										Controller.progress(index++, total);
										next(err);
									};
									if (category._imported_cid) {
										async.parallel([
											function(cb) {
												db.deleteObjectField('category:' + category.cid, '_imported_cid', cb);
											},
											function(cb) {
												db.deleteObjectField('category:' + category.cid, '_imported_name', cb);
											},
											function(cb) {
												db.deleteObjectField('category:' + category.cid, '_imported_description', cb);
											},
											function(cb) {
												db.deleteObjectField('category:' + category.cid, '_imported_slug', cb);
											},
											function(cb) {
												db.deleteObjectField('category:' + category.cid, '_imported_path', cb);
											}
										], nxt);
									} else {
										nxt();
									}
								},
								{async: true, eachLimit: DELETE_BATCH_LIMIT},
								function(err) {
									Controller.progress(1, 1);
									Controller.phase('deleteExtraFieldsCategoriesDone');
									done(err);
								});
					});
				},
				function(done) {
					Controller.phase('deleteExtraFieldsTopicsStart');
					Controller.progress(0, 0);
					Data.countTopics(function(err, total) {
						var index = 0;
						Data.eachTopic(
								function(topic, next) {
									var nxt = function(err) {
										Controller.progress(index++, total);
										next(err);
									};
									if (topic && topic._imported_tid) {
										_mainPids[topic.mainPid] = 1;
										async.parallel([
											function(cb) {
												db.deleteObjectField('topic:' + topic.tid, '_imported_tid', cb);
											},
											function(cb) {
												db.deleteObjectField('topic:' + topic.tid, '_imported_cid', cb);
											},
											function(cb) {
												db.deleteObjectField('topic:' + topic.tid, '_imported_uid', cb);
											},
											function(cb) {
												db.deleteObjectField('topic:' + topic.tid, '_imported_slug', cb);
											},
											function(cb) {
												db.deleteObjectField('topic:' + topic.tid, '_imported_title', cb);
											},
											function(cb) {
												db.deleteObjectField('topic:' + topic.tid, '_imported_content', cb);
											},
											function(cb) {
												db.deleteObjectField('topic:' + topic.tid, '_imported_ip', cb);
											},
											function(cb) {
												db.deleteObjectField('topic:' + topic.tid, '_imported_guest', cb);
											},
											function(cb) {
												db.deleteObjectField('topic:' + topic.tid, '_imported_user_slug', cb);
											},
											function(cb) {
												db.deleteObjectField('topic:' + topic.tid, '_imported_user_path', cb);
											},
											function(cb) {
												db.deleteObjectField('topic:' + topic.tid, '_imported_category_path', cb);
											},
											function(cb) {
												db.deleteObjectField('topic:' + topic.tid, '_imported_category_slug', cb);
											}
										], nxt);
									} else {
										nxt();
									}
								},
								{async: true, eachLimit: DELETE_BATCH_LIMIT},
								function(err) {
									Controller.progress(1, 1);
									Controller.phase('deleteExtraFieldsTopicsDone');
									done(err);
								});
					});
				},
				function(done) {
					Controller.phase('deleteExtraFieldsPostsStart');
					Controller.progress(0, 0);
					Data.countPosts(function(err, total) {
						var index = 0;
						Data.eachPost(
								function(post, next) {
									var nxt = function(err) {
										Controller.progress(index++, total);
										next(err);
									};
									if (post && post._imported_pid) {
										async.parallel([
											function(cb) {
												db.deleteObjectField('post:' + post.pid, '_imported_pid', cb);
											},
											function(cb) {
												db.deleteObjectField('post:' + post.pid, '_imported_tid', cb);
											},
											function(cb) {
												db.deleteObjectField('post:' + post.pid, '_imported_uid', cb);
											},
											function(cb) {
												db.deleteObjectField('post:' + post.pid, '_imported_content', cb);
											},
											function(cb) {
												db.deleteObjectField('post:' + post.pid, '_imported_cid', cb);
											},
											function(cb) {
												db.deleteObjectField('post:' + post.pid, '_imported_ip', cb);
											},
											function(cb) {
												db.deleteObjectField('post:' + post.pid, '_imported_guest', cb);
											},
											function(cb) {
												db.deleteObjectField('post:' + post.pid, '_imported_toPid', cb);
											},
											function(cb) {
												db.deleteObjectField('post:' + post.pid, '_imported_user_slug', cb);
											},
											function(cb) {
												db.deleteObjectField('post:' + post.pid, '_imported_user_path', cb);
											},
											function(cb) {
												db.deleteObjectField('post:' + post.pid, '_imported_topic_slug', cb);
											},
											function(cb) {
												db.deleteObjectField('post:' + post.pid, '_imported_category_path', cb);
											},
											function(cb) {
												db.deleteObjectField('post:' + post.pid, '_imported_category_slug', cb);
											},
											function(cb) {
												db.deleteObjectField('post:' + post.pid, '_imported_path', cb);
											},
											function(cb) {
												db.deleteObjectField('post:' + post.pid, '_imported_content', cb);
											}
										], nxt);
									} else {
										nxt();
									}
								},
								{async: true, eachLimit: DELETE_BATCH_LIMIT},
								function(err) {
									Controller.progress(1, 1);
									Controller.phase('deleteExtraFieldsPostsDone');
									done(err);
								});
					});
				},
				function(done) {
					if (!Controller._importer) {
						Controller._importer = require('./importer');
					}
					Controller._importer.deleteTmpImportedSetsAndObjects(done);
				}
			], function(err, results) {
				if (err) {
					return error(err);
				}

				Controller.progress(1, 1);
				Controller.phase('deleteExtraFieldsDone');

				fs.remove(LAST_IMPORT_TIMESTAMP_FILE, function(err) {
					Controller.state({
						now: 'idle',
						event: 'delete.done'
					});
					callback(null);
				});

			});
		} else {
			error({error: 'Cannot delete now.'});
		}
	};

	Controller.convertAll = function(callback) {
		callback = _.isFunction(callback) ? callback : noop;

		var rconf = Controller.config().contentConvert.convertRecords;

		var _mainPids = {};

		var error = function(err) {
			Controller.phase('convertDone');
			Controller.state({
				now: 'errored',
				event: 'controller.convertError',
				details: err
			});
			callback(err);
		};

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
						Controller.progress(0, 0);
						Data.countUsers(function(err, total) {
							var index = 0;
							Data.eachUser(
									function(user, next) {
										var nxt = function(err) {
											Controller.progress(index++, total);
											next(err);
										};
										if (user && user._imported_uid && user._imported_signature) {
											db.setObjectField('user:' + user.uid,
													'signature',
													Controller.convert(utils.truncateStr(user._imported_signature, (Meta.config.maximumSignatureLength || 255) - 3)),
													nxt
											);
										} else {
											nxt();
										}
									},
									{async: true, eachLimit: CONVERT_BATCH_LIMIT},
									function(err) {
										Controller.progress(1, 1);
										Controller.phase('convertUsersDone');
										done(err);
									});
						});
					} else {
						done();
					}
				},
				function(done) {
					if (rconf.messages) {
						Controller.phase('convertMessagesStart');
						Controller.progress(0, 0);
						Data.countMessages(function(err, total) {
							var index = 0;
							Data.eachMessage(
									function(message, next) {
										var nxt = function(err) {
											Controller.progress(index++, total);
											next(err);
										};
										if (message && message._imported_content) {
											db.setObjectField('message:' + message.mid,
													'content',
													Controller.convert(message._imported_content),
													nxt
											);
										} else {
											nxt();
										}
									},
									{async: true, eachLimit: CONVERT_BATCH_LIMIT},
									function(err) {
										Controller.progress(1, 1);
										Controller.phase('convertMessagesDone');
										done(err);
									});
						});
					} else {
						done();
					}
				},
				function(done) {
					if (rconf.groups) {
						Controller.phase('convertGroupsStart');
						Controller.progress(0, 0);
						Data.countGroups(function(err, total) {
							var index = 0;
							Data.eachGroup(
									function(group, next) {
										var nxt = function(err) {
											Controller.progress(index++, total);
											next(err);
										};
										if (group && group._imported_name && group._imported_description) {
											db.setObjectField('group:' + group.name,
													'description',
													Controller.convert(group._imported_description),
													nxt
											);
										} else {
											nxt();
										}
									},
									{async: true, eachLimit: CONVERT_BATCH_LIMIT},
									function(err) {
										Controller.progress(1, 1);
										Controller.phase('convertGroupsDone');
										done(err);
									});
						});
					} else {
						done();
					}
				},
				function(done) {
					if (rconf.categoriesNames || rconf.categoriesDescriptions) {
						Controller.phase('convertCategoriesStart');
						Controller.progress(0, 0);
						Data.countCategories(function(err, total) {
							var index = 0;
							Data.eachCategory(
									function(category, next) {
										var nxt = function(err) {
											Controller.progress(index++, total);
											next(err);
										};
										if (category._imported_cid) {
											async.parallel([
												function(cb) {
													if (rconf.categoriesNames && category._imported_name) {
														db.setObjectField('category:' + category.cid, 'name', Controller.convert(category._imported_name), cb);
													} else {
														cb();
													}
												},
												function(cb) {
													if (rconf.categoriesDescriptions && category._imported_description) {
														db.setObjectField('category:' + category.cid, 'description', Controller.convert(category._imported_description), cb);
													} else {
														cb();
													}
												}
											], nxt);
										} else {
											nxt();
										}
									},
									{async: true, eachLimit: CONVERT_BATCH_LIMIT},
									function(err) {
										Controller.progress(1, 1);
										Controller.phase('convertCategoriesDone');
										done(err);
									}
							);
						});
					} else {
						done();
					}
				},
				function(done) {
					if (rconf.topicsTitle || rconf.topicsContent || rconf.postsContent) {
						Controller.phase('convertTopicsStart');
						Controller.progress(0, 0);
						Data.countTopics(function(err, total) {
							var index = 0;
							Data.eachTopic(
									function(topic, next) {
										var nxt = function(err) {
											Controller.progress(index++, total);
											next(err);
										};
										// cache mainPids anyways
										_mainPids[topic.mainPid] = 1;

										if (topic && (rconf.topicsTitle || rconf.topicsContent) && topic._imported_tid) {
											async.parallel([
												function(cb) {
													if (rconf.topicsTitle && topic._imported_title) {
														var convertedTitle = Controller.convert(topic._imported_title);
														db.setObjectField('topic:' + topic.tid, 'title', convertedTitle, function(err) {
															if (err) return cb(err);
															db.setObjectField('topic:' + topic.tid, 'slug', topic.tid + '/' + utils.slugify(convertedTitle), cb);
														});
													} else {
														cb();
													}
												},
												function(cb) {
													if (rconf.topicsContent && topic._imported_content) {
														db.setObjectField('post:' + topic.mainPid, 'content', Controller.convert(topic._imported_content), cb);
													} else {
														cb();
													}
												}
											], nxt);
										} else {
											nxt();
										}
									},
									{async: true, eachLimit: CONVERT_BATCH_LIMIT},
									function(err) {
										Controller.progress(1, 1);
										Controller.phase('convertTopicsDone');
										done(err);
									});
						});
					} else {
						done();
					}
				},
				function(done) {
					if (rconf.postsContent) {
						Controller.phase('convertPostsStart');
						Controller.progress(0, 0);
						Data.countPosts(function(err, total) {
							var index = 0;
							Data.eachPost(
									function(post, next) {
										var nxt = function(err) {
											Controller.progress(index++, total);
											next(err);
										};
										if (post && post._imported_pid && ! _mainPids[post.pid] && post._imported_content) {
											db.setObjectField('post:' + post.pid, 'content', Controller.convert(post._imported_content), nxt);
										} else {
											nxt();
										}
									},
									{async: true, eachLimit: CONVERT_BATCH_LIMIT},
									function(err) {
										Controller.progress(1, 1);
										Controller.phase('convertPostsDone');
										done(err);
									});
						});
					} else {
						done();
					}
				}
			], function(err, results) {

				if (err) {
					return error(err);
				}

				Controller.phase('convertDone');

				Controller.state({
					now: 'idle',
					event: 'convert.done'
				});
				callback(null);
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

})(module.exports);
