
(function(module) {
  var nbbRequire = require('nodebb-plugin-require');
  var db = require('./database');
  var async = require('async');
  var extend = require('extend');
  var Data = require('../helpers/data.js');

  // nbb-core
  var Topics = nbbRequire('src/topics');

  Topics.import = function () {
    throw new Error('not implemented');
  };

  Topics.batchImport = function (array, options, progressCallback, batchCallback) {
    var index = 0;
    options = extend(true, {}, options);

    async.eachSeries(
      array,
      function (record, next) {
        Topics.import(record, options, function(err, data) {
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

  Topics.setImported = function (_tid, tid, topic, callback) {
    return Data.setImported('_imported:_topics', '_imported_topic:', _tid, tid, topic, callback);
  };

  Topics.getImported = function (_tid, callback) {
    return Data.getImported('_imported:_topics', '_imported_topic:', _tid, callback);
  };

  Topics.deleteImported = function (_tid, callback) {
    return Data.deleteImported('_imported:_topics', '_imported_topic:', _tid, callback);
  };

  Topics.deleteEachImported = function(onProgress, callback) {
    return Data.deleteEachImported('_imported:_topics', '_imported_topic:', onProgress, callback);
  };

  Topics.isImported = function (_tid, callback) {
    return Data.isImported('_imported:_topics', _tid, callback);
  };

  Topics.eachImported = function (iterator, options, callback) {
    return Data.each('_imported:_topics', '_imported_topic:', iterator, options, callback);
  };

  Topics.countImported = function (callback) {
    Data.count('_imported:_topics', callback);
  };

  // [potential-nodebb-core]
  Topics.count = function (callback) {
    Data.count('topics:tid', callback);
  };

  // [potential-nodebb-core]
  Topics.each = function (iterator, options, callback) {
    return Data.each('topics:tid', 'topic:', iterator, options, callback);
  };

  // [potential-nodebb-core]
  Topics.processNamesSet = function(process, options, callback) {
    return Data.processIdsSet('topics:tid', process, options, callback);
  };

  // [potential-nodebb-core]
  Topics.processSet = function(process, options, callback) {
    return Data.processSet('topics:tid', 'topic:', process, options, callback);
  };

  // use uid=1 assuming it's the main admin

  Topics.tools.forcePurge = function (tid, callback) {
    return Topics.tools.purge(tid, 1, callback);
  };

  Topics.tools.forceLock = function (tid, callback) {
    return Topics.tools.lock(tid, 1, callback);
  };

  Topics.tools.forceUnLock = function (tid, callback) {
    return Topics.tools.unlock(tid, 1, callback);
  };

  Topics.tools.forcePin = function (tid, callback) {
    return Topics.tools.pin(tid, 1, callback);
  };

  Topics.tools.forceUnpin = function (tid, callback) {
    return Topics.tools.unpin(tid, 1, callback);
  };

  module.exports = Topics;

}(module));
