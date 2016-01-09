
(function(module) {
	var nbbpath = require('./nbbpath');
	var db = require('./database');
	var Categories = nbbpath.require('/src/categories.js');

	// [potential-nodebb-core]
	Categories.adopt = function (parentCid, cid, callback) {
		var categoryData;

		async.series([
			function (next) {
				Categories.getCategoryData(cid, function (err, category) {
					if (err) return next(err);
					categoryData = category;
					return db.sortedSetRemove('cid:' + parseInt(category.parentCid || 0, 10) + ':children', cid, function() {
						// ignore errors for this one.
						next();
					});
				});
			},
			async.apply(db.setObjectField, 'category:' + cid, 'parentCid', parentCid),
			async.apply(db.sortedSetAdd, 'cid:' + parentCid + ':children', categoryData.order || cid, cid)
		], callback);
	};

	// [potential-nodebb-core]
	Categories.orphan = function (cid, callback) {
		return Categories.makeChild(cid, 0, callback);
	};

	// [potential-nodebb-core]
	Categories.disable = function (cid, callback) {
		return Categories.setCategoryField(cid, 'disabled', 1, callback);
	};

	// [potential-nodebb-core]
	Categories.enable = function (cid, callback) {
		return Categories.setCategoryField(cid, 'disabled', 0, callback);
	};

	module.exports = User;

}(module));
