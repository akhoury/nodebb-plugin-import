

// todo: how to warn?

(function(module) {

  var nbbRequire = require('nodebb-plugin-require');
  var async = require('async');
  var extend = require('extend');
  var db = require('./database');

  // nbb-core
  var User = nbbRequire('src/user');

  // custom
  var Data = require('../helpers/data.js');
  var utils = require('../../public/js/utils');
  var Groups = require('./groups');
  var File = require('./file');

  User.import = function (data, options, callback) {
    throw new Error('not implemented');
  };

  User.batchImport = function (array, options, progressCallback, batchCallback) {
    var index = 0;
    options = extend(true, {}, options);

    async.eachSeries(
      array,
      function (record, next) {
        User.import(record, options, function(err, data) {
          if (data._claimedOwnership) {
            options.adminTakeOwnership = false;
          }
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

  // support https://github.com/sanbornmedia/nodebb-plugin-friends
  User.isFriends = function (uid, toUid, callback) {
    if (Array.isArray(toUid)) {
      db.isSortedSetMembers('uid:' + uid + ':friends', toUid, callback);
    } else {
      db.isSortedSetMember('uid:' + uid + ':friends', toUid, callback);
    }
  };

  // support https://github.com/sanbornmedia/nodebb-plugin-friends
  User.friend = function (uid, toUid, timestamp, callback) {
    if (typeof timestamp === 'function') {
      callback = timestamp;
      timestamp = null;
    }
    var now = timestamp || Date.now();
    async.parallel([
      async.apply(db.sortedSetAdd, 'uid:' + uid + ':friends', now, toUid),
      async.apply(db.sortedSetRemove, 'uid:' + uid + ':friends:pending', toUid),
      async.apply(db.sortedSetRemove, 'uid:' + uid + ':friends:requests', toUid),
      async.apply(db.sortedSetAdd, 'uid:' + toUid + ':friends', now, uid),
      async.apply(db.sortedSetRemove, 'uid:' + toUid + ':friends:pending', uid),
      async.apply(db.sortedSetRemove, 'uid:' + toUid + ':friends:requests', uid),
    ], function(err) {
      if (err) {
        return callback(err);
      }
      callback();
    });
  };

  User.setImported = function (_uid, uid, user, callback) {
    return Data.setImported('_imported:_users', '_imported_user:', _uid, uid, user, callback);
  };

  User.getImported = function (_uid, callback) {
    return Data.getImported('_imported:_users', '_imported_user:', _uid, callback);
  };

  User.deleteImported = function (_uid, callback) {
    return Data.deleteImported('_imported:_users', '_imported_user:', _uid, callback);
  };

  User.deleteEachImported = function(onProgress, callback) {
    return Data.deleteEachImported('_imported:_users', '_imported_user:', onProgress, callback);
  };

  User.isImported = function (_uid, callback) {
    return Data.isImported('_imported:_users', _uid, callback);
  };

  User.eachImported = function (iterator, options, callback) {
    return Data.each('_imported:_users', '_imported_user:', iterator, options, callback);
  };

  // [potential-nodebb-core]
  User.count = function (callback) {
    Data.count('users:joindate', callback);
  };

  // [potential-nodebb-core]
  User.each = function (iterator, options, callback) {
    return Data.each('users:joindate', 'user:', iterator, options, callback);
  };

  // [potential-nodebb-core]
  User.processUidsSet = function(process, options, callback) {
    return Data.processIdsSet('users:joindate', process, options, callback);
  };

  // [potential-nodebb-core]
  User.processSet = function(process, options, callback) {
    return Data.processSet('users:joindate', 'user:', process, options, callback);
  };

  // [potential-nodebb-core]
  User.confirmEmail = function (uid, callback) {

    // todo: gonna need to confirmation-code somehow and delete it from the set
    async.series([
      async.apply(User.setUserField, uid, 'email:confirmed', 1)
    ], callback);
  };

  // [potential-nodebb-core]
  User.setReputation = function (uid, reputation, callback) {
    async.series([
      async.apply(db.sortedSetAdd, 'users:reputation', reputation, uid),
      async.apply(User.setUserField, uid, 'reputation', reputation),
    ], callback);
  };

  // [potential-nodebb-core]
  User.makeAdministrator = function (uid, joindate, callback) {
    Groups.joinAt('administrators', uid, joindate, callback);
  };

  // [potential-nodebb-core]
  User.makeModerator = function (uid, cid, joindate) {
    Groups.joinAt('cid:' + cid + ':privileges:mods:members', uid, joindate, callback);
  };

  // [potential-nodebb-core]
  User.setProfilePictureUrl = function (uid, url, callback) {
    return User.setUserFields(uid, {uploadedpicture: url, picture: url}, callback);
  };

  // [potential-nodebb-core]
  User.setProfilePictureBlob = function (uid, blob, options, callback) {
    callback = arguments[arguments.length - 1];

    var extension = options.extension || options.ext || '.png';
    var filename = options.filename || 'profile_picture_' + uid + extension;
    var folder = options.folder || 'profile_pictures';

    File.saveBlobToLocal(filename, folder, blob, function(err, ret) {
      if (err) return callback(err);

      User.setProfilePictureUrl(uid, ret.url, function(err) {
        if (err) return callback(err);
        callback(null, ret);
      });
    });
  };

  function pickAndCleanUsername () {
    var args = Array.prototype.slice(arguments, 0);

    if (!args.length) {
      return '';
    }

    var username = args[0];
    if (utils.isUserNameValid(username)) {
      return username;
    }

    // todo: i don't know what I'm doing HALP
    username = username
      .replace(/[^\u00BF-\u1FFF\u2C00-\uD7FF\-.*\w\s]/gi, '')
      .replace(/ /g,'')
      .replace(/\*/g, '')
      .replace(/æ/g, '')
      .replace(/ø/g, '')
      .replace(/å/g, '');

    if (utils.isUserNameValid(username)) {
      return username;
    }

    args.shift();

    return pickAndCleanUsername.apply(null, args);
  }

  function generateRandomString (len, chars) {
    var index = (Math.random() * (chars.length - 1)).toFixed(0);
    return len > 0 ? chars[index] + generateRandomString(len - 1, chars) : '';
  }


  module.exports = User;

}(module));