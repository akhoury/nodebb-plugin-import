const nbbRequire = require('nodebb-plugin-require');

const fs = require('fs-extra');
const path = require('path');
const pkg = require('../package.json');
const Data = require('./helpers/data');

const winston = nbbRequire('winston');
const meta = nbbRequire('src/meta');
const sockets = nbbRequire('src/socket.io');

(function (Plugin) {
  Plugin.json = require('../plugin.json');

  Plugin.json.nbbId = Plugin.json.id.replace(/nodebb-plugin-/, '');

  Plugin.settings = function (settings, callback) {
    if (typeof settings === 'function') {
      callback = settings;
      settings = undefined;
    }
    if (typeof callback !== 'function') {
      callback = function () {};
    }
    if (settings) {
      meta.settings.set(Plugin.json.nbbId, settings, callback);
    } else {
      meta.settings.get(Plugin.json.nbbId, (err, config) => {
        if (err) {
          winston.warn(`[plugins/${Plugin.json.nbbId}] Settings are not set or could not be retrieved!`);
          return callback(err);
        }

        Plugin.config = config;
        callback(null, config);
      });
    }
  };

  Plugin.render = function (req, res, next) {
    // clean this when https://github.com/psychobunny/templates.js/issues/19 is resolved
    const exporterModules = Object.keys(Plugin.json.exporters).map(k => ({ name: k })).slice(3);

    res.render(`admin/plugins/${Plugin.json.nbbId}`, {
      json: Plugin.json || {},
      config: Plugin.config || {},
      pkg,
      exporterModules,
    });
  };

  Plugin.hooks = {
    filters: {
      menu(custom_header, callback) {
        custom_header.plugins.push({
          route: `/plugins/${Plugin.json.nbbId}`,
          icon: Plugin.json.faIcon,
          name: Plugin.json.name,
        });
        callback(null, custom_header);
      },
    },
    statics: {
      load(params, callback) {
        Plugin.settings((err) => {
          if (err) {
            throw err;
          }

          require('./routes').setup(params, Plugin);

          fs.ensureDir(path.join(__dirname, '/tmp'), function (err) {
            Plugin.controller = require('./controller/');
            const handler = function (a, b, c) {
              sockets.server.sockets.emit.apply(sockets.server.sockets, arguments);
            };
            Plugin.controller.on('controller.*', handler);
            Plugin.controller.on('importer.*', handler);
            Plugin.controller.on('exporter.*', handler);
            Plugin.controller.on('convert.*', handler);
            Plugin.controller.on('redirectionTemplates.*', handler);

            if (typeof callback === 'function') {
              callback.apply(this, arguments);
            }
          });
        });
      },
    },
    actions: {},
  };

  Plugin.api = {
    get: {

      data(req, res, next) {
        const { fn } = req.query;
        const args = (req.query.args || '').split(',');

        args.push((err, result) => {
          if (err) {
            res.status(500).json(err);
          } else {
            res.json(result);
          }
        });
        if (typeof Data[fn] === 'function') {
          Data[fn].apply(Data, args);
        } else {
          res.status(500).json({ error: `${fn} is not a Data function` });
        }
      },

      isDirty(req, res, next) {
        res.json({ isDirty: Plugin.controller.isDirty() });
      },

      config(req, res, next) {
        res.json(Plugin.controller.config());
      },

      postImportTools(req, res, next) {
        if (Plugin.controller.postImportToolsAvailble()) {
          res.json({ available: true });
        } else {
          res.json({ available: false });
        }
      },

      settings(req, res, next) {
        Plugin.settings((err, config) => {
          if (err) {
            res.json(500, { error: err });
          } else {
            res.json(config);
          }
        });
      },

      state(req, res, next) {
        const state = Plugin.controller.state();
        res.json(state);
      },

      exporters(req, res, next) {
        Plugin.controller.findModules('nodebb-plugin-import-', (err, results) => {
          res.json(results);
        });
      },

      redirectJson(req, res, next) {
        if (Plugin.controller.postImportToolsAvailble()) {
          Plugin.controller.getRedirectionMap({ format: 'json' });
          res.json({ started: true });
        } else {
          res.json({ error: 'Cannot download now' });
        }
      },

      redirectCsv(req, res, next) {
        if (Plugin.controller.postImportToolsAvailble()) {
          Plugin.controller.getRedirectionMap({ format: 'csv' });
          res.json({ started: true });
        } else {
          res.json({ error: 'Cannot download now' });
        }
      },

			redirectNginxMaps(req, res, next) {
        if (Plugin.controller.postImportToolsAvailble()) {
          Plugin.controller.getRedirectionMap({ format: 'nginx' });
          res.json({ started: true });
        } else {
          res.json({ error: 'Cannot download now' });
        }
      },

      usersJson(req, res, next) {
        if (Plugin.controller.postImportToolsAvailble()) {
          Plugin.controller.getUsersJson();
          res.json({ started: true });
        } else {
          res.json({ error: 'Cannot download now' });
        }
      },

      usersCsv(req, res, next) {
        if (Plugin.controller.postImportToolsAvailble()) {
          Plugin.controller.getUsersCsv();
          res.json({ started: true });
        } else {
          res.json({ error: 'Cannot download now' });
        }
      },

      convert(req, res, next) {
        if (Plugin.controller.postImportToolsAvailble()) {
          Plugin.controller.convertAll();
          res.json({ started: true });
        } else {
          res.json({ error: 'Cannot convert now' });
        }
      },
      deleteExtraFields(req, res, next) {
        if (Plugin.controller.postImportToolsAvailble()) {
          Plugin.controller.deleteExtraFields();
          res.json({ started: false });
        } else {
          res.json({ error: 'Cannot delete now' });
        }
      },
    },

    post: {
      settings(req, res, next) {
        const config = {};

        for (const key in req.body) {
          if (req.body.hasOwnProperty(key)) {
            config[key] = req.body[key];
          }
        }

        Plugin.settings(config, (err, config) => {
          if (err) {
            res.json(500, { error: err });
          } else {
            res.json(config);
          }
        });
      },

      config(req, res, next) {
        const { config } = req.body;
        Plugin.controller.config(config);
        res.json(Plugin.controller.config());
      },

      start(req, res, next) {
        const { config } = req.body;
        if (config) {
          Plugin.controller.config(config);
        }
        Plugin.controller.start();
        res.json({ started: true });
      },

      resume(req, res, next) {
        const { config } = req.body;
        if (config) {
          Plugin.controller.config(config);
        }
        Plugin.controller.resume();
        res.json({ started: true, resuming: true });
      },

      convert(req, res, next) {
        const content = req.body.content || '';
        Plugin.controller.setupConvert();
        res.json({
          content: Plugin.controller.convert(content),
        });
      },
    },
  };
}(module.exports));
