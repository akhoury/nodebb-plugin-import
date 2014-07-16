var plugin = require('./index');

module.exports =  {
	setup: function(app, middleware, controllers, Plugin) {
		var prefix = '/api/admin/plugins/' + Plugin.json.nbbId;

		app.get(prefix.replace(/\/api/, ''), middleware.admin.buildHeader, Plugin.render);

		app.get(prefix + '/config', Plugin.api.get.config);
		app.post(prefix + '/config', Plugin.api.post.config);

		app.get(prefix + '/status', Plugin.api.get.status);
		app.get(prefix + '/logs', Plugin.api.get.logs);
	}
};