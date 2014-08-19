module.exports =  {
	setup: function(app, middleware, controllers, Plugin) {
		var prefix = '/admin/plugins/' + Plugin.json.nbbId,
			apiPrefix = '/api' + prefix;

		app.get(prefix, middleware.admin.buildHeader, Plugin.render);
		app.get(apiPrefix, middleware.admin.buildHeader, Plugin.render);

		app.get(apiPrefix + '/state', Plugin.api.get.state);

        app.post(apiPrefix + '/fn', Plugin.api.post.fn);
        app.get(apiPrefix + '/fn', Plugin.api.get.fn);
	}
};