var
		pkg = require('../package.json'),
		fs = require('fs-extra'),
		_ = require('underscore'),
		path = require('path'),
		Data = require('./data.js'),
		winston = module.parent.require('winston'),
		nconf = module.parent.require('nconf'),
		async = module.parent.require('async'),
		meta = module.parent.require('./meta'),
		sockets = module.parent.require('./socket.io'),
		utils = require(path.join(__dirname, '/../public/js/utils.js'));

(function(Plugin) {

	Plugin.json = require('../plugin.json');

	Plugin.json.nbbId = Plugin.json.id.replace(/nodebb-plugin-/, '');

	Plugin.settings = function(settings, callback) {
		if (typeof settings === 'function') {
			callback = settings;
			settings = undefined;
		}
		if (typeof callback !== 'function') {
			callback = function(){};
		}
		if (settings) {
			meta.settings.set(Plugin.json.nbbId, settings, callback);
		} else {
			meta.settings.get(Plugin.json.nbbId, function(err, config) {
				if (err) {
					winston.warn('[plugins/' + Plugin.json.nbbId + '] Settings are not set or could not be retrieved!');
					return callback(err);
				}

				Plugin.config = config;
				callback(null, config);
			});
		}
	};

	Plugin.render = function(req, res, next) {
		res.render(
				'admin/plugins/' + Plugin.json.nbbId,
				{
					json: Plugin.json || {},
					config: Plugin.config || {},
					pkg: pkg,
					// clean this when https://github.com/psychobunny/templates.js/issues/19 is resolved
					exporters: Object.keys(pkg.optionalDependencies).map(function(k) { return {name: k}; }),
				}
		);
	};

	Plugin.hooks = {
		filters: {
			menu: function(custom_header, callback) {
				custom_header.plugins.push({
					"route": '/plugins/' + Plugin.json.nbbId,
					"icon": Plugin.json.faIcon,
					"name": Plugin.json.name
				});
				callback(null, custom_header);
			}
		},
		statics: {
			load: function(params, callback) {
				Plugin.settings(function(err) {
					if (err) {
						throw err;
					}

					require('./routes').setup(params, Plugin);

					fs.ensureDir(path.join(__dirname, '/tmp'), function(err) {
						Plugin.controller = require('./controller');
						var handler = function(a, b, c) {
							sockets.server.sockets.emit.apply(sockets.server.sockets, arguments);
						};
						Plugin.controller.on('controller.*', handler);
						Plugin.controller.on('importer.*', handler);
						Plugin.controller.on('exporter.*', handler);
						Plugin.controller.on('convert.*', handler);
						Plugin.controller.on('redirectionTemplates.*', handler);

						if (typeof callback === 'function') {
							callback.apply(this, arguments);
						}
					});
				});
			}
		},
		actions: {}
	};

	Plugin.api = {
		'get': {

			data: function(req, res, next) {
				var fn = req.query.fn,
						args = (req.query.args || '').split(',');
				args.push(function(err, result) {
					if (err) {
						res.status(500).json(err);
					} else {
						res.json(result);
					}
				});
				if (typeof Data[fn] === 'function') {
					Data[fn].apply(Data, args);
				} else {
					res.status(500).json({ error: 'message' });
				}
			},

			isDirty: function(req, res, next) {
				res.json({isDirty: Plugin.controller.isDirty()});
			},

			config: function(req, res, next) {
				res.json(Plugin.controller.config());
			},

			postImportTools: function(req, res, next) {
				if (Plugin.controller.postImportToolsAvailble()) {
					res.json({available: true});
				} else {
					res.json({available: false});
				}
			},

			settings: function(req, res, next) {
				Plugin.settings(function(err, config) {
					if (err) {
						res.json(500, {error: err});
					} else {
						res.json(config);
					}
				})
			},

			state: function(req, res, next) {
				var state = Plugin.controller.state();
				res.json(state);
			},

			exporters: function(req, res, next) {
				Plugin.controller.findModules('nodebb-plugin-import-', function(err, results) {
					res.json(results);
				});
			},

			redirectJson: function(req, res, next) {
				if (Plugin.controller.postImportToolsAvailble()) {
					Plugin.controller.getRedirectionJson();
					res.json({started: true});
				} else {
					res.json({error: 'Cannot download now'});
				}
			},

			usersJson: function(req, res, next) {
				if (Plugin.controller.postImportToolsAvailble()) {
					Plugin.controller.getUsersJson();
					res.json({started: true});
				} else {
					res.json({error: 'Cannot download now'});
				}
			},

			usersCsv: function(req, res, next) {
				if (Plugin.controller.postImportToolsAvailble()) {
					Plugin.controller.getUsersCsv();
					res.json({started: true});
				} else {
					res.json({error: 'Cannot download now'});
				}
			},

			convert: function(req, res, next) {
				if (Plugin.controller.postImportToolsAvailble()) {
					Plugin.controller.convertAll();
					res.json({started: true});
				} else {
					res.json({error: 'Cannot convert now'});
				}
			},
			deleteExtraFields: function(req, res, next) {
				if (Plugin.controller.postImportToolsAvailble()) {
					Plugin.controller.deleteExtraFields();
					res.json({started: false});
				} else {
					res.json({error: 'Cannot delete now'});
				}
			}
		},

		post: {
			settings: function(req, res, next) {
				var config = {};

				for (var key in req.body) {
					if (req.body.hasOwnProperty(key)) {
						config[key] = req.body[key];
					}
				}

				Plugin.settings(config, function(err, config) {
					if (err) {
						res.json(500, {error: err});
					} else {
						res.json(config);
					}
				})
			},

			config: function(req, res, next) {
				var config = req.body.config;
				Plugin.controller.config(config);
				res.json(Plugin.controller.config());
			},

			start: function(req, res, next) {
				var config = req.body.config;
				if (config) {
					Plugin.controller.config(config);
				}
				Plugin.controller.start();
				res.json({started: true});
			},

			resume: function(req, res, next) {
				var config = req.body.config;
				if (config) {
					Plugin.controller.config(config);
				}
				Plugin.controller.resume();
				res.json({started: true, resuming: true});
			},

			convert: function(req, res, next) {
				var content = req.body.content || '';
				Plugin.controller.setupConvert();
				res.json({
					content: Plugin.controller.convert(content)
				});
			}
		}
	};

})(module.exports);
