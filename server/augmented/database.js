(function(module) {
  var nbbpath = require('../helpers/nbbpath');

  var winston  = require('winston');
  var async  = require('async');
  var path  = require('path');
  var nconf = require('nconf');
  var dispatcher = require('./dispatcher');

  nconf.file({file: path.join(nbbpath.fullpath, '/config.json') });

  var dbType = nconf.get('database');
  var productionDbConfig = nconf.get(dbType);

  var db = nbbpath.require('/src/database');
  dispatcher(db);

  if (! db.client) {
    nconf.set(dbType, productionDbConfig);
    db.init(function() {
      db.emit("ready");
    });
  } else {
    setImmediate(function () {
      db.emit("ready");
    });
  }

  // only allows wildcards i.e. "user:*"
  db.keys = db.keys || (function() {
      switch (dbType) {
        case "mongo":
          return mongoKeys;
        case "redis":
          return redisKeys;
        case "level":
          return levelKeys;
      }
    })();

  function redisKeys (key, callback) {
    return db.client.keys(key, callback);
  }

  function mongoKeys (key, callback) {
    key = key[0] == "*" ? key : "^" + key;
    var regex = new RegExp(key.replace(/\*/g, '.*'));

    db.client.collection('objects').find( { _key: { $regex: regex } }, function(err, result) {
      if (err) {
        return callback(err);
      }
      result.toArray(function(err, arr) {
        if (err) {
          return callback(err);
        }
        callback(null, !err && arr ? arr.map(function(v, i) {
          return v._key;
        }) : []);
      });
    });
  }

  module.exports = db;

}(module));

