module.exports =  {
	setup: function(app, middleware, controllers, Plugin) {
		var prefix = '/admin/plugins/' + Plugin.json.nbbId,
			apiPrefix = '/api' + prefix;

		app.get(prefix, middleware.applyCSRF, middleware.admin.buildHeader, Plugin.render);
		app.get(apiPrefix, middleware.applyCSRF, Plugin.render);

        app.get(apiPrefix + '/state', Plugin.api.get.state);

        app.get(apiPrefix + '/postImportTools', Plugin.api.get.postImportTools);
        app.get(apiPrefix + '/deleteExtraFields', middleware.admin.isAdmin, Plugin.api.get.deleteExtraFields);
        app.get(apiPrefix + '/isDirty', Plugin.api.get.isDirty);

        app.get(apiPrefix + '/exporters', Plugin.api.get.exporters);

        app.get(apiPrefix + '/download/users.csv', middleware.admin.isAdmin, Plugin.api.get.usersCsv);
        app.get(apiPrefix + '/download/users.json', middleware.admin.isAdmin, Plugin.api.get.usersJson);
        app.get(apiPrefix + '/download/redirect.json', Plugin.api.get.redirectJson);

        app.post(apiPrefix + '/start', middleware.applyCSRF, middleware.admin.isAdmin, Plugin.api.post.start);
        app.post(apiPrefix + '/resume', middleware.applyCSRF, middleware.admin.isAdmin, Plugin.api.post.resume);
        app.post(apiPrefix + '/config', middleware.applyCSRF, middleware.admin.isAdmin, Plugin.api.post.config);
        app.get(apiPrefix + '/config', Plugin.api.get.config);

        app.get(apiPrefix + '/convert/all', middleware.admin.isAdmin, Plugin.api.get.convert);
        app.post(apiPrefix + '/convert/content', middleware.applyCSRF, middleware.admin.isAdmin, Plugin.api.post.convert);
    }
};