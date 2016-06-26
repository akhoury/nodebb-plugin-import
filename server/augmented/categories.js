
(function(module) {
	var nbbRequire = require('nodebb-plugin-require');
  var db = require('../helpers/database');

	var async = require('async');

  // nbb-core
	var Categories = nbbRequire('/src/categories');

  Categories.batchImport = function (array, options, progressCallback, batchCallback) {
    var index = 0;
    async.eachSeries(
      array,
      function (record, next) {
        Categories.import(record, options, function(err, data) {
          progressCallback(err, {data: data, index: ++index});

          // ignore errors:
          // let progressCallback throw an error or log a warning if it wants to.
          next();
        });
      },
      function (err) {
        batchCallback(err);
      });
  };

  Categories.import = function (data, options, callback) {
    if (typeof callback == 'undefined') {
      callback = options;
      options = {};
    }

    var cid;
    var createData;
    var flushed = options.flush || options.flushed;

    async.series([
      function (next) {
        if (!flushed) {
          return Categories.getImported(data._cid, function(err, _imported) {
            if (err || !_imported) {
              return next();
            }
            callback(null, _imported);
          });
        }

        return next();
      },

      function (next) {
        createData = {
          name: data._name || 'Untitled Category',
          description: data._description || 'no description available',

          // force all categories Parent to be 0, then after the import is done, we can iterate again and fix them.
          parentCid: 0,
          // same deal with disabled
          disabled: 0,

          // you can fix the order later, nbb/admin
          order: data._order || (+new Date),

          link: data._link || 0
        };

        Categories.create(createData, function (err, category) {
          cid = category.cid;

          next(err);
        });
      },

      function (next) {
        var fields = {
          __imported_original_data__: JSON.stringify(data)
        }

        db.setObject('category:' + cid, fields, next);
      }

    ], function () {

    });
  };

  Categories.setImported = function (_cid, cid, category, callback) {
    return Data.setImported('_imported:_categories', '_imported:_category:', _cid, cid, category, callback);
  };

  Categories.getImported = function (_cid, callback) {
    return Data.getImported('_imported:_categories', '_imported:_category:', _cid, callback);
  };

  Categories.deleteImported = function (_cid, callback) {
    return Data.deleteImported('_imported:_categories', '_imported:_category:', _cid, callback);
  };

  Categories.deleteEachImported = function(onProgress, callback) {
    return Data.deleteEachImported('_imported:_categories', '_imported:_category:', onProgress, callback);
  };

  Categories.isImported = function (_cid, callback) {
    return Data.isImported('_imported:_categories', _cid, callback);
  };

  Categories.eachImported = function (iterator, options, callback) {
    return Data.each('_imported:_categories', '_imported:_category:', iterator, options, callback);
  };

  // [potential-nodebb-core]
  Categories.count = function (callback) {
    Data.count('users:joindate', callback);
  };

  // [potential-nodebb-core]
  Categories.each = function (iterator, options, callback) {
    return Data.each('users:joindate', 'user:', iterator, options, callback);
  };

  // [potential-nodebb-core]
  Categories.processUidsSet = function(process, options, callback) {
    return Data.processIdsSet('users:joindate', process, options, callback);
  };

  // [potential-nodebb-core]
  Categories.processSet = function(process, options, callback) {
    return Data.processSet('users:joindate', 'user:', process, options, callback);
  };

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
	Categories.abandon = function (parentCid, cid, callback) {
		return Categories.orphan(cid, callback);
	};

	// [potential-nodebb-core]
	Categories.orphan = function (cid, callback) {
		return Categories.adopt(cid, 0, callback);
	};

	// [potential-nodebb-core]
	Categories.reparent = function (cid, parentCid, callback) {
		return Categories.adopt(parentCid, cid, callback);
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
