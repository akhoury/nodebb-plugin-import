module.exports =  {
	setup: function(params, Plugin) {
		var router = params.router;
		var middleware = params.middleware;

		var prefix = '/admin/plugins/' + Plugin.json.nbbId;
		var apiPrefix = '/api' + prefix;

		router.get(prefix, middleware.applyCSRF, middleware.admin.buildHeader, Plugin.render);
		router.get(apiPrefix, middleware.applyCSRF, Plugin.render);

		router.get(apiPrefix + '/state', Plugin.api.get.state);

		router.get(apiPrefix + '/postImportTools', Plugin.api.get.postImportTools);
		router.get(apiPrefix + '/deleteExtraFields', middleware.admin.isAdmin, Plugin.api.get.deleteExtraFields);
		router.get(apiPrefix + '/isDirty', Plugin.api.get.isDirty);

		router.get(apiPrefix + '/exporters', Plugin.api.get.exporters);

		router.get(apiPrefix + '/download/users.csv', middleware.admin.isAdmin, Plugin.api.get.usersCsv);
		router.get(apiPrefix + '/download/users.json', middleware.admin.isAdmin, Plugin.api.get.usersJson);
		router.get(apiPrefix + '/download/redirect.json', Plugin.api.get.redirectJson);

		router.post(apiPrefix + '/start', middleware.applyCSRF, middleware.admin.isAdmin, Plugin.api.post.start);
		router.post(apiPrefix + '/resume', middleware.applyCSRF, middleware.admin.isAdmin, Plugin.api.post.resume);
		router.post(apiPrefix + '/config', middleware.applyCSRF, middleware.admin.isAdmin, Plugin.api.post.config);
		router.get(apiPrefix + '/config', Plugin.api.get.config);

		router.get(apiPrefix + '/convert/all', middleware.admin.isAdmin, Plugin.api.get.convert);
		router.post(apiPrefix + '/convert/content', middleware.applyCSRF, middleware.admin.isAdmin, Plugin.api.post.convert);

		router.get(apiPrefix + '/data', middleware.admin.isAdmin, Plugin.api.get.data);
	}
};
