
(function (module) {
  const nbbRequire = require('nodebb-plugin-require');
  const db = require('./database');

  const Data = require('../helpers/data');

  const async = require('async');

  // nbb-core
  const Categories = nbbRequire('src/categories');


  Categories.import = function (data, options, callback) {
    throw new Error('not implemented');
  };

  Categories.batchImport = function (array, options, progressCallback, batchCallback) {
    let index = 0;
    async.eachSeries(
      array,
      (record, next) => {
        Categories.import(record, options, (err, data) => {
          progressCallback(err, { data, index: ++index });

          // ignore errors:
          // let progressCallback throw an error or log a warning if it wants to.
          next();
        });
      },
      (err) => {
        batchCallback(err);
      },
    );
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

  Categories.deleteEachImported = function (onProgress, callback) {
    return Data.deleteEachImported('_imported:_categories', '_imported:_category:', onProgress, callback);
  };

  Categories.isImported = function (_cid, callback) {
    return Data.isImported('_imported:_categories', _cid, callback);
  };

  Categories.eachImported = function (iterator, options, callback) {
    return Data.each('_imported:_categories', '_imported:_category:', iterator, options, callback);
  };

  Categories.countImported = function (iterator, options, callback) {
    Data.count('_imported:_categories', callback);
  };

  // [potential-nodebb-core]
  Categories.count = function (callback) {
    Data.count('categories:cid', callback);
  };

  // [potential-nodebb-core]
  Categories.each = function (iterator, options, callback) {
    return Data.each('categories:cid', 'category:', iterator, options, callback);
  };

  // [potential-nodebb-core]
  Categories.processCidsSet = function (process, options, callback) {
    return Data.processIdsSet('categories:cid', process, options, callback);
  };

  // [potential-nodebb-core]
  Categories.processSet = function (process, options, callback) {
    return Data.processSet('categories:cid', 'category:', process, options, callback);
  };

  // [potential-nodebb-core]
  Categories.adopt = function (parentCid, cid, callback) {
    let categoryData;

    async.series([
      function (next) {
        Categories.getCategoryData(cid, (err, category) => {
          if (err) return next(err);
          categoryData = category;

          return db.sortedSetRemove(`cid:${parseInt(category.parentCid || 0, 10)}:children`, cid, () => {
            // ignore errors for this one.
            next();
          });
        });
      },
      async.apply(db.setObjectField, `category:${cid}`, 'parentCid', parentCid),
      async.apply(db.sortedSetAdd, `cid:${parentCid}:children`, categoryData.order || cid, cid),
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

  module.exports = Categories;
}(module));
