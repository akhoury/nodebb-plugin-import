

// todo: how to warn?

(function(module) {

  var nbbRequire = require('nodebb-plugin-require');
  var async = require('async');
  var extend = require('extend');

  // nbb-core
  var Messages = nbbRequire('/src/messaging');

  // custom
  var Data = require('../helpers/data');
  var User = require('../augmented/user');
  var db = require('../augmented/database');

  // var Room = require('../augmented/room');
  var utils = require('../../public/js/utils');

  Messages.batchImport = function (array, options, progressCallback, batchCallback) {
    var index = 0;

    if (typeof batchCallback == 'undefined') {
      batchCallback = progressCallback;
      progressCallback = options;
      options = {};
    }

    options = extend(true, {}, options);

    async.eachSeries(
      array,
      function (record, next) {
        Messages.import(record, options, function(err, data) {

          progressCallback(err, {
            original: record,
            imported: data,
            index: ++index
          });

          // ignore errors:
          // let progressCallback throw an error or log a warning if it wants to.
          next();
        });
      },
      function (err) {
        batchCallback(err);
      });
  };

  Messages.import = function (data, options, callback) {
    if (typeof callback == 'undefined') {
      callback = options;
      options = {};
    }

    Messages.getImported(data._mid, function(err, _imported) {
      if (!err && _imported) {
        return callback('data._mid:' + data._mid + ', already imported', _imported);
      }

      var createData = {
        content: data._content || ' ',
        timestamp: data._timestamp
      };

      async.series([
        function (next) {
          if (!data._fromuid) {
            return next('Messages.import failed, no _fromuid');
          }

          User.getImported(data._fromuid, function (err, fromUser) {
            if (fromUser) {
              createData.fromuid = fromUser.uid;
            }
            next(err);
          });
        },

        function (next) {
          if (data._roomId) {
            // todo
            // return Room.getImported(data._roomId, function (err, room) {
            //  if (room) {
            //    createData.roomId = room.rid;
            //  }
            // });
          }

          data._touids = data._touids || [];

          if (data._touid) {
            data._touids.push(data._touid);
          }

          if (data._touids && data._touids.length) {

            // filter dups
            data._touids = data._touids.filter(function (_touid, index) {
              return !!_touid && this.indexOf(_touid) == index;
            }, data._touids);

            return async.each(data._touids,
              function (_touid, next) {
                return User.getImported(_touid, function (err, toUser) {
                  if (toUser) {
                    createData.touids = createData.touids || [];
                    createData.touids.push(toUser.uid);
                  }
                  next(err);
                });
              }, next);
          }
          next('Messages.import failed, no _touid or _touids or _roomId');
        },

        function(next) {

          if (!createData.fromuid) {
            return next('Messages.import failed, no fromuid');
          }

          if (createData.roomId) {
            // todo: implement
            return next();
          }

          if (createData.touids && createData.touids.length) {
            var listKey = '_imported_message_uids_chat_rooms:';

            var arr = [parseInt(createData.fromuid, 10)]
                .concat(createData.touids.map(function (touid) { return parseInt(touid, 10); }));
            arr.sort(function (a, b) { return a > b ? 1 : a < b ? -1 : 0; });
            listKey += arr.join(':');

            return db.getObject(listKey, function (err, listData) {
              if (err || !listData || !listData.roomId) {
                return Messages.newRoom(createData.fromuid, createData.touids, function (err, roomId) {
                  createData.roomId = roomId;
                  db.setObject(listKey, {roomId: roomId}, function(err) {
                    next(err);
                  });
                });
              }
              createData.roomId = listData.roomId;
              next(err);
            });
          }

          next('Messages.import failed, no touids or roomId');
        },

        function (next) {
          if (!createData.roomId) {
            return callback('Messages.import failed, no roomId provided or found.');
          }

          Messages.addMessage(
            createData.fromuid,
            createData.roomId,
            createData.content,
            createData.timestamp,
            function(err, messageReturn) {
              createData = extend(true, {}, createData, data, messageReturn);
              next(err);
            });
        },

        function (next) {
          Messages.setMessageFields(
            createData.mid,
            {
              __imported_original_data__: JSON.stringify(data)
            },
            next
          );
        },

        function(next) {
          Messages.setImported(data._mid, createData.mid, createData, function(err) {
            next(err);
          });
        }

      ], function(err) {
        if (err) {
          return callback(err, createData);
        }
        callback(null, createData);
      });
    });
  };

  Messages.setImported = function (_uid, uid, user, callback) {
    return Data.setImported('_imported:_messages', '_imported_message:', _uid, uid, user, callback);
  };

  Messages.getImported = function (_uid, callback) {
    return Data.getImported('_imported:_messages', '_imported_message:', _uid, callback);
  };

  Messages.deleteImported = function (_uid, callback) {
    return Data.deleteImported('_imported:_messages', '_imported_message:', _uid, callback);
  };

  Messages.deleteEachImported = function(onProgress, callback) {
    return Data.deleteEachImported('_imported:_messages', '_imported_message:', onProgress, callback);
  };

  Messages.isImported = function (_uid, callback) {
    return Data.isImported('_imported:_messages', _uid, callback);
  };

  Messages.eachImported = function (iterator, options, callback) {
    return Data.each('_imported:_messages', '_imported_message:', iterator, options, callback);
  };

  Messages.countImported = function (callback) {
    return Data.count('_imported:_messages', callback);
  };

  // [potential-nodebb-core]
  Messages.count = function (callback) {
    db.keys('message:*', function(err, keys) {
      if (err) {
        callback(err);
      }
      callback(err, keys.length)
    });
  };

  // [potential-nodebb-core]
  Messages.each = function (iterator, options, callback) {
    if (typeof callback == 'undefined') {
      callback = options;
      options = {};
    }
    options = options || {};

    var prefix = 'message:';
    db.keys(prefix + '*', function(err, keys) {
      if (err) {
        return callback(err);
      }
      async.mapLimit(keys, options.batch || 100, function(key, next) {
        db.getObject(key, function(err, message) {
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