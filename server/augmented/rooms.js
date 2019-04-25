
(function (module) {
  const db = require('./database');
  const async = require('async');
  const Data = require('../helpers/data');

  const Rooms = {};

  Rooms.import = function () {
    throw new Error('not implemented');
  };

  Rooms.batchImport = function (array, options, progressCallback, batchCallback) {
    let index = 0;
    options = extend(true, {}, options);

    async.eachSeries(
      array,
      (record, next) => {
        Rooms.import(record, options, (err, data) => {
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

  Rooms.setImported = function (_rid, rid, room, callback) {
    return Data.setImported('_imported:_rooms', '_imported_room:', _rid, rid, room, callback);
  };

  Rooms.getImported = function (_rid, callback) {
    return Data.getImported('_imported:_rooms', '_imported_room:', _rid, callback);
  };

  Rooms.deleteImported = function (_rid, callback) {
    return Data.deleteImported('_imported:_rooms', '_imported_room:', _rid, callback);
  };

  Rooms.deleteEachImported = function (onProgress, callback) {
    return Data.deleteEachImported('_imported:_rooms', '_imported_room:', onProgress, callback);
  };

  Rooms.isImported = function (_rid, callback) {
    return Data.isImported('_imported:_rooms', _rid, callback);
  };

  Rooms.eachImported = function (iterator, options, callback) {
    return Data.each('_imported:_rooms', '_imported_room:', iterator, options, callback);
  };

  Rooms.countImported = function (callback) {
    Data.count('_imported:_rooms', callback);
  };

  Rooms.count = function (callback) {
    db.keys('chat:room:*', (err, keys) => {
      if (err) {
        callback(err);
      }
      callback(err, keys.length);
    });
  };

  Rooms.each = function (iterator, options, callback) {
    options = options || {};
    const prefix = 'chat:room:';
    db.keys(`${prefix}*`, (err, keys) => {
      if (err) {
        return callback(err);
      }
      async.mapLimit(keys, options.batch || Data.DEFAULT_BATCH_SIZE, (key, next) => {
        db.getObject(key, (err, room) => {
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
