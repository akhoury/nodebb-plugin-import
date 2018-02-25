
(function(module) {
  var db = require('./database');
  var async = require('async');
  var Data = require('../helpers/data.js');

  var Rooms = {};

  Rooms.setImported = function (_rid, rid, room, callback) {
    return Data.setImported('_imported:_rooms', '_imported_room:', _rid, rid, room, callback);
  };

  Rooms.getImported = function (_rid, callback) {
    return Data.getImported('_imported:_rooms', '_imported_room:', _rid, callback);
  };

  Rooms.deleteImported = function (_rid, callback) {
    return Data.deleteImported('_imported:_rooms', '_imported_room:', _rid, callback);
  };

  Rooms.deleteEachImported = function(onProgress, callback) {
    return Data.deleteEachImported('_imported:_rooms', '_imported_room:', onProgress, callback);
  };

  Rooms.isImported = function (_rid, callback) {
    return Data.isImported('_imported:_rooms', _rid, callback);
  };

  Rooms.eachImported = function (iterator, options, callback) {
    return Data.each('_imported:_rooms', '_imported_room:', iterator, options, callback);
  };

  Rooms.countImported = function(callback) {
    Data.count('_imported:_rooms', callback);
  };

  Rooms.count = function (callback) {
    Data.keys('chat:room:*', function(err, keys) {
      if (err) {
        callback(err);
      }
      callback(err, keys.length)
    });
  };

  Rooms.each = function (iterator, options, callback) {
    options = options || {};
    var prefix = 'chat:room:';
    Data.keys(prefix + '*', function(err, keys) {
      if (err) {
        return callback(err);
      }
      async.mapLimit(keys, options.batch || Data.DEFAULT_BATCH_SIZE, function(key, next) {
        db.getObject(key, function(err, room) {
          if (room) {
            room.roomId = key.replace(prefix, '');
          }
          iterator(room, next);
        });
      }, callback);
    });
  };

  module.exports = Rooms;

}(module));
