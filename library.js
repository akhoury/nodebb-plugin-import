'use strict'

const controllers = require('./lib/controllers')

const routeHelpers = require.main.require('./src/routes/helpers')

const plugin = {}

plugin.init = async (params) => {
	const {
		router,
		middleware /* , controllers */
	} = params

	/**
	 * We create two routes for every view. One API call, and the actual route itself.
	 * Use the `setupPageRoute` helper and NodeBB will take care of everything for you.
	 *
	 * Other helpers include `setupAdminPageRoute` and `setupAPIRoute`
	 * */
	routeHelpers.setupAdminPageRoute(router, '/admin/plugins/import', middleware, [], controllers.renderAdminPage)
}

plugin.addAdminNavigation = (header) => {
	header.plugins.push({
		route: '/plugins/import',
		icon: 'fa-tint',
		name: 'Import',
	})

	return header
}

module.exports = plugin