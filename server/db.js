
// used for testing only, see temp.js and data.js

(function(module) {
	var path  = require('path'),
			nconf = require('nconf');

	nconf.file({ file: path.join(__dirname, '../../../config.json') });

	var dbType = nconf.get('database'),
			productionDbConfig = nconf.get(dbType);

	nconf.set(dbType, productionDbConfig);
	var db = require('../../../src/database');

	db.init(function() {
		console.log('db.ready');
	});

	module.exports = db;
}(module));

