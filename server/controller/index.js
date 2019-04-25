
const nbbRequire = require('nodebb-plugin-require');

const path = require('path');
const fs = require('fs-extra');
const _ = require('underscore');
const async = require('async');
const { EventEmitter2 } = require('eventemitter2');
const extend = require('extend');

const noop = function (s) { return s; };
const db = nbbRequire('src/database');

const Categories = require('../augmented/categories');
const Groups = require('../augmented/groups');
const User = require('../augmented//user');
const Messaging = require('../augmented/messages');
const Topics = require('../augmented/topics');
const Posts = require('../augmented//posts');

const utils = require('../../public/js/utils');

const DELIVERABLES_TMP_DIR = path.join(__dirname, '../../public/tmp');
const DELIVERABLES_TMP_URL = path.join('/plugins/nodebb-plugin-import/tmp');
const LOG_FILE = path.join(__dirname, '/tmp/import.log');

const LAST_IMPORT_TIMESTAMP_FILE = path.join(`${__dirname}/tmp/lastimport`);

const DIRTY_FILE = path.join(`${__dirname}/tmp/controller.dirty`);

fs.ensureDirSync(DELIVERABLES_TMP_DIR);
fs.ensureDirSync(path.join(__dirname, '/tmp'));

const DELETE_BATCH_LIMIT = 50;
const CONVERT_BATCH_LIMIT = 50;

const defaults = {
  redirectionFormat: 'json',
  redirectionTemplates: {
    users: {
      oldPath: null,
      newPath: '/user/<%= userslug %>',
    },
    categories: {
      oldPath: null,
      newPath: '/category/<%= cid %>',
    },
    topics: {
      oldPath: null,
      newPath: '/topic/<%= tid %>',
    },
    posts: null,
  },
};

(function (Controller) {
  Controller._dispatcher = new EventEmitter2({
    wildcard: true,
  });

  Controller._state = { now: 'idle', event: '' };

  Controller._config = null;

  Controller.postImportToolsAvailble = function () {
    const state = Controller.state();
    return (!state || state.now === 'idle') && fs.existsSync(LAST_IMPORT_TIMESTAMP_FILE);
  };

  Controller.isDirty = function () {
    if (!Controller._importer) {
      Controller._importer = require('../importer/');
    }
    return Controller._importer.isDirty();
  };

  Controller.complete = function (callback) {
    fs.writeFileSync(LAST_IMPORT_TIMESTAMP_FILE, +new Date(), { encoding: 'utf8' });
    fs.remove(DIRTY_FILE, (err) => {
      Controller.state({
        now: 'idle',
        event: 'importer.complete',
      });
      if (typeof callback === 'function') {
        callback();
      }
      if (Controller._exporter) {
        Controller._exporter.teardown(noop);
      }
    });
  };

  Controller.start = function (config, callback) {
    Controller.config(config);
    config = Controller.config();

    const state = Controller.state();
    if (state.now !== 'idle' && state.now !== 'errored') {
      return Controller.emit('importer.warn', { message: 'Busy, cannot import now', state });
    }

    const start = function () {
      Controller.requireExporter(config, (err, exporter) => {
        Controller.startImport(exporter, config, callback);
      });
    };

    fs.remove(LAST_IMPORT_TIMESTAMP_FILE, (err) => {
      fs.remove(LOG_FILE, (err) => {
        if (config.log.server) {
          fs.ensureFile(LOG_FILE, () => {
            start();
          });
        } else {
          start();
        }
      });
    });
  };

  Controller.resume = function (config, callback) {
    Controller.config(config);
    config = Controller.config();

    const state = Controller.state();
    if (state.now !== 'idle' && state.now !== 'errored') {
      return Controller.emit('importer.warn', { message: 'Busy, cannot import now', state });
    }

    const resume = function () {
      Controller.requireExporter(config, (err, exporter) => {
        Controller.resumeImport(exporter, config, callback);
      });
    };

    if (Controller.config('log').server) {
      fs.ensureFile(LOG_FILE, () => {
        resume();
      });
    } else {
      resume();
    }
  };

  Controller.requireExporter = function (config, callback) {
    if (_.isFunction(config)) {
      callback = config;
      config = null;
    }
    callback = _.isFunction(callback) ? callback : function () {};

    if (config) {
      Controller.config(config);
    }

    if (Controller._exporter) {
      Controller._exporter.removeAllListeners();
    }

    const exporter = require('../exporter/');

    exporter.on('exporter.*', (type, data) => {
      Controller.emit(type, data);
    });

    exporter.once('exporter.ready', () => {
      callback(null, exporter);
    });

    Controller.state({
      now: 'busy',
      event: 'exporter.require',
    });

    exporter.init(Controller.config());

    Controller._exporter = exporter;
  };

  Controller.state = function (state) {
    if (state != null) {
      Controller._state = state;
      Controller.emit('controller.state', Controller._state);
    }
    return Controller._state;
  };

  Controller._requireImporter = function (callback) {
    callback = _.isFunction(callback) ? callback : function () {};

    if (Controller._importer) {
      Controller._importer.removeAllListeners();
    }

    Controller._importer = require('../importer/');

    Controller._importer.on('importer.*', (type, data) => {
      Controller.emit(type, data);
    });

    Controller._importer.once('importer.complete', () => {
      Controller.complete(callback);
    });

    Controller._importer.once('importer.error', () => {
      Controller.state({
        now: 'errored',
        event: 'importer.error',
      });
    });

    Controller._importer.once('importer.start', () => {
      Controller.state({
        now: 'busy',
        event: 'importer.start',
      });
    });
  };

  Controller.startImport = function (exporter, config, callback) {
    fs.writeFileSync(DIRTY_FILE, +new Date(), { encoding: 'utf8' });
    Controller._requireImporter(callback);

    if (_.isFunction(config)) {
      callback = config;
      config = null;
    }

    Controller._importer.once('importer.ready', () => {
      Controller._importer.start();
    });

    Controller._importer.init(exporter, config || Controller.config(), callback);
  };

  Controller.resumeImport = function (exporter, config, callback) {
    Controller._requireImporter(callback);

    if (_.isFunction(config)) {
      callback = config;
      config = null;
    }

    Controller._importer.once('importer.resume', () => {
      Controller.state({
        now: 'busy',
        event: 'importer.resume',
      });
    });

    Controller._importer.once('importer.ready', () => {
      Controller._importer.resume();
    });

    Controller._importer.init(exporter, config || Controller.config(), callback);
  };

  Controller.findModules = function (q, callback) {
    if (typeof q === 'function') {
      callback = q;
      q = ['nodebb-plugin-import-'];
    }

    if (typeof q === 'string') {
      q = [q];
    }

    const	npm = require('npm');
    npm.load({}, (err) => {
      if (err) {
        callback(err);
      }
      npm.config.set('spin', false);
      npm.commands.search(q, (err, results) => {
        callback(err, results);
      });
    });
  };

  Controller.filelog = function () {
    const args = Array.prototype.slice.call(arguments, 0);
    const line = `${args.join(' ')}\n`;
    fs.appendFile(LOG_FILE, line, (err) => {
      if (err) {
        console.warn(err);
      }
    });
  };

  Controller.emit = function (type, b, c) {
    const args = Array.prototype.slice.call(arguments, 0);

    if (Controller.config('log').server) {
      Controller.filelog(args);
    }

    if (Controller.config('log').verbose) {
      console.log.apply(console, args);
    }

    args.unshift(args[0]);
    Controller._dispatcher.emit.apply(Controller._dispatcher, args);
  };

  Controller.on = function () {
    Controller._dispatcher.on.apply(Controller._dispatcher, arguments);
  };

  Controller.once = function () {
    Controller._dispatcher.once.apply(Controller._dispatcher, arguments);
  };

  Controller.removeAllListeners = function () {
    if (Controller._dispatcher && Controller._dispatcher.removeAllListeners) Controller._dispatcher.removeAllListeners();
  };

  Controller.log = function () {
    const args = Array.prototype.slice.call(arguments, 0);
    console.log.apply(console, args);
  };

  // alias
  Controller.saveConfig = function (config, val) {
    return Controller.config(config, val);
  };

  Controller.config = function (config, val) {
    if (config != null) {
      if (typeof config === 'object') {
        utils.recursiveIteration(config);
        Controller._config = extend(true, {}, defaults, config);
        Controller.emit('controller.config', Controller._config);
      } else if (typeof config === 'string') {
        if (val != null) {
          Controller._config = Controller._config || {};
          Controller._config[config] = utils.resolveType(val);
          Controller.emit('controller.config', Controller._config);
        }
        return Controller._config[config];
      }
    }
    return Controller._config;
  };


  const buildFn = function (js) {
    let fn; const
      noop = function (s) { return s; };
    try {
      fn = Function.apply(global, ['content, encoding, url', `${js || ''}\nreturn content;`]);
    } catch (e) {
      console.warn(`${js}\nhas invalid javascript, ignoring...`, e);
      fn = noop;
    }
    return fn;
  };

  Controller.setupConvert = function () {
    const cconf = Controller.config().contentConvert;
    const encoding = require('encoding');
    const url = require('url');

    let parseBefore = function (s) { return s; };
    if (cconf.parseBefore && cconf.parseBefore.enabled && cconf.parseBefore.js) {
      parseBefore = buildFn(cconf.parseBefore.js);
    }

    let parseMain = function (s) { return s; };
    if (cconf.mainConvert && _.isFunction(Controller[cconf.mainConvert])) {
      parseMain = Controller[cconf.mainConvert];
    }

    let parseAfter = function (s) { return s; };
    if (cconf.parseAfter && cconf.parseAfter.enabled && cconf.parseAfter.js) {
      parseAfter = buildFn(cconf.parseAfter.js);
    }

    Controller.convert = function (s, type, id) {
      s = s || '';
      try {
        s = parseAfter(parseMain(parseBefore(s, encoding, url)), encoding, url);
      } catch (e) {
        console.warn(`${type} with id=\`${id}\` and content=\`${s}\`, threw an error during convert, so it was skipped, error= \`${e}\``);
      }
      return s;
    };
  };

  const _convert = require('bbcode-to-markdown');

  Controller['html-to-md'] = _convert.convertHtmlToMarkdown;
  Controller['bbcode-to-md'] = _convert.bbcodeToMarkdown;

  Controller.phasePercentage = 0;

  Controller.progress = function (count, total, interval) {
    interval = interval || 2;
    const percentage = count / total * 100;
    if (percentage === 0 || percentage >= 100 || (percentage - Controller.phasePercentage > interval)) {
      Controller.phasePercentage = percentage;
      Controller.emit('controller.progress', { count, total, percentage });
    }
  };

  Controller.phase = function (phase, data) {
    Controller.phasePercentage = 0;
    Controller.emit('controller.phase', { phase, data, timestamp: +new Date() });
  };

  Controller.getUsersCsv = function (callback) {
    callback = _.isFunction(callback) ? callback : noop;

    Controller.phase('usersCsvStart');
    Controller.progress(0, 0);

    const error = function (err) {
      Controller.phase('usersCsvDone');
      Controller.state({
        now: 'errored',
        event: 'controller.downloadError',
        details: err,
      });
      return callback(err);
    };

    if (Controller.postImportToolsAvailble()) {
      Controller.state({
        now: 'busy',
        event: 'controller.getUsersCsv',
      });

      User.count((err, total) => {
        if (err) {
          return error(err);
        }
        let content = 'index,email,username,clear_text_autogenerated_password,imported_password,_uid,uid,joindate\n';
        let index = 0;
        User.each((user) => {
          const __imported_original_data__ = utils.jsonParseSafe((user || {}).__imported_original_data__, {});

          if (user && __imported_original_data__._uid) {
            content += `${index},${user.email},${user.username},${__imported_original_data__._tmp_autogenerated_password},${__imported_original_data__._password},${__imported_original_data__._uid},${user.uid},${user.joindate}\n`;
          }
          Controller.progress(index++, total);
        }, (err) => {
          if (err) {
            return error(err);
          }
          Controller.progress(total, total);
          Controller.phase('usersCsvDone');

          const filename = 'users.csv';
          const filepath = path.join(DELIVERABLES_TMP_DIR, `/${filename}`);
          const fileurl = `${DELIVERABLES_TMP_URL}/${filename}`;
          const ret = { filename, fileurl, filepath };

          fs.writeFile(filepath, content, 'utf-8', () => {
            Controller.emit('controller.download', ret);
            Controller.state({
              now: 'idle',
              event: 'controller.download',
            });
            callback(null, ret);
          });
        });
      });
    } else {
      error({ error: 'Cannot download file at the moment.' });
    }
  };

  Controller.getUsersJson = function (callback) {
    callback = _.isFunction(callback) ? callback : noop;

    Controller.phase('usersJsonStart');
    Controller.progress(0, 0);

    const error = function (err) {
      Controller.progress(1, 1);
      Controller.phase('usersJsonDone');
      Controller.state({
        now: 'errored',
        event: 'controller.downloadError',
        details: err,
      });
      return callback(err);
    };

    if (Controller.postImportToolsAvailble()) {
      Controller.state({
        now: 'busy',
        event: 'controller.getUsersJson',
      });

      User.count((err, total) => {
        if (err) {
          error(err);
        }
        let content = '[\n';
        let index = 0;
        User.each((user) => {
          const __imported_original_data__ = utils.jsonParseSafe((user || {}).__imported_original_data__, {});

          if (user && __imported_original_data__._uid) {
            content += `${'{'
              + '"index":'}${index},`
              + `"email":"${user.email}",`
              + `"username":"${user.username}",`
              + `"clear_text_autogenerated_password":${__imported_original_data__._tmp_autogenerated_password ? `"${__imported_original_data__._tmp_autogenerated_password}"` : null},`
              + `"imported_password":${__imported_original_data__._password ? `"${__imported_original_data__._password}"` : null},`
              + `"_uid":${__imported_original_data__._uid},`
              + `"uid":${user.uid},`
              + `"joindate":${user.joindate
              }},\n`;
          }
          Controller.progress(index++, total);
        }, (err) => {
          if (err) {
            return error(err);
          }
          Controller.progress(1, 1);
          Controller.phase('usersJsonDone');

          const lastCommaIdx = content.lastIndexOf(',');
          if (lastCommaIdx > -1) {
            content = content.substring(0, lastCommaIdx);
          }
          content += '\n]';

          const filename = 'users.json';
          const filepath = path.join(DELIVERABLES_TMP_DIR, `/${filename}`);
          const fileurl = `${DELIVERABLES_TMP_URL}/${filename}`;
          const ret = { filename, fileurl, filepath };

          fs.writeFile(filepath, content, 'utf-8', () => {
            Controller.emit('controller.download', ret);
            Controller.state({
              now: 'idle',
              event: 'controller.download',
            });
            callback(null, ret);
          });
        });
      });
    } else {
      error({ error: 'Cannot download files at the moment.' });
    }
  };

  Controller.getRedirectionMap = function (options, callback) {
    options = options || {};
    callback = _.isFunction(callback) ? callback : noop;

    Controller.phase('redirectionMapStart');

    const _mainPids = {};

    const error = function (err) {
      Controller.phase('redirectionMapDone');
      Controller.progress(1, 1);
      Controller.state({
        now: 'errored',
        event: 'controller.downloadError',
        details: err,
      });
      return callback(err);
    };

    // precompile redirection templates
    Controller.redirectTemplates = {
      categories: {}, users: {}, topics: {}, posts: {},
    };
    Object.keys(Controller.config().redirectionTemplates || {}).forEach((key) => {
      const model = Controller.config().redirectionTemplates[key];
      if (model && model.oldPath && model.newPath) {
        Controller.redirectTemplates[key].oldPath = _.template(model.oldPath);
        Controller.redirectTemplates[key].newPath = _.template(model.newPath);
      }
    });

    const format = options.format || Controller.config().redirectionFormat;

    let json = '';
    let csv = '';

    if (Controller.postImportToolsAvailble()) {
      Controller.state({
        now: 'busy',
        event: 'controller.getRedirectionMap',
      });

      json += '{\n';

      async.series([
        function (done) {
          if (Controller.redirectTemplates.users.oldPath && Controller.redirectTemplates.users.newPath) {
            Controller.phase('redirectionMapUsersStart');
            Controller.progress(0, 0);
            User.count((err, total) => {
              let index = 0;
              User.each((user) => {
                const __imported_original_data__ = utils.jsonParseSafe((user || {}).__imported_original_data__, {});
                if (user && __imported_original_data__._uid) {
                  // aliases
                  const oldPath = Controller.redirectTemplates.users.oldPath(__imported_original_data__);
                  const newPath = Controller.redirectTemplates.users.newPath(user);

                  json += `"${oldPath}":"${newPath}",\n`;
                  csv += `\n${oldPath},${newPath}`;
                }
                Controller.progress(index++, total);
              }, (err) => {
                Controller.progress(1, 1);
                Controller.phase('redirectionMapUsersDone');
                done(err);
              });
            });
          } else {
            done();
          }
        },
        function (done) {
          if (Controller.redirectTemplates.categories.oldPath && Controller.redirectTemplates.categories.newPath) {
            Controller.phase('redirectionMapCategoriesStart');
            Controller.progress(0, 0);
            Categories.count((err, total) => {
              let index = 0;
              Categories.each(
                (category) => {
                  const __imported_original_data__ = utils.jsonParseSafe((category || {}).__imported_original_data__, {});

                  if (category && __imported_original_data__._cid) {
                    const oldPath = Controller.redirectTemplates.categories.oldPath(__imported_original_data__);
                    const newPath = Controller.redirectTemplates.categories.newPath(category);

                    json += `"${oldPath}":"${newPath}",\n`;
                    csv += `\n${oldPath},${newPath}`;
                  }
                  Controller.progress(index++, total);
                },
                (err) => {
                  Controller.progress(1, 1);
                  Controller.phase('redirectionMapCategoriesDone');
                  done(err);
                },
              );
            });
          } else {
            done();
          }
        },
        function (done) {
          if (Controller.redirectTemplates.topics.oldPath && Controller.redirectTemplates.topics.newPath) {
            Controller.phase('redirectionMapTopicsStart');
            Controller.progress(0, 0);
            Topics.count((err, total) => {
              let index = 0;
              Topics.each(
                (topic) => {
                  const __imported_original_data__ = utils.jsonParseSafe((topic || {}).__imported_original_data__, {});

                  // cache mainPids
                  _mainPids[topic.mainPid] = 1;

                  if (topic && __imported_original_data__._tid) {
                    const oldPath = Controller.redirectTemplates.topics.oldPath(__imported_original_data__);
                    const newPath = Controller.redirectTemplates.topics.newPath(topic);

                    json += `"${oldPath}":"${newPath}",\n`;
                    csv += `\n${oldPath},${newPath}`;
                  }
                  Controller.progress(index++, total);
                },
                (err) => {
                  Controller.progress(1, 1);
                  Controller.phase('redirectionMapTopicsDone');
                  done(err);
                },
              );
            });
          } else {
            done();
          }
        },
        function (done) {
          if (Controller.redirectTemplates.posts.oldPath && Controller.redirectTemplates.posts.newPath) {
            Controller.phase('redirectionMapPostsStart');
            Controller.progress(0, 0);
            Posts.count((err, total) => {
              let index = 0;
              Posts.each(
                (post) => {
                  const __imported_original_data__ = utils.jsonParseSafe((post || {}).__imported_original_data__, {});

                  if (post && __imported_original_data__._pid && !_mainPids[post.pid]) {
                    const oldPath = Controller.redirectTemplates.posts.oldPath(__imported_original_data__);
                    const newPath = Controller.redirectTemplates.posts.newPath(post);

                    json += `"${oldPath}":"${newPath}",\n`;
                    csv += `\n${oldPath},${newPath}`;
                  }
                  Controller.progress(index++, total);
                },
                (err) => {
                  Controller.progress(1, 1);
                  Controller.phase('redirectionMapPostsDone');
                  done(err);
                },
              );
            });
          } else {
            done();
          }
        },
      ], (err, results) => {
        if (err) {
          return error(err);
        }

        Controller.progress(1, 1);
        Controller.phase('redirectionMapDone');

        const lastCommaIdx = json.lastIndexOf(',');
        if (lastCommaIdx > -1) {
          json = json.substring(0, lastCommaIdx);
        }
        json += '\n}';

        const filename = format === 'json' ? 'redirect.map.json' : 'redirect.map.csv';
        const content = format === 'json' ? json : csv;

        const filepath = path.join(DELIVERABLES_TMP_DIR, `/${filename}`);
        const fileurl = `${DELIVERABLES_TMP_URL}/${filename}`;
        const ret = { filename, fileurl, filepath };

        fs.writeFile(filepath, content, 'utf-8', () => {
          Controller.emit('controller.download', ret);
          Controller.state({
            now: 'idle',
            event: 'controller.download',
          });
          callback(null, ret);
        });
      });
    } else {
      error({ error: 'Cannot download files.' });
    }
  };


  Controller.deleteExtraFields = function (callback) {
    callback = _.isFunction(callback) ? callback : noop;
    Controller.phase('deleteExtraFieldsStart');

    const _mainPids = {};

    const error = function (err) {
      Controller.phase('deleteExtraFieldsDone');
      Controller.state({
        now: 'errored',
        event: 'controller.deletingExtraFieldsError',
        details: err,
      });
      return callback(err);
    };

    if (Controller.postImportToolsAvailble()) {
      Controller.state({
        now: 'busy',
        event: 'controller.deleteExtraFields',
      });
      async.series([
        function (done) {
          Controller.phase('deleteExtraFieldsUsersStart');
          Controller.progress(0, 0);
          User.count((err, total) => {
            let index = 0;

            User.each(
              (user, next) => {
                const nxt = function (err) {
                  Controller.progress(index++, total);
                  next(err);
                };
                const __imported_original_data__ = utils.jsonParseSafe((user || {}).__imported_original_data__, {});
                if (user && __imported_original_data__._uid) {
                  async.parallel([
                    function (cb) {
                      db.deleteObjectField(`user:${user.uid}`, '__imported_original_data__', cb);
                    },
                  ], nxt);
                } else {
                  nxt();
                }
              },
              { async: true, eachLimit: DELETE_BATCH_LIMIT },
              (err) => {
                Controller.progress(1, 1);
                Controller.phase('deleteExtraFieldsUsersDone');
                done(err);
              },
            );
          });
        },
        function (done) {
          Controller.phase('deleteExtraFieldsMessagesStart');
          Controller.progress(0, 0);
          Messaging.count((err, total) => {
            let index = 0;
            Messaging.each(
              (message, next) => {
                const nxt = function (err) {
                  Controller.progress(index++, total);
                  next(err);
                };

                if (message && message.__imported_original_data__) {
                  async.parallel([
                    function (cb) {
                      db.deleteObjectField(`message:${message.mid}`, '__imported_original_data__', cb);
                    },
                  ], nxt);
                } else {
                  nxt();
                }
              },
              { async: true, eachLimit: DELETE_BATCH_LIMIT },
              (err) => {
                Controller.progress(1, 1);
                Controller.phase('deleteExtraFieldsMessagesDone');
                done(err);
              },
            );
          });
        },
        function (done) {
          Controller.phase('deleteExtraFieldsGroupsStart');
          Controller.progress(0, 0);
          Groups.count((err, total) => {
            let index = 0;
            Groups.each(
              (group, next) => {
                const nxt = function (err) {
                  Controller.progress(index++, total);
                  next(err);
                };

                if (group && group.__imported_original_data__) {
                  async.parallel([
                    function (cb) {
                      db.deleteObjectField(`group:${group.name}`, '__imported_original_data__', cb);
                    },
                  ], nxt);
                } else {
                  nxt();
                }
              },
              { async: true, eachLimit: DELETE_BATCH_LIMIT },
              (err) => {
                Controller.progress(1, 1);
                Controller.phase('deleteExtraFieldsGroupsDone');
                done(err);
              },
            );
          });
        },
        function (done) {
          Controller.phase('deleteExtraFieldsCategoriesStart');
          Controller.progress(0, 0);
          Categories.count((err, total) => {
            let index = 0;
            Categories.each(
              (category, next) => {
                const nxt = function (err) {
                  Controller.progress(index++, total);
                  next(err);
                };
                if (category.__imported_original_data__) {
                  async.parallel([
                    function (cb) {
                      db.deleteObjectField(`category:${category.cid}`, '__imported_original_data__', cb);
                    },
                  ], nxt);
                } else {
                  nxt();
                }
              },
              { async: true, eachLimit: DELETE_BATCH_LIMIT },
              (err) => {
                Controller.progress(1, 1);
                Controller.phase('deleteExtraFieldsCategoriesDone');
                done(err);
              },
            );
          });
        },
        function (done) {
          Controller.phase('deleteExtraFieldsTopicsStart');
          Controller.progress(0, 0);
          Topics.count((err, total) => {
            let index = 0;
            Topics.each(
              (topic, next) => {
                const nxt = function (err) {
                  Controller.progress(index++, total);
                  next(err);
                };
                if (topic && topic.__imported_original_data__) {
                  _mainPids[topic.mainPid] = 1;
                  async.parallel([
                    function (cb) {
                      db.deleteObjectField(`topic:${topic.tid}`, '__imported_original_data__', cb);
                    },
                  ], nxt);
                } else {
                  nxt();
                }
              },
              { async: true, eachLimit: DELETE_BATCH_LIMIT },
              (err) => {
                Controller.progress(1, 1);
                Controller.phase('deleteExtraFieldsTopicsDone');
                done(err);
              },
            );
          });
        },
        function (done) {
          Controller.phase('deleteExtraFieldsPostsStart');
          Controller.progress(0, 0);
          Posts.count((err, total) => {
            let index = 0;
            Posts.each(
              (post, next) => {
                const nxt = function (err) {
                  Controller.progress(index++, total);
                  next(err);
                };
                if (post && post.__imported_original_data__) {
                  async.parallel([
                    function (cb) {
                      db.deleteObjectField(`post:${post.pid}`, '__imported_original_data__', cb);
                    },
                  ], nxt);
                } else {
                  nxt();
                }
              },
              { async: true, eachLimit: DELETE_BATCH_LIMIT },
              (err) => {
                Controller.progress(1, 1);
                Controller.phase('deleteExtraFieldsPostsDone');
                done(err);
              },
            );
          });
        },
        function (done) {
          if (!Controller._importer) {
            Controller._importer = require('../importer/');
          }
          Controller._importer.deleteTmpImportedSetsAndObjects(done);
        },
      ], (err, results) => {
        if (err) {
          return error(err);
        }

        Controller.progress(1, 1);
        Controller.phase('deleteExtraFieldsDone');

        fs.remove(LAST_IMPORT_TIMESTAMP_FILE, (err) => {
          Controller.state({
            now: 'idle',
            event: 'delete.done',
          });
          callback(null);
        });
      });
    } else {
      error({ error: 'Cannot delete now.' });
    }
  };

  Controller.convertAll = function (callback) {
    callback = _.isFunction(callback) ? callback : noop;

    const rconf = Controller.config().contentConvert.convertRecords;

    const _mainPids = {};

    const error = function (err) {
      Controller.phase('convertDone');
      Controller.state({
        now: 'errored',
        event: 'controller.convertError',
        details: err,
      });
      callback(err);
    };

    Controller.setupConvert();

    if (Controller.postImportToolsAvailble()) {
      Controller.phase('convertStart');

      Controller.state({
        now: 'busy',
        event: 'controller.convertAll',
      });

      async.series([
        function (done) {
          if (rconf.usersSignatures) {
            Controller.phase('convertUsersStart');
            Controller.progress(0, 0);
            User.count((err, total) => {
              let index = 0;
              User.each(
                (user, next) => {
                  const nxt = function (err) {
                    Controller.progress(index++, total);
                    next(err);
                  };
                  const __imported_original_data__ = utils.jsonParseSafe((user || {}).__imported_original_data__, {});
                  if (user && __imported_original_data__._uid && utils.resolveType(__imported_original_data__._signature)) {
                    db.setObjectField(
                      `user:${user.uid}`,
                      'signature',
                      Controller.convert(__imported_original_data__._signature, 'signature', user.uid),
                      nxt,
                    );
                  } else {
                    nxt();
                  }
                },
                { async: true, eachLimit: CONVERT_BATCH_LIMIT },
                (err) => {
                  Controller.progress(1, 1);
                  Controller.phase('convertUsersDone');
                  done(err);
                },
              );
            });
          } else {
            done();
          }
        },
        function (done) {
          if (rconf.messages) {
            Controller.phase('convertMessagesStart');
            Controller.progress(0, 0);
            Messaging.count((err, total) => {
              let index = 0;
              Messaging.each(
                (message, next) => {
                  const nxt = function (err) {
                    Controller.progress(index++, total);
                    next(err);
                  };
                  const __imported_original_data__ = utils.jsonParseSafe((message || {}).__imported_original_data__, {});
                  if (message && __imported_original_data__._content) {
                    db.setObjectField(`message:${message.mid}`,
                      'content',
                      Controller.convert(__imported_original_data__._content, 'message', message.mid),
                      nxt);
                  } else {
                    nxt();
                  }
                },
                { async: true, eachLimit: CONVERT_BATCH_LIMIT },
                (err) => {
                  Controller.progress(1, 1);
                  Controller.phase('convertMessagesDone');
                  done(err);
                },
              );
            });
          } else {
            done();
          }
        },
        function (done) {
          if (rconf.groups) {
            Controller.phase('convertGroupsStart');
            Controller.progress(0, 0);
            Groups.count((err, total) => {
              let index = 0;
              Groups.each(
                (group, next) => {
                  const nxt = function (err) {
                    Controller.progress(index++, total);
                    next(err);
                  };
                  const __imported_original_data__ = utils.jsonParseSafe((group || {}).__imported_original_data__, {});
                  if (group && __imported_original_data__._name && __imported_original_data__._description) {
                    db.setObjectField(`group:${group.name}`,
                      'description',
                      Controller.convert(__imported_original_data__._description, 'group', group.name),
                      nxt);
                  } else {
                    nxt();
                  }
                },
                { async: true, eachLimit: CONVERT_BATCH_LIMIT },
                (err) => {
                  Controller.progress(1, 1);
                  Controller.phase('convertGroupsDone');
                  done(err);
                },
              );
            });
          } else {
            done();
          }
        },
        function (done) {
          if (rconf.categoriesNames || rconf.categoriesDescriptions) {
            Controller.phase('convertCategoriesStart');
            Controller.progress(0, 0);
            Categories.count((err, total) => {
              let index = 0;
              Categories.each(
                (category, next) => {
                  const nxt = function (err) {
                    Controller.progress(index++, total);
                    next(err);
                  };
                  const __imported_original_data__ = utils.jsonParseSafe((category || {}).__imported_original_data__, {});
                  if (__imported_original_data__._cid) {
                    async.parallel([
                      function (cb) {
                        if (rconf.categoriesNames && __imported_original_data__._name) {
                          const convertedName = Controller.convert(__imported_original_data__._name, 'category:name', category.cid);
                          db.setObjectField(`category:${category.cid}`, 'name', Controller.convert(__imported_original_data__._name), () => {
                            if (err) return cb(err);
                            db.setObjectField(`category:${category.cid}`, 'slug', `${category.cid}/${utils.slugify(convertedName)}`, cb);
                          });
                        } else {
                          cb();
                        }
                      },
                      function (cb) {
                        if (rconf.categoriesDescriptions && __imported_original_data__._description) {
                          db.setObjectField(`category:${category.cid}`, 'description', Controller.convert(__imported_original_data__._description, 'category:description', category.cid), cb);
                        } else {
                          cb();
                        }
                      },
                    ], nxt);
                  } else {
                    nxt();
                  }
                },
                { async: true, eachLimit: CONVERT_BATCH_LIMIT },
                (err) => {
                  Controller.progress(1, 1);
                  Controller.phase('convertCategoriesDone');
                  done(err);
                },
              );
            });
          } else {
            done();
          }
        },
        function (done) {
          if (rconf.topicsTitle || rconf.topicsContent || rconf.postsContent) {
            Controller.phase('convertTopicsStart');
            Controller.progress(0, 0);
            Topics.count((err, total) => {
              let index = 0;
              Topics.each(
                (topic, next) => {
                  const nxt = function (err) {
                    Controller.progress(index++, total);
                    next(err);
                  };
                  // cache mainPids anyways
                  _mainPids[topic.mainPid] = 1;
                  const __imported_original_data__ = utils.jsonParseSafe((topic || {}).__imported_original_data__, {});

                  if (topic && (rconf.topicsTitle || rconf.topicsContent) && __imported_original_data__._tid) {
                    async.parallel([
                      function (cb) {
                        if (rconf.topicsTitle && __imported_original_data__._title) {
                          const convertedTitle = Controller.convert(__imported_original_data__._title, 'title', topic.tid);
                          db.setObjectField(`topic:${topic.tid}`, 'title', convertedTitle, (err) => {
                            if (err) return cb(err);
                            db.setObjectField(`topic:${topic.tid}`, 'slug', `${topic.tid}/${utils.slugify(convertedTitle)}`, cb);
                          });
                        } else {
                          cb();
                        }
                      },
                      function (cb) {
                        if (rconf.topicsContent && __imported_original_data__._content) {
                          db.setObjectField(`post:${topic.mainPid}`, 'content', Controller.convert(__imported_original_data__._content, 'post', topic.mainPid), cb);
                        } else {
                          cb();
                        }
                      },
                    ], nxt);
                  } else {
                    nxt();
                  }
                },
                { async: true, eachLimit: CONVERT_BATCH_LIMIT },
                (err) => {
                  Controller.progress(1, 1);
                  Controller.phase('convertTopicsDone');
                  done(err);
                },
              );
            });
          } else {
            done();
          }
        },
        function (done) {
          if (rconf.postsContent) {
            Controller.phase('convertPostsStart');
            Controller.progress(0, 0);
            Posts.count((err, total) => {
              let index = 0;
              Posts.each(
                (post, next) => {
                  const nxt = function (err) {
                    Controller.progress(index++, total);
                    next(err);
                  };
                  const __imported_original_data__ = utils.jsonParseSafe((post || {}).__imported_original_data__, {});
                  if (post && __imported_original_data__._pid && !_mainPids[post.pid] && __imported_original_data__._content) {
                    db.setObjectField(`post:${post.pid}`, 'content', Controller.convert(__imported_original_data__._content, 'post', post.pid), nxt);
                  } else {
                    nxt();
                  }
                },
                { async: true, eachLimit: CONVERT_BATCH_LIMIT },
                (err) => {
                  Controller.progress(1, 1);
                  Controller.phase('convertPostsDone');
                  done(err);
                },
              );
            });
          } else {
            done();
          }
        },
      ], (err, results) => {
        if (err) {
          return error(err);
        }

        Controller.phase('convertDone');

        Controller.state({
          now: 'idle',
          event: 'convert.done',
        });
        callback(null);
      });
    } else {
      Controller.phase('convertDone');
      const err = { error: 'Cannot convert now.' };
      Controller.state({
        now: 'errored',
        event: 'controller.convertError',
        details: err,
      });
      callback(err);
    }
  };
}(module.exports));
