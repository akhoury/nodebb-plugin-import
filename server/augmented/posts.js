
(function(module) {
  var nbbRequire = require('nodebb-plugin-require');
  var db = require('./database');
  var async = require('async');
  var extend = require('extend');
  var Data = require('../helpers/data.js');

  // nbb-core
  var Posts = nbbRequire('src/posts');

  Posts.import = function () {
    throw new Error('not implemented');
  };

  Posts.batchImport = function (array, options, progressCallback, batchCallback) {
    var index = 0;
    options = extend(true, {}, options);

    async.eachSeries(
      array,
      function (record, next) {
        Posts.import(record, options, function(err, data) {
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

  Posts.setImported = function (_pid, pid, post, callback) {
    return Data.setImported('_imported:_posts', '_imported_post:', _pid, pid, post, callback);
  };

  Posts.getImported = function (_pid, callback) {
    return Data.getImported('_imported:_posts', '_imported_post:', _pid, callback);
  };

  Posts.deleteImported = function (_pid, callback) {
    return Data.deleteImported('_imported:_posts', '_imported_post:', _pid, callback);
  };

  Posts.deleteEachImported = function(onProgress, callback) {
    return Data.deleteEachImported('_imported:_posts', '_imported_post:', onProgress, callback);
  };

  Posts.isImported = function (_pid, callback) {
    return Data.isImported('_imported:_posts', _pid, callback);
  };

  Posts.eachImported = function (iterator, options, callback) {
    return Data.each('_imported:_posts', '_imported_post:', iterator, options, callback);
  };

  Posts.countImported = function (callback) {
    Data.count('_imported:_posts', callback);
  };

  // [potential-nodebb-core]
  Posts.count = function (callback) {
    Data.count('posts:pid', callback);
  };

  // [potential-nodebb-core]
  Posts.each = function (iterator, options, callback) {
    return Data.each('posts:pid', 'post:', iterator, options, callback);
  };

  // [potential-nodebb-core]
  Posts.processNamesSet = function(process, options, callback) {
    return Data.processIdsSet('posts:pid', process, options, callback);
  };

  // [potential-nodebb-core]
  Posts.processSet = function(process, options, callback) {
    return Data.processSet('posts:pid', 'post:', process, options, callback);
  };

  // join with passed-in timestamp
  // [potential-nodebb-core]
  Posts.joinAt = function (name, uid, timestamp, callback) {
    Posts.join(name, uid, function(err, ret) {
      if (err) {
        return callback(err);
      }
      // partially undo what Group.join by replacing the timestamp
      // obviously if this was moved to core, we would re-write Group.join
      db.sortedSetAdd('post:' + name + ':members', timestamp, uid, callback)
    });
  };

  module.exports = Posts;

}(module));
