(function (module) {
  const nbbRequire = require('nodebb-plugin-require');
  const nconf = nbbRequire('nconf');

  // try {
  //   nconf.argv().env({
  //     separator: '__'
  //   });
  //
  //   nconf.stores = nconf.stores || {};
  //   nconf.stores.env = nconf.stores.env || {};
  //
  //   var prestart = nbbRequire('src/prestart');
  //   prestart.loadConfig(nbbRequire.fullpath + '/config.json');
  // } catch (e) {}

  const path = require('path');
  const dispatcher = require('../helpers/dispatcher');
  const pkg = require(path.join(nbbRequire.fullpath, '/package.json'));
  let dbType;
  const db = nbbRequire('src/database');
  dispatcher(db);

  if (!db.client) {
    nconf.file({ file: path.join(nbbRequire.fullpath, '/config.json') });

    // straight from https://github.com/NodeBB/NodeBB/blob/v1.12.1/src/start.js#L13
    // todo: expose NodeBB/src/start.setupConfigs() and call it here instead
    setupConfigs();

    dbType = nconf.get('database');
    const productionDbConfig = nconf.get(dbType);
    nconf.set(dbType, productionDbConfig);

    nconf.defaults({
      base_dir: nbbRequire.fullpath,
      themes_path: path.join(nbbRequire.fullpath, '/node_modules'),
      upload_path: 'public/uploads',
      views_dir: path.join(nbbRequire.fullpath, '/build/public/templates'),
      version: pkg.version,
    });

    db.init(() => {
      db.emit('ready');
    });
  } else {
    dbType = nconf.get('database');
    setImmediate(() => {
      db.emit('ready');
    });
  }

  // only allows wildcards i.e. "user:*"
  db.keys = db.keys || db.scan || (function () {
    switch (dbType) {
      case 'mongo':
        return mongoKeys;
      case 'redis':
        return db.client.keys;
      case 'postgres':
        return postgresKeys;
    }
  }());

  function mongoKeys(key, callback) {
    key = key[0] === '*' ? key : `^${key}`;
    const regex = new RegExp(key.replace(/\*/g, '.*'));

    db.client.collection('objects').find({ _key: { $regex: regex } }, (err, result) => {
      if (err) {
        return callback(err);
      }
      result.toArray((err, arr) => {
        if (err) {
          return callback(err);
        }
        callback(null, !err && arr ? arr.map((v, i) => v._key) : []);
      });
    });
  }

  function postgresKeys(key, callback) {
    if (key.startsWith('*')) {
      key = '%' + key.substring(1);
    }
    if (key.endsWith('*')) {
      key = key.substring(0, key.length - 1) + '%';
    }

    db.client.query({
      text: `
    SELECT o."_key"
    FROM "legacy_object_live" o
    WHERE o."_key" LIKE '${key}'`,
    })
      .then(res => callback(null, res && res.rows ? res.rows.map(r => r._key) : []))
      .catch(err => callback(err));
  }

  function setupConfigs() {
    // nconf defaults, if not set in config
    if (!nconf.get('sessionKey')) {
      nconf.set('sessionKey', 'express.sid');
    }
    // Parse out the relative_url and other goodies from the configured URL
    const urlObject = url.parse(nconf.get('url'));
    const relativePath = urlObject.pathname !== '/' ? urlObject.pathname.replace(/\/+$/, '') : '';
    nconf.set('base_url', `${urlObject.protocol}//${urlObject.host}`);
    nconf.set('secure', urlObject.protocol === 'https:');
    nconf.set('use_port', !!urlObject.port);
    nconf.set('relative_path', relativePath);
    nconf.set('port', nconf.get('PORT') || nconf.get('port') || urlObject.port || (nconf.get('PORT_ENV_VAR') ? nconf.get(nconf.get('PORT_ENV_VAR')) : false) || 4567);
  }

  module.exports = db;
}(module));
