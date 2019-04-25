

// todo: how to warn?

(function (module) {
  const nbbRequire = require('nodebb-plugin-require');
  const async = require('async');
  const extend = require('extend');

  // nbb-core
  const Messages = nbbRequire('src/messaging');

  // custom
  const Data = require('../helpers/data');
  const User = require('../augmented/user');
  const db = require('../augmented/database');

  // var Room = require('../augmented/room');
  const utils = require('../../public/js/utils');


  Messages.import = function (data, options, callback) {
    throw new Error('not implemented');
  };

  Messages.batchImport = function (array, options, progressCallback, batchCallback) {
    let index = 0;

    if (typeof batchCallback === 'undefined') {
      batchCallback = progressCallback;
      progressCallback = options;
      options = {};
    }

    options = extend(true, {}, options);

    async.eachSeries(
      array,
      (record, next) => {
        Messages.import(record, options, (err, data) => {
          progressCallback(err, {
            original: record,
            imported: data,
            index: ++index,
          });

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

  // [potential-nodebb-core]

  Messages.newRoomWithNameAndTimestamp = function (fromUid, toUids, roomName, timestamp, callback) {
    Messages.newRoom(fromUid, toUids, (err, roomId) => {
      if (err) {
        throw err;
        return callback(err);
      }

      Messages.renameRoom(fromUid, roomId, roomName, () => {
        const uids = [fromUid].concat(toUids).sort();

        timestamp = timestamp || new Date();

        async.parallel([
          function (next) {
            db.sortedSetAdd(`chat:room:${roomId}:uids`, timestamp, fromUid, next);
          },
          function (next) {
            db.sortedSetAdd(`chat:room:${roomId}:uids`, uids.map(() => timestamp), uids, next);
          },
          function (next) {
            db.sortedSetsAdd(uids.map(uid => `uid:${uid}:chat:rooms`), timestamp, roomId, next);
          },
          function (next) {
            Messages.getRoomData(roomId, next);
          },
        ], (err, results) => {
          if (err) {
            throw err;
            return callback(err);
          }
          callback(null, results[3]);
        });
      });
    });
  };

  Messages.setImported = function (_mid, uid, message, callback) {
    return Data.setImported('_imported:_messages', '_imported_message:', _mid, uid, message, callback);
  };

  Messages.getImported = function (_mid, callback) {
    return Data.getImported('_imported:_messages', '_imported_message:', _mid, callback);
  };

  Messages.deleteImported = function (_mid, callback) {
    return Data.deleteImported('_imported:_messages', '_imported_message:', _mid, callback);
  };

  Messages.deleteEachImported = function (onProgress, callback) {
    return Data.deleteEachImported('_imported:_messages', '_imported_message:', onProgress, callback);
  };

  Messages.isImported = function (_mid, callback) {
    return Data.isImported('_imported:_messages', _mid, callback);
  };

  Messages.eachImported = function (iterator, options, callback) {
    return Data.each('_imported:_messages', '_imported_message:', iterator, options, callback);
  };

  Messages.countImported = function (callback) {
    return Data.count('_imported:_messages', callback);
  };

  // [potential-nodebb-core]
  Messages.count = function (callback) {
    db.keys('message:*', (err, keys) => {
      if (err) {
        callback(err);
      }
      callback(err, keys.length);
    });
  };

  // [potential-nodebb-core]
  Messages.each = function (iterator, options, callback) {
    if (typeof callback === 'undefined') {
      callback = options;
      options = {};
    }
    options = options || {};

    const prefix = 'message:';
    db.keys(`${prefix}*`, (err, keys) => {
      if (err) {
        return callback(err);
      }
      async.mapLimit(keys, options.batch || 100, (key, next) => {
        db.getObject(key, (err, message) => {
          if (message) {
            message.mid = key.replace(prefix, '');
          }
          iterator(message, next);
        });
      }, callback);
    });
  };

  module.exports = Messages;
}(module));
