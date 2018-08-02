(function(module) {
  var nbbRequire = require('nodebb-plugin-require');
  var nconf = require('nconf');

  try {
    nconf.argv().env({
      separator: '__'
    });

    nconf.stores = nconf.stores || {};
    nconf.stores.env = nconf.stores.env || {};

    var prestart = nbbRequire('src/prestart');
    prestart.loadConfig(nbbRequire.fullpath + '/config.json');
  } catch (e) {}

  var path  = require('path');
  var dispatcher = require('../helpers/dispatcher');

  // nconf.file({file: path.join(nbbRequire.fullpath, '/config.json')});
  var pkg = require(path.join(nbbRequire.fullpath, '/package.json'));

  var dbType = nconf.get('database');
  var productionDbConfig = nconf.get(dbType);

  var db = nbbRequire('src/database');
  dispatcher(db);

  if (! db.client) {
    nconf.set(dbType, productionDbConfig);

    nconf.defaults({
      base_dir: nbbRequire.fullpath,
      themes_path: path.join(nbbRequire.fullpath, '/node_modules'),
      upload_path: 'public/uploads',
      views_dir: path.join(nbbRequire.fullpath, '/build/public/templates'),
      version: pkg.version
    });

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
          return db.client.keys;
        }
    })();

  function mongoKeys (key, callback) {
    key = key[0] === "*" ? key : "^" + key;
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
