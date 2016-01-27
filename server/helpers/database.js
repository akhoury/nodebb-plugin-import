(function(module) {
  var nbbpath = require('../helpers/nbbpath');

  var winston  = require('winston');
  var async  = require('async');
  var path  = require('path');
  var nconf = require('nconf');

  nconf.file({file: path.join(nbbpath, '/config.json') });

  var dbType = nconf.get('database');
  var productionDbConfig = nconf.get(dbType);

  var db = nbbpath.require('/src/database');

  if (! db.client) {
    // init was not called (yet), most likely running import-standlone
    // todo: potential race condition here if it nodebb was in fact started, but its db.init() was too slow to be called
    // todo: db.init() needs a wrapper here and a callback in it
    nconf.set(dbType, productionDbConfig);
    db.init();
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

  // todo: untested
  // https://github.com/Level/levelup/issues/285
  function levelKeys (key, callback) {
    var stream = db.client.createKeyStream({gte: key.replace(/\*/, '!'), lte: key.replace(/\*/, '~')});
    var keys = [];
    stream.on('data', function(key) {
      keys.push(key);
    });
    stream.on('end', function() {
      callback(null, keys);
    });
  }

  module.exports = db;

}(module));

