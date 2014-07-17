var

	winston = module.parent.require('winston'),
	nconf = module.parent.require('nconf'),
	async = module.parent.require('async'),
	meta = module.parent.require('./meta'),

	utils = module.parent.require('../public/src/utils'),

	Plugin = {};

Plugin.json = require('../plugin.json');

Plugin.json.nbbId = Plugin.json.id.replace(/nodebb-plugin-/, '');

Plugin.getSettings = function(callback) {
	callback = callback || function() {};

	meta.settings.get(Plugin.json.nbbId, function(err, config) {
		if (err) {
			winston.warn('[plugins/' + Plugin.json.nbbId + '] Settings are not set or could not be retrieved!');
			return callback(err);
		}

		Plugin.config = config;
		callback(null, config);
	});
};

Plugin.render = function(req, res, next) {
	res.render('index', {json: Plugin.json || {}, config: Plugin.config || {}});
};

Plugin.admin = {
	filters: {
		menu: function(custom_header, callback) {
			custom_header.plugins.push({
				"route": '/plugins/' + Plugin.json.nbbId,
				"icon": Plugin.json.faIcon,
				"name": Plugin.json.name
			});
			callback(null, custom_header);
		},
		load: function(app, middleware, controllers, callback) {
			Plugin.getSettings(function() {
				require('./routes').setup(app, middleware, controllers, Plugin);

				if (typeof callback === 'function') {
					callback.apply(this, arguments);
				}
			});
		}
	}
};

Plugin.api = {
	'get': {
		logs: function(req, res, next) {

		},
		config: function(req, res, next) {

		},
		status: function(req, res, next) {

		}
	},
	post: {
		config: function(req, res, next) {

		}
	}
};

module.exports = Plugin;