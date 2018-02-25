
(function(module) {
  var Data = require('../helpers/data.js');

  var Bookmarks = {};

  Bookmarks.setImported = function (_bid, bid, bookmark, callback) {
    return Data.setImported('_imported:_bookmarks', '_imported_bookmark:', _bid, bid, bookmark, callback);
  };

  Bookmarks.getImported = function (_bid, callback) {
    return Data.getImported('_imported:_bookmarks', '_imported_bookmark:', _bid, callback);
  };

  Bookmarks.deleteImported = function (_bid, callback) {
    return Data.deleteImported('_imported:_bookmarks', '_imported_bookmark:', _bid, callback);
  };

  Bookmarks.deleteEachImported = function(onProgress, callback) {
    return Data.deleteEachImported('_imported:_bookmarks', '_imported_bookmark:', onProgress, callback);
  };

  Bookmarks.isImported = function (_bid, callback) {
    return Data.isImported('_imported:_bookmarks', _bid, callback);
  };

  Bookmarks.eachImported = function (iterator, options, callback) {
    return Data.each('_imported:_bookmarks', '_imported_bookmark:', iterator, options, callback);
  };

  Bookmarks.countImported = function(callback) {
    Data.count('_imported:_bookmarks', callback);
  };

  module.exports = Bookmarks;

}(module));
