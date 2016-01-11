//var Groups = require('../../../src/groups.js');

(function(module) {
	var nbbpath = require('nbbpath');
	var db = require('./database.js');
	var Groups = nbbpath.require('/src/groups.js');

	// join with passed-in timestamp
	// [potential-nodebb-core]
	Groups.joinAt = function (name, uid, timestamp, callback) {
		Groups.join(name, uid, function(err, ret) {
			if (err) {
				return callback(err);
			}
			// partially undo what Group.join did, then setAdd with the new timestamp.
			// obviously if this was moved to core, we would re-write Group.join
			db.sortedSetAdd('group:' + name + ':members', timestamp, uid, callback)
		});
	};

	module.exports = Groups;

}(module));