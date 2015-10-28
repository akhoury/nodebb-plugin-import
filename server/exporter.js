var async = require('async'),
		_ = require('underscore'),
		EventEmitter2 = require('eventemitter2').EventEmitter2,

		COUNT_BATCH_SIZE = 500000,
		DEFAULT_EXPORT_BATCH_SIZE = 500000,

// mysql is terrible
		MAX_MYSQL_INT = -1 >>> 1,

		noop = function() {},

		getModuleId = function(module) {
			if (module.indexOf('github.com') > -1) {
				return module.split('/').pop().split('#')[0];
			}
			return module.split('@')[0];
		},

		searchModulesCache = function(moduleName, callback) {
			var mod = require.resolve(getModuleId(moduleName));
			if (mod && ((mod = require.cache[mod]) !== undefined)) {
				(function run(mod) {
					mod.children.forEach(function (child) {
						run(child);
					});
					callback(mod);
				})(mod);
			}
		},

		reloadModule = function(moduleName) {
			searchModulesCache(moduleName, function(mod) {
				delete require.cache[mod.id];
			});

			// https://github.com/joyent/node/issues/8266
			Object.keys(module.constructor._pathCache).forEach(function(cacheKey) {
				if (cacheKey.indexOf(moduleName) > 0) {
					delete module.constructor._pathCache[cacheKey];
				}
			});

			return require(moduleName);
		};

(function(Exporter) {
	var utils = require('../public/js/utils.js');

	Exporter._exporter = null;

	Exporter._dispatcher = new EventEmitter2({
		wildcard: true
	});

	Exporter.init = function(config, cb) {
		Exporter.config = config.exporter || {} ;
		async.series([
			function(next) {
				var opt = {force: true};
				if (config.exporter.skipInstall) {
					opt.skipInstall = true;
					opt.force = false;
				}
				Exporter.install(config.exporter.module, opt, next);
			},
			Exporter.setup
		], _.isFunction(cb) ? cb() : noop);
	};

	Exporter.setup = function(cb) {
		Exporter.augmentLogFunctions();
		Exporter._exporter.setup(Exporter.config, function(err) {
			if (err) {
				Exporter.emit('exporter.error', {error: err});
				return cb(err);
			}
			Exporter.emit('exporter.ready');
			cb();
		});
	};
	Exporter.countAll = function(cb) {
		async.series([
			Exporter.countUsers,
			Exporter.countGroups,
			Exporter.countCategories,
			Exporter.countTopics,
			Exporter.countPosts,
			Exporter.countMessages,
			Exporter.countVotes
		], function(err, results) {
			if (err) return cb(err);
			cb({
				users: results[0],
				groups: results[1],
				categories: results[2],
				topics: results[3],
				posts: results[4],
				messages: results[5],
				votes: results[6]
			});
		});
	};
	Exporter.countUsers = function(cb) {
		if (Exporter._exporter.countUsers) {
			return Exporter._exporter.countUsers(cb);
		}
		var count = 0;
		Exporter.exportUsers(function(err, map, arr, nextBatch) {
					count += arr.length;
					nextBatch();
				},
				{
					batch: COUNT_BATCH_SIZE
				},
				function(err) {
					cb(err, count);
				});
	};
	Exporter.countGroups = function(cb) {
		if (Exporter._exporter.countGroups) {
			return Exporter._exporter.countGroups(cb);
		}
		var count = 0;
		Exporter.exportGroups(function(err, map, arr, nextBatch) {
					count += arr.length;
					nextBatch();
				},
				{
					batch: COUNT_BATCH_SIZE
				},
				function(err) {
					cb(err, count);
				});
	};

	Exporter.countMessages = function(cb) {
		if (Exporter._exporter.countMessages) {
			return Exporter._exporter.countMessages(cb);
		}
		var count = 0;
		Exporter.exportMessages(function(err, map, arr, nextBatch) {
					count += arr.length;
					nextBatch();
				},
				{
					batch: COUNT_BATCH_SIZE
				},
				function(err) {
					cb(err, count);
				});
	};

	Exporter.countCategories = function(cb) {
		if (Exporter._exporter.countCategories) {
			return Exporter._exporter.countCategories(cb);
		}
		var count = 0;
		Exporter.exportCategories(function(err, map, arr, nextBatch) {
					count += arr.length;
					nextBatch();
				},
				{
					batch: COUNT_BATCH_SIZE
				},
				function(err) {
					cb(err, count);
				});
	};
	Exporter.countTopics = function(cb) {
		if (Exporter._exporter.countTopics) {
			return Exporter._exporter.countTopics(cb);
		}
		var count = 0;
		Exporter.exportTopics(function(err, map, arr, nextBatch) {
					count += arr.length;
					nextBatch();
				},
				{
					batch: COUNT_BATCH_SIZE
				},
				function(err) {
					cb(err, count);
				});
	};
	Exporter.countPosts = function(cb) {
		if (Exporter._exporter.countPosts) {
			return Exporter._exporter.countPosts(cb);
		}
		var count = 0;
		Exporter.exportPosts(function(err, map, arr, nextBatch) {
					count += arr.length;
					nextBatch();
				},
				{
					batch: COUNT_BATCH_SIZE
				},
				function(err) {
					cb(err, count);
				});
	};
	Exporter.countVotes = function(cb) {
		if (Exporter._exporter.countVotes) {
			return Exporter._exporter.countVotes(cb);
		}
		var count = 0;
		Exporter.exportVotes(function(err, map, arr, nextBatch) {
					count += arr.length;
					nextBatch();
				},
				{
					batch: COUNT_BATCH_SIZE
				},
				function(err) {
					cb(err, count);
				});
	};

	var onGroups = function(err, arg1, arg2, cb) {
		if (err) return cb(err);
		if (_.isObject(arg1)) {
			return cb(null, arg1, _.isArray(arg2) ? arg2 : _.toArray(arg1));
		}
		if (_.isArray(arg1)) {
			return cb(null, _.isObject(arg2) ? arg2 : _.indexBy(arg1, '_gid'), arg1);
		}
	};
	Exporter.getGroups = function(cb) {
		if (!Exporter._exporter.getGroups) {
			return onGroups(null, {}, [], cb);
		}
		Exporter._exporter.getGroups(function(err, arg1, arg2) {
			onGroups(err, arg1, arg2, cb);
		});
	};
	Exporter.getPaginatedGroups = function(start, end, cb) {
		if (!Exporter._exporter.getPaginatedGroups) {
			return Exporter.getGroups(cb);
		}
		Exporter._exporter.getPaginatedGroups(start, end, function(err, arg1, arg2) {
			onUsers(err, arg1, arg2, cb);
		});
	};

	var onUsers = function(err, arg1, arg2, cb) {
		if (err) return cb(err);
		if (_.isObject(arg1)) {
			return cb(null, arg1, _.isArray(arg2) ? arg2 : _.toArray(arg1));
		}
		if (_.isArray(arg1)) {
			return cb(null, _.isObject(arg2) ? arg2 : _.indexBy(arg1, '_uid'), arg1);
		}
	};
	Exporter.getUsers = function(cb) {
		Exporter._exporter.getUsers(function(err, arg1, arg2) {
			onUsers(err, arg1, arg2, cb);
		});
	};
	Exporter.getPaginatedUsers = function(start, end, cb) {
		if (!Exporter._exporter.getPaginatedUsers) {
			return Exporter.getUsers(cb);
		}
		Exporter._exporter.getPaginatedUsers(start, end, function(err, arg1, arg2) {
			onUsers(err, arg1, arg2, cb);
		});
	};

	var onCategories = function(err, arg1, arg2, cb) {
		if (err) return cb(err);

		if (_.isObject(arg1)) {
			return cb(null, arg1, _.isArray(arg2) ? arg2 : _.toArray(arg1));
		}
		if (_.isArray(arg1)) {
			return cb(null, _.isObject(arg2) ? arg2 : _.indexBy(arg1, '_cid'), arg1);
		}
	};
	Exporter.getCategories = function(cb) {
		Exporter._exporter.getCategories(function(err, arg1, arg2) {
			onCategories(err, arg1, arg2, cb);
		});
	};
	Exporter.getPaginatedCategories = function(start, end, cb) {
		if (!Exporter._exporter.getPaginatedCategories) {
			return Exporter.getCategories(cb);
		}
		Exporter._exporter.getPaginatedCategories(start, end, function(err, arg1, arg2) {
			onCategories(err, arg1, arg2, cb);
		});
	};

	var onTopics = function(err, arg1, arg2, cb) {
		if (err) return cb(err);

		if (_.isObject(arg1)) {
			return cb(null, arg1, _.isArray(arg2) ? arg2 : _.toArray(arg1));
		}
		if (_.isArray(arg1)) {
			return cb(null, _.isObject(arg2) ? arg2 : _.indexBy(arg1, '_tid'), arg1);
		}
	};
	Exporter.getTopics = function(cb) {
		Exporter._exporter.getTopics(function(err, arg1, arg2) {
			onTopics(err, arg1, arg2, cb);
		});
	};
	Exporter.getPaginatedTopics = function(start, end, cb) {
		if (!Exporter._exporter.getPaginatedTopics) {
			return Exporter.getTopics(cb);
		}
		Exporter._exporter.getPaginatedTopics(start, end, function(err, arg1, arg2) {
			onTopics(err, arg1, arg2, cb);
		});
	};

	var onPosts = function(err, arg1, arg2, cb) {
		if (err) return cb(err);

		if (_.isObject(arg1)) {
			return cb(null, arg1, _.isArray(arg2) ? arg2 : _.toArray(arg1));
		}
		if (_.isArray(arg1)) {
			return cb(null, _.isObject(arg2) ? arg2 : _.indexBy(arg1, '_pid'), arg1);
		}
	};
	Exporter.getPosts = function(cb) {
		Exporter._exporter.getPosts(function(err, arg1, arg2) {
			onPosts(err, arg1, arg2, cb);
		});
	};
	Exporter.getPaginatedPosts = function(start, end, cb) {
		if (!Exporter._exporter.getPaginatedPosts) {
			return Exporter.getPosts(cb);
		}
		Exporter._exporter.getPaginatedPosts(start, end, function(err, arg1, arg2) {
			onPosts(err, arg1, arg2, cb);
		});
	};

	var onMessages = function(err, arg1, arg2, cb) {
		if (err) return cb(err);
		if (_.isObject(arg1)) {
			return cb(null, arg1, _.isArray(arg2) ? arg2 : _.toArray(arg1));
		}
		if (_.isArray(arg1)) {
			return cb(null, _.isObject(arg2) ? arg2 : _.indexBy(arg1, '_uid'), arg1);
		}
	};
	Exporter.getMessages = function(cb) {
		if (!Exporter._exporter.getMessages) {
			Exporter.emit('exporter.warn', {warn: 'Current selected exporter does not implement getMessages function, skipping...'});
			return onMessages(null, {}, [], cb);
		}
		Exporter._exporter.getMessages(function(err, arg1, arg2) {
			onMessages(err, arg1, arg2, cb);
		});
	};
	Exporter.getPaginatedMessages = function(start, end, cb) {
		if (!Exporter._exporter.getPaginatedMessages) {
			return Exporter.getMessages(cb);
		}
		Exporter._exporter.getPaginatedMessages(start, end, function(err, arg1, arg2) {
			onMessages(err, arg1, arg2, cb);
		});
	};

	var onVotes = function(err, arg1, arg2, cb) {
		if (err) return cb(err);

		if (_.isObject(arg1)) {
			return cb(null, arg1, _.isArray(arg2) ? arg2 : _.toArray(arg1));
		}
		if (_.isArray(arg1)) {
			return cb(null, _.isObject(arg2) ? arg2 : _.indexBy(arg1, '_vid'), arg1);
		}
	};
	Exporter.getVotes = function(cb) {
		if (!Exporter._exporter.getVotes) { // votes is an optional feature
			Exporter.emit('exporter.warn', {warn: 'Current selected exporter does not implement getVotes function, skipping...'});
			return onVotes(null, {}, [], cb);
		}
		Exporter._exporter.getVotes(function(err, arg1, arg2) {
			onVotes(err, arg1, arg2, cb);
		});
	};
	Exporter.getPaginatedVotes = function(start, end, cb) {
		if (!Exporter._exporter.getPaginatedVotes) {
			return Exporter.getVotes(cb);
		}
		Exporter._exporter.getPaginatedVotes(start, end, function(err, arg1, arg2) {
			onVotes(err, arg1, arg2, cb);
		});
	};

	Exporter.teardown = function(cb) {
		Exporter._exporter.teardown(cb);
	};

	Exporter.install = function(module, options, next) {
		var	npm = require('npm');
		Exporter._exporter = null;

		if (_.isFunction(options)) {
			next = options;
			options = {};
		}

		if (options.skipInstall) {
			var mid = getModuleId(module);
			Exporter._exporter = reloadModule(mid);
			Exporter._module = module;
			Exporter._moduleId = mid;
			return next();
		}

		npm.load(options, function(err) {
			if (err) {
				next(err);
			}

			Exporter.emit('exporter.log', 'installing: ' + module);

			npm.config.set('spin', false);
			npm.config.set('force', !!options.force);
			npm.config.set('verbose', true);

			npm.commands.install([module], function(err) {
				if (err) {
					next(err);
				}

				var moduleId = getModuleId(module);
				var exporter = reloadModule(moduleId);

				if (! Exporter.isCompatible(exporter)) {
					// no?
					if (module.indexOf('github.com/akhoury') === -1) {
						Exporter.emit('exporter.warn', {warn: module + ' is not compatible, trying github.com/akhoury\'s fork'});

						npm.commands.uninstall([module], function(err) {
							if(err) {
								next(err);
							}
							Exporter.emit('exporter.log', 'uninstalled: ' + module);

							// let's try my #master fork till the PRs close and get published
							Exporter.install('git://github.com/akhoury/' + moduleId + '#master', {'no-registry': true}, next);
						});
					} else {
						Exporter.emit('exporter.error', {error: module + ' is not compatible.'});
						next({error: module + ' is not compatible.'});
					}
				} else {

					if (! Exporter.supportsPagination(exporter)) {
						Exporter.emit('exporter.warn', {warn: module + ' does not support Pagination, '
						+ 'it will work, but if you run into memory issues, you might want to contact the developer of it or add support your self. '
						+ 'See https://github.com/akhoury/nodebb-plugin-import/blob/master/write-my-own-exporter.md'
						});
					}

					Exporter._exporter = exporter;
					Exporter._module = module;
					Exporter._moduleId = moduleId;

					next();
				}
			});
		});
	};

	Exporter.isCompatible = function(exporter) {
		exporter = exporter || Exporter._exporter;

		return exporter
				&& _.isFunction(exporter.setup)
				&& (
				Exporter.supportsPagination(exporter) ||
				(
				_.isFunction(exporter.getUsers)
				&& _.isFunction(exporter.getCategories)
				&& _.isFunction(exporter.getTopics)
				&& _.isFunction(exporter.getPosts)
				)
				)
				&& _.isFunction(exporter.teardown)
	};

	Exporter.supportsPagination = function(exporter, type) {
		exporter = exporter || Exporter._exporter;

		return exporter
				&& (function(type) {
					switch (type) {
						case 'users':
							return _.isFunction(exporter.getPaginatedUsers);
							break;
						case 'categories':
							return _.isFunction(exporter.getPaginatedCategories);
							break;
						case 'topics':
							return _.isFunction(exporter.getPaginatedTopics);
							break;
						case 'posts':
							return _.isFunction(exporter.getPaginatedPosts);
							break;

						// optional interfaces
						case 'messages':
							return _.isFunction(exporter.getPaginatedMessages);
							break;
						case 'votes':
							return _.isFunction(exporter.getPaginatedVotes);
							break;

						// if just checking if in general pagination is supported, then don't check the optional ones
						default:
							return _.isFunction(exporter.getPaginatedUsers)
									&& _.isFunction(exporter.getPaginatedCategories)
									&& _.isFunction(exporter.getPaginatedTopics)
									&& _.isFunction(exporter.getPaginatedPosts);
					}
				})(type);
	};

	Exporter.exportGroups = function(process, options, callback) {
		return Exporter.exportType('groups', process, options, callback);
	};

	Exporter.exportUsers = function(process, options, callback) {
		return Exporter.exportType('users', process, options, callback);
	};

	Exporter.exportMessages = function(process, options, callback) {
		return Exporter.exportType('messages', process, options, callback);
	};

	Exporter.exportCategories = function(process, options, callback) {
		return Exporter.exportType('categories', process, options, callback);
	};

	Exporter.exportTopics = function(process, options, callback) {
		return Exporter.exportType('topics', process, options, callback);
	};

	Exporter.exportPosts = function(process, options, callback) {
		return Exporter.exportType('posts', process, options, callback);
	};

	Exporter.exportVotes = function(process, options, callback) {
		return Exporter.exportType('votes', process, options, callback);
	};

	Exporter.exportType = function(type, process, options, callback) {
		if (typeof options === 'function') {
			callback = options;
			options = {};
		}

		callback = typeof callback === 'function' ? callback : function(){};
		options = options || {};

		if (typeof process !== 'function') {
			throw new Error(process + ' is not a function');
		}

		// custom done condition
		options.doneIf = typeof options.doneIf === 'function' ? options.doneIf : function(){};

		// always start at, useful when deleting all records
		// options.alwaysStartAt

		// i.e. exporter.getPaginatedPosts
		// will fallback to get[Type] is pagination is not supported
		var fnName = 'getPaginated' + (type[0].toUpperCase() + type.substr(1).toLowerCase());

		var batch = Exporter.supportsPagination(null, type) ? options.batch || Exporter._exporter.DEFAULT_EXPORT_BATCH_SIZE || DEFAULT_EXPORT_BATCH_SIZE : MAX_MYSQL_INT;

		var start = 0;
		var limit = batch;
		var done = false;

		async.whilst(
				function(err) {
					if (err) {
						return true;
					}
					return !done;
				},
				function(next) {
					if (!Exporter.supportsPagination(null, type) && start > 0) {
						done = true;
						return next();
					}
					Exporter[fnName](start, limit, function(err, map, arr) {
						if (err) {
							return next(err);
						}
						if (!arr.length || options.doneIf(start, limit, map, arr)) {
							done = true;
							return next();
						}
						process(err, map, arr, function(err) {
							if (err) {
								return next(err);
							}
							start += utils.isNumber(options.alwaysStartAt) ? options.alwaysStartAt : batch + 1;
							next();
						});
					})
				},
				callback
		);
	};

	Exporter.emit = function (type, b, c) {
		var args = Array.prototype.slice.call(arguments, 0);
		console.log.apply(console, args);
		args.unshift(args[0]);
		Exporter._dispatcher.emit.apply(Exporter._dispatcher, args);
	};

	Exporter.on = function () {
		Exporter._dispatcher.on.apply(Exporter._dispatcher, arguments);
	};

	Exporter.once = function () {
		Exporter._dispatcher.once.apply(Exporter._dispatcher, arguments);
	};

	Exporter.removeAllListeners = function() {
		Exporter._dispatcher.removeAllListeners();
	};

	Exporter.augmentFn = function (base, extra) {
		return (function () {
			return function () {
				base.apply(this, arguments);
				extra.apply(this, arguments);
			};
		})();
	};

	Exporter.augmentLogFunctions = function() {
		var log = Exporter._exporter.log;
		if (_.isFunction(log)) {
			Exporter._exporter.log = Exporter.augmentFn(log, function (a, b, c) {
				var args = _.toArray(arguments);
				args.unshift('exporter.log');
				Exporter.emit.apply(Exporter, args);
			});
		}
		var warn = Exporter._exporter.warn;
		if (_.isFunction(warn)) {
			Exporter._exporter.warn = Exporter.augmentFn(warn, function () {
				var args = _.toArray(arguments);
				args.unshift('exporter.warn');
				Exporter.emit.apply(Exporter, args);
			});
		}
		var error = Exporter._exporter.error;
		if (_.isFunction(error)) {
			Exporter._exporter.error = Exporter.augmentFn(error, function () {
				var args = _.toArray(arguments);
				args.unshift('exporter.error');
				Exporter.emit.apply(Exporter, args);
			});
		}
	}

})(module.exports);
