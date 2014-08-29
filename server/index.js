var
    winston = module.parent.require('winston'),
    nconf = module.parent.require('nconf'),
    async = module.parent.require('async'),
    meta = module.parent.require('./meta'),
    sockets = module.parent.require('./socket.io'),
    Plugin = {};

Plugin.utils = module.parent.require('../public/src/utils');
Plugin.utils.resolveType = function(str) {
    var type = typeof str;
    if (type !== 'string') {
        return str;
    } else {
        var nb = parseFloat(str);
        if (!isNaN(nb) && isFinite(str))
            return nb;
        if (str === 'false')
            return false;
        if (str === 'true')
            return true;

        try {
            str = JSON.parse(str);
        } catch (e) {}

        return str;
    }
};

Plugin.json = require('../plugin.json');

Plugin.json.nbbId = Plugin.json.id.replace(/nodebb-plugin-/, '');

Plugin.settings = function(settings, callback) {
    if (typeof settings === 'function') {
        callback = settings;
        settings = undefined;
    }
    if (typeof callback !== 'function') {
        callback = function(){};
    }
    if (settings) {
        meta.settings.set(Plugin.json.nbbId, settings, callback);
    } else {
        meta.settings.get(Plugin.json.nbbId, function(err, config) {
            if (err) {
                winston.warn('[plugins/' + Plugin.json.nbbId + '] Settings are not set or could not be retrieved!');
                return callback(err);
            }

            Plugin.config = config;
            callback(null, config);
        });
    }
};

Plugin.render = function(req, res, next) {
    res.render('admin/plugins/import', {json: Plugin.json || {}, config: Plugin.config || {}});
};

Plugin.hooks = {
    filters: {
        menu: function(custom_header, callback) {
            custom_header.plugins.push({
                "route": '/plugins/' + Plugin.json.nbbId,
                "icon": Plugin.json.faIcon,
                "name": Plugin.json.name
            });
            callback(null, custom_header);
        }
    },
    statics: {
        load: function(app, middleware, controllers, callback) {
            Plugin.settings(function(err) {
                if (err) {
                    throw err;
                }

                require('./routes').setup(app, middleware, controllers, Plugin);

                Plugin.controller = require('./controller');

                var handler = function(a, b, c) {
                    sockets.server.sockets.emit.apply(sockets.server.sockets, arguments);
                };

                Plugin.controller.on('controller.*', handler);
                Plugin.controller.on('importer.*', handler);
                Plugin.controller.on('exporter.*', handler);

                if (typeof callback === 'function') {
                    callback.apply(this, arguments);
                }
            });
        }
    },
    actions: {}
};

Plugin.api = {
    'get': {
        fn: function(req, res, next) {
            var fn = req.params.fn || req.query.fn,
                args = req.params.args || req.query.args || [];

            args.push(function(err) {
                if (err) {
                    res.json(500, err);
                } else {
                    res.json.apply(res, arguments);
                }
            });

            if (Plugin.controller && typeof Plugin.controller[fn] === 'function') {
                Plugin.controller[fn].apply(Plugin.controller, args);
            } else {
                res.json(500, {error: 'Could not Controller.' + fn});
            }
        },

        candownload: function(req, res, next) {
            if (Plugin.controller && Plugin.controller.canDownloadDeliverables()) {
                res.json({candownload: true});
            } else {
                res.json({candownload: false});
            }
        },

        config: function(req, res, next) {
            Plugin.settings(function(err, config) {
                if (err) {
                    res.json(500, {error: err});
                } else {
                    res.json(config);
                }
            })
        },

        state: function(req, res, next) {
            if (Plugin.controller) {
                var state = Plugin.controller.state();
                res.json(state);
            } else {
                res.json(500, {error: 'No state'});
            }
        },

        exporters: function(req, res, next) {
            if (Plugin.controller) {
                Plugin.controller.findModules('nodebb-plugin-import-', function(err, results) {
                    res.json(results);
                });
            }
        },

        redirectJson: function(req, res, next) {
            if (Plugin.controller && Plugin.controller.canDownloadDeliverables()) {
                Plugin.controller.getRedirectionJson(function(err, content) {
                    res.json(content);
                });
            } else {
                res.json({error: 'Cannot download now'});
            }
        },

        usersJson: function(req, res, next) {
            if (Plugin.controller && Plugin.controller.canDownloadDeliverables()) {
                Plugin.controller.getUsersJson(function(err, content) {
                    res.json(content);
                });
            } else {
                res.json({error: 'Cannot download now'});
            }
        },

        usersCsv: function(req, res, next) {
            if (Plugin.controller && Plugin.controller.canDownloadDeliverables()) {
                Plugin.controller.getUsersCsv(function(err, content) {
                    res.json(content);
                });
            } else {
                res.json({error: 'Cannot download now'});
            }
        }
    },

    post: {
        config: function(req, res, next) {
            var config = {};

            for (var key in req.body) {
                if (req.body.hasOwnProperty(key)) {
                    config[key] = req.body[key];
                }
            }

            Plugin.settings(config, function(err, config) {
                if (err) {
                    res.json(500, {error: err});
                } else {
                    res.json(config);
                }
            })
        },

        fn: function(req, res, next) {
            var fn = req.body.fn,
                args = req.body.args || [];
//
//            args.push(function(err) {
//                if (err) {
//                    res.json(500, err);
//                } else {
//                    res.json.apply(res, arguments);
//                }
//            });

            if (Plugin.controller && typeof Plugin.controller[fn] === 'function') {
                Plugin.controller[fn].apply(Plugin.controller, args);
                res.json({started: true});
            } else {
                res.json(500, {error: 'Could not Controller.' + fn});
            }
        },

        convert: function(req, res, next) {
            var content = req.body.content || '',
                config = req.body.config;

            if (Plugin.controller) {
                if (!Plugin.controller._importer) {
                    Plugin.controller._importer = require('./importer');
                }

                Plugin.controller._importer.init({}, config.importer, function() {
                    res.json({
                        content: Plugin.controller._importer.convert(content),
                        config: Plugin.controller._importer.config()
                    });
                });
            } else {
                res.json(500, {error: 'Could not Controller.convert'});
            }
        }
    }
};

module.exports = Plugin;