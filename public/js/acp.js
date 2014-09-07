(function(scope) {
    require(['settings'], function(Settings) {

        scope.plugins = scope.plugins || {};

        var PLUGIN_NAME = 'import';

        plugins[PLUGIN_NAME] = plugins[PLUGIN_NAME] || {};

        var plugin = plugins[PLUGIN_NAME];
        plugin.name = PLUGIN_NAME;
        plugin.apiHost = '/api/admin/plugins/' + PLUGIN_NAME;

        var STORAGE_KEY = 'nodebb-plugin-' + plugin.name + ':exporters';
        var STORAGE_TTL = 1 * 24 * 60 * 60 * 1000; // 1 day
        var LOG_FILE = 'nodebb-plugin-' + plugin.name + '-log.txt';

        var $wrapper = $('.' + plugin.name + '-wrapper');
        var $form = $('.' + plugin.name + '-settings');

        var _settings = null;

        var util = plugin.util = {
            customName: function(options) {
                options = options || {};
                options.delim = options.delim || '-';
                options.prefix = options.prefix || PLUGIN_NAME;

                var parts = (name || '')
                    .replace(/\s{2,}/g, ' ')
                    .split(' ');

                return $.map(parts, function(v, i) {
                    return options.prefix + (v ? options.delim + v : '');
                }).join(' ');
            },

            cssName: function(name) {
                return this.customName(name);
            },

            eventName: function(name) {
                return this.customName(name, {delim: '.'});
            },

            // github.com/gkindel
            props: function(obj, props, value) {
                if(obj === undefined)
                    obj = window;
                if(props == null)
                    return undefined;
                var i = props.indexOf('.');
                if( i == -1 ) {
                    if(value !== undefined)
                        obj[props] = value;
                    return obj[props];
                }
                var prop = props.slice(0, i),
                    newProps = props.slice(i + 1);

                if(props !== undefined && !(obj[prop] instanceof Object) )
                    obj[prop] = {};

                return util.props(obj[prop], newProps, value);
            },

            toggleVisible: function($el, toggle) {
                if (toggle === true) {
                    return $el.show().removeClass('hidden');
                }
                if (toggle === false) {
                    return $el.hide().addClass('hidden');
                }

                if ($el.is(':visible')) {
                    $el.hide().addClass('hidden');
                } else {
                    $el.show().removeClass('hidden');
                }
            },

            toggleAvailable: function($el, toggle) {
                if (toggle === true) {
                    return $el.prop('disabled', false).removeClass('disabled');
                }
                if (toggle === false) {
                    return $el.prop('disabled', true).addClass('disabled');
                }
                if ($el.prop('disabled') || $el.hasClass('disabled')) {
                    $el.prop('disabled', false).removeClass('disabled');
                } else {
                    $el.prop('disabled', true).addClass('disabled')
                }
            },

            toggleHorizontal: function($el, toggle) {
                if (!$el || !$el.length) return;
                var visible = $el.is(':visible'),
                    show = function() {
                        $el.stop().css({opacity: 1}).show().animate({width: $el.data('width') || '100%'});
                        return true;
                    },
                    hide = function() {
                        $el.data('width', $el.width());
                        $el.stop().css({opacity: 0}).animate({width: 0}, {done: $el.hide.bind($el)});
                        return false;
                    };

                return (toggle === false || visible) && toggle !== true ? hide() : show();
            },

            toggleVertical: function($el, toggle, visibleDirection) {
                var show, hide;

                if (!$el) return;

                if (toggle === 'up' || toggle === 'down') {
                    visibleDirection = toggle;
                    toggle = undefined;
                }
                visibleDirection = visibleDirection || 'down';

                if (visibleDirection === 'down') {
                    show = function() { $el.slideDown(); return true; };
                    hide = function() { $el.slideUp(); return false; };
                } else {
                    show = function() { $el.slideUp(); return true; };
                    hide = function() { $el.slideDown(); return false; };
                }
                return (toggle === false || $el.is(':visible')) && toggle !== true ? hide() : show();
            }
        };

        var actions = plugin.actions = {

            slideVerticalToggle: function(e) {
                var btn = $(e.target),
                    target = $wrapper.find(btn.attr('data-target')),
                    visibleDirection = btn.attr('data-target-visible-direction');
                return util.toggleVertical(target, visibleDirection);
            },

            slideHorizontalToggle: function(e) {
                var btn = $(e.target),
                    target = $wrapper.find(btn.attr('data-target'));

                return util.toggleHorizontal(target);
            },

            visibleToggle: function(e) {
                var btn = $(e.target),
                    target = $wrapper.find(btn.attr('data-target'));

                return util.toggleVisible(target);
            },

            availableToggle: function(e) {
                var btn = $(e.target),
                    target = $wrapper.find(btn.attr('data-target'));

                return util.toggleAvailable(target);
            },

            saveSettings: function(e) {
                if (e) {
                    e.preventDefault();
                }
                $form.find('.form-group').removeClass('has-error');

                Settings.save(plugin.name, $form, function() {
                    util.toggleVertical($form.find('.import-config'), false, 'down');
                });
            },

            start: function(e) {
                actions.saveSettings();
                if (start()) {
                    $wrapper.find('#import-start').prop('disabled', true).addClass('disabled');
                    $wrapper.find('.import-logs').empty();
                }
            },

            downloadUsersCsv: function(e) {
                toggleDownloadBtns(false);
                alertPreparingDownload();
                saveConfig().done(function() {
                    canDownload().done(function (data) {
                        if (data && data.candownload) {
                            $.get(plugin.apiHost + '/download/users.csv')
                                .done(function (data) {
                                    app.alertError('Something went wrong :(');
                                    download('users.csv', data);
                                })
                                .fail(function () {
                                })
                                .always(function () {
                                    toggleDownloadBtns(true);
                                });
                        } else {
                            app.alertError('Cannot download file at the moment', 1000);
                        }
                    });
                });
            },

            downloadUsersJson: function(e) {
                toggleDownloadBtns(false);
                alertPreparingDownload();
                saveConfig().done(function() {
                    canDownload().done(function (data) {
                        if (data && data.candownload) {
                            $.get(plugin.apiHost + '/download/users.json')
                                .done(function (data) {
                                    download('users.json', data);
                                })
                                .fail(function () {
                                    app.alertError('Something went wrong :(');
                                })
                                .always(function () {
                                    toggleDownloadBtns(true);
                                });
                        } else {
                            app.alertError('Cannot download file at the moment', 1000);
                        }
                    });
                });
            },

            downloadRedirectionJson: function(e) {
                toggleDownloadBtns(false);
                alertPreparingDownload();
                saveConfig().done(function() {
                    canDownload().done(function (data) {
                        if (data && data.candownload) {
                            $.get(plugin.apiHost + '/download/redirect.json')
                                .done(function (data) {
                                    download('redirect.map.json', data);
                                })
                                .fail(function () {
                                    app.alertError('Something went wrong :(');
                                })
                                .always(function () {
                                    toggleDownloadBtns(true);
                                });
                        } else {
                            app.alertError('Cannot download file at the moment', 1000);
                        }
                    });
                });
            },

            toggleVerboseLogs: function(e) {
                var verbose = $('#importer-log-control-verbose').is(':checked');
                if (verbose) {
                    $('.import-log-info').removeClass('hidden');
                } else {
                    $('.import-log-info').addClass('hidden');
                }
            }
        };

        var download = function(filename, text) {
            var pom = document.createElement('a');
            pom.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
            pom.setAttribute('download', filename);
            pom.click();
        };

        var alertPreparingDownload = function() {
            app.alert({
                message: 'Preparing file, please be patient',
                timeout: 1000
            });
        };

        var toggleLogBtns = function(bool) {
            var serverBtn = $wrapper.find('#importer-log-control-server');
            var clientBtn = $wrapper.find('#importer-log-control-client');
            var verboseBtn = $wrapper.find('#importer-log-control-verbose');

            util.toggleAvailable(serverBtn, bool);
            util.toggleAvailable(clientBtn, bool);
            // util.toggleAvailable(verboseBtn, bool);
        };


        var toggleDownloadBtns = function(bool) {
            var usersCsvBtn = $wrapper.find('#download-users-csv');
            var usersJsonBtn = $wrapper.find('#download-users-json');
            var redirectionJsonBtn = $wrapper.find('#download-redirection-json');

            util.toggleAvailable(usersCsvBtn, bool);
            util.toggleAvailable(usersJsonBtn, bool);
            util.toggleAvailable(redirectionJsonBtn, bool);
        };

        var convert = plugin.convert = function(content) {
            return $.ajax({
                type: 'post',
                data: {
                    _csrf: $('#csrf_token').val(),
                    content: content,
                    config: gatherConfigs()
                },
                url: plugin.apiHost + '/convert',
                cache: false
            });
        };

        var fn = plugin.fn = function(fn, args) {
            return $.ajax({
                type: 'post',
                data: {
                    _csrf: $('#csrf_token').val(),
                    fn: fn,
                    args: args
                },
                url: plugin.apiHost + '/fn',
                cache: false
            });
        };

        var start = plugin.start = function() {
            var configs = gatherConfigs();
            if (configs) {
                fn('start', [configs]);
                return true;
            } else {
                return false;
            }
        };

        var saveConfig = plugin.saveConfig = function() {
            return fn('config', [gatherConfigs(true)]);
        };

        var startExport = plugin.startExport = function() {
            var configs = gatherConfigs();
            if (configs) {
                return fn('startExport', [configs]);
            }
        };

        var startImport = plugin.startImport = function() {
            var configs = gatherConfigs();
            if (configs) {
                return fn('startImport', [configs]);
            }
        };

        var getState = plugin.getState = function() {
            return $.get(plugin.apiHost + '/state');
        };

        var canDownload = plugin.canDownload = function() {
            return $.get(plugin.apiHost + '/candownload')
                .done(function(data) {
                    var serverCan = !!(data && data.candownload);
                    if (serverCan) {
                        toggleDownloadBtns(true);
                    } else {
                        toggleDownloadBtns(false);
                    }
                })
                .fail(function() {
                    toggleDownloadBtns(false);
                });
        };

        var getLocalStorage = function(key) {
            if (window.localStorage) {
                var data = localStorage.getItem(STORAGE_KEY + '-data'),
                    ttl = localStorage.getItem(STORAGE_KEY + '-ttl'),
                    expired = !ttl || isNaN(ttl) || ttl < (new Date()).getTime();

                if (!expired && (function() { try {data = JSON.parse(data); return true; } catch(e) { return false; } })() ) {
                    return key ? data[key] : data;
                }
            }
        };

        var setLocalStorage = function(data, ttl) {
            ttl = ttl || STORAGE_TTL;
            if(window.localStorage) {
                localStorage.setItem(STORAGE_KEY + '-data', JSON.stringify(data));
                localStorage.setItem(STORAGE_KEY + '-ttl', new Date().getTime() + ttl);
            }
        };

        var findExporters = plugin.findExporters = function() {
            var spinner = $form.find('.exporter-module-spinner').addClass('fa-spin').removeClass('hidden');
            var done = function(exporters) {
                var options = [$('<option />').attr({
                    'value': '',
                    'class': 'exporter-module-option'
                }).text('')];

                $.each(exporters, function(k) {
                    options.push($('<option />').attr({
                        'value': k,
                        'class': 'exporter-module-option'
                    }).text(k));
                });

                $('#exporter-module').empty().append(options);

                var selectedVal = _settings && _settings['exporter-module'] ? _settings['exporter-module'] : $wrapper.find('#exporter-module-input').val();
                if (selectedVal) {
                    $wrapper.find('#exporter-module option[value="' + selectedVal + '"]').prop('selected', true);
                }
            };

            var data = getLocalStorage();
            if (data && data.exporters) {
                done(data.exporters);
                spinner.removeClass('fa-spin').addClass('hidden');
            } else {
                $.get(plugin.apiHost + '/exporters')
                    .done(function(exporters) {
                        var data = $.extend(true, getLocalStorage() || {}, {exporters: exporters});
                        setLocalStorage(data);
                        done(data.exporters);
                    }).
                    fail(function() {
                        app.alertError('Could not detect exporters via the npm registry, please enter one manually');
                    }).
                    always(function() {
                        spinner.removeClass('fa-spin').addClass('hidden');
                    });
            }
        };


        var bindActions = function() {
            $wrapper.find('[data-action]').each(function(i, el) {
                el = $(el);
                var events = el.attr('data-on') || 'click',
                    action = actions[el.attr('data-action')];

                if (action) {
                    el.on(events, action);
                }
            });
        };
        var onControllerState = (function() {
            var container = $wrapper.find('.import-state-container');
            var now = $wrapper.find('.controller-state-now');
            var icon = $wrapper.find('.controller-state-icon');
            var event = $wrapper.find('.controller-state-event');
            var startBtn = $wrapper.find('#import-start');

            return function(state) {
                if (state) {
                    now.text(state.now);
                    icon.removeClass('fa-spinner fa-spin fa-warning');
                    event.html(state.event);

                    if (state.now === 'busy') {
                        icon.addClass('fa-spinner fa-spin');
                        startBtn.prop('disabled', true).addClass('disabled');
                        container.css({color: 'blue'});
                        toggleLogBtns(false);
                        toggleDownloadBtns(false);
                    } else if (state.now === 'errored') {
                        startBtn.prop('disabled', false).removeClass('disabled');
                        icon.addClass('fa-warning');
                        container.css({color: 'red'});
                        toggleLogBtns(true);
                    } else if (state.now === 'idle') {
                        startBtn.prop('disabled', false).removeClass('disabled');
                        container.css({color: 'grey'});
                        canDownload();
                        toggleLogBtns(true);
                    } else {
                        container.css({color: 'grey'});
                    }
                }
            };
        })();


        var logsEl = $wrapper.find('.import-logs');
        var logOptionEl = $('#importer-log-control-client');
        var logVerboseOptionEl = $('#importer-log-control-verbose');
        var line = function(msg, level) {
            if (!logOptionEl.is(':checked')) return;
            msg = typeof msg === 'object' ? JSON.stringify(msg) : msg;

            return $('<p />').text(msg).addClass('import-logs-line import-log '
                + (level ? 'import-log-' + level + ' ': '')
                + (!logVerboseOptionEl.is(':checked') && level === 'info' ? 'hidden' : ''));
        };
        var onLog = function(msg) {
            var l = line(msg, 'info');
            if (l) {
                logsEl.prepend(l);
            }
        };
        var onWarn = function(msg) {
            var l = line(msg, 'warn');
            if (l) {
                logsEl.prepend(l);
            }
        };
        var onSuccess = function(msg) {
            var l = line(msg, 'success');
            if (l) {
                logsEl.prepend(l);
            }
        };
        var onError = function(error) {
            var l = line(error, 'error');
            if (l) {
                logsEl.prepend(l);
            }
            app.alertError(error);
        };

        var gatherConfigs = function(ignoreErrors) {
            var exporter = {
                dbhost: $('#exporter-dbhost').val(),
                dbname: $('#exporter-dbname').val(),
                dbuser: $('#exporter-dbuser').val(),
                dbpass: $('#exporter-dbpass').val(),
                dbport: $('#exporter-dbport').val(),
                tablePrefix: $('#exporter-tablePrefix').val(),
                module: $('#exporter-module-input').val() || $('#exporter-module').val()
            };

            var importer = {
                convert: $('#importer-convert').val(),
                passwordGen: {
                    enabled: $('#importer-passwordGen-enabled').is(':checked'),
                    chars: $('#importer-passwordgen-chars').val(),
                    len: parseInt($('#importer-passwordgen-len').val(), 10)
                },
                autoConfirmEmails: $('#importer-autoconfirm-emails').is('checked'),
                userReputationMultiplier: parseInt($('#importer-user-reputation-multiplier').val(), 10),

                categoriesTextColors: (($('#importer-categories-text-colors').val() || '')).replace(/ /g,'').split(','),
                categoriesBgColors: (($('#importer-categories-bg-colors').val() || '')).replace(/ /g,'').split(','),
                categoriesIcons: (($('#importer-categories-icons').val() || '')).replace(/ /g,'').split(',')
            };

            if (!exporter.module && !ignoreErrors) {
                app.alertError('You must select an Exporter module or enter one');
                return null;
            }

            return {
                exporter: exporter,
                importer: importer,
                log: {
                    client: $wrapper.find('#importer-log-control-client').is(':checked'),
                    verbose: $wrapper.find('#importer-log-control-verbose').is(':checked'),
                    server: $wrapper.find('#importer-log-control-server').is(':checked')
                },
                redirectionTemplates: {
                    users: {
                        oldPath: $('#redirection-templates-users-oldpath').val(),
                        newPath: $('#redirection-templates-users-newpath').val()
                    },
                    categories: {
                        oldPath: $('#redirection-templates-categories-oldpath').val(),
                        newPath: $('#redirection-templates-categories-newpath').val()
                    },
                    topics: {
                        oldPath: $('#redirection-templates-topics-oldpath').val(),
                        newPath: $('#redirection-templates-topics-newpath').val()
                    },
                    posts: {
                        oldPath: $('#redirection-templates-posts-oldpath').val(),
                        newPath: $('#redirection-templates-posts-newpath').val()
                    }
                }
            };
        };

        bindActions();

        Settings.load(plugin.name, $form, function(err, data) {
            _settings = data;

            socket.on('controller.state', onControllerState);

            socket.on('exporter.log', onLog);
            socket.on('exporter.warn', onWarn);
            socket.on('exporter.error', onError);

            socket.on('importer.log', onLog);
            socket.on('importer.warn', onWarn);
            socket.on('importer.error', onError);
            socket.on('importer.success', onSuccess);

            socket.on('importer.complete', function() {
                setTimeout(canDownload, 1500);
            });

            findExporters();
            canDownload();

            getState().done(function() {
                setTimeout(function() {
                    util.toggleVertical($form.find('.import-config'), false, 'down');
                }, 500);
                onControllerState(data);
            });
        });
    });
})(this);
