
(function(module) {
  var nbbRequire = require('nodebb-plugin-require');
  var db = require('./database');
  var async = require('async');
  var extend = require('extend');
  var Data = require('../helpers/data.js');

  // nbb-core
  var Groups = nbbRequire('src/groups');

  Groups.import = function () {
    throw new Error('not implemented');
  };

  Groups.batchImport = function (array, options, progressCallback, batchCallback) {
    var index = 0;
    options = extend(true, {}, options);

    async.eachSeries(
      array,
      function (record, next) {
        Groups.import(record, options, function(err, data) {
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

  Groups.setImported = function (_gid, gidOrGname, group, callback) {
    return Data.setImported('_imported:_groups', '_imported_group:', _gid, gidOrGname, group, callback);
  };

  Groups.getImported = function (_gid, callback) {
    return Data.getImported('_imported:_groups', '_imported_group:', _gid, callback);
  };

  Groups.deleteImported = function (_gid, callback) {
    return Data.deleteImported('_imported:_groups', '_imported_group:', _gid, callback);
  };

  Groups.deleteEachImported = function(onProgress, callback) {
    return Data.deleteEachImported('_imported:_groups', '_imported_group:', onProgress, callback);
  };

  Groups.isImported = function (_gid, callback) {
    return Data.isImported('_imported:_groups', _gid, callback);
  };

  Groups.eachImported = function (iterator, options, callback) {
    return Data.each('_imported:_groups', '_imported_group:', iterator, options, callback);
  };

  Groups.countImported = function (callback) {
    Data.count('_imported:_groups', callback);
  };

  // [potential-nodebb-core]
  Groups.count = function (callback) {
    Data.count('groups:createtime', callback);
  };

  // [potential-nodebb-core]
  Groups.each = function (iterator, options, callback) {
    return Data.each('groups:createtime', 'group:', iterator, options, callback);
  };

  // [potential-nodebb-core]
  Groups.processNamesSet = function(process, options, callback) {
    return Data.processIdsSet('groups:createtime', process, options, callback);
  };

  // [potential-nodebb-core]
  Groups.processSet = function(process, options, callback) {
    return Data.processSet('groups:createtime', 'group:', process, options, callback);
  };

  // join with passed-in timestamp
  // [potential-nodebb-core]
  Groups.joinAt = function (name, uid, timestamp, callback) {
    Groups.join(name, uid, function(err, ret) {
      if (err) {
        return callback(err);
      }
      // partially undo what Group.join by replacing the timestamp
      // obviously if this was moved to core, we would re-write Group.join
      db.sortedSetAdd('group:' + name + ':members', timestamp, uid, callback)
    });
  };

  module.exports = Groups;

}(module));
