(function(scope) {
    require(['settings'], function(Settings) {

        scope.plugins = scope.plugins || {};

        var PLUGIN_NAME = 'import';

        plugins[PLUGIN_NAME] = plugins[PLUGIN_NAME] || {};

        var plugin = plugins[PLUGIN_NAME];
        plugin.name = PLUGIN_NAME;
        plugin.apiHost = '/api/admin/plugins/' + PLUGIN_NAME;

        var $wrapper = $('.' + plugin.name + '-wrapper');
        var $form = $('.' + plugin.name + '-settings');

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

            toggleVisible: function($el) {
                if ($el.is(':visible')) {
                    $el.hide().addClass('hidden');
                } else {
                    $el.show().removeClass('hidden');
                }
            },

            toggleAvailable: function($el) {
                if ($el.prop('disabled')) {
                    $el.prop('disabled', false);
                } else {
                    $el.prop('disabled', true);
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
                $wrapper.find('#import-start').prop('disabled', true).addClass('disabled');
                $wrapper.find('.import-logs').empty();
                actions.saveSettings();
                start();
            }
        };

        var fn = plugin.fn = function(fn, args) {
            return $.ajax({
                type: 'post',
                data: {
                    _csrf: $('#csrf_token').val(),
                    fn: fn,
                    args: args
                },
                url: plugin.apiHost + '/fn'
            });
        };

        var start = plugin.start = function() {
            var configs = gatherConfigs();
            if (configs) {
                return fn('start', [configs]);
            }
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

        var findExporters = plugin.findExporters = function() {
            var spinner = $form.find('.exporter-module-spinner').addClass('fa-spin').removeClass('hidden');
            return $.get(plugin.apiHost + '/xxxx---exporters').always(function(data) {
                var options = [$('<option />').attr({
                    'value': '',
                    'class': 'exporter-module-option'
                }).text('')];

                $.each(data, function(k, v) {
                    options.push($('<option />').attr({
                        'value': k,
                        'class': 'exporter-module-option'
                    }).text(k));
                });

                $('#exporter-module').empty().append(options);
                spinner.removeClass('fa-spin').addClass('hidden');
            });
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
                    } else if (state.now === 'errored') {
                        startBtn.prop('disabled', false).removeClass('disabled');
                        icon.addClass('fa-warning');
                        container.css({color: 'red'});
                    } else if (state.now === 'idle') {
                        startBtn.prop('disabled', false).removeClass('disabled');
                        container.css({color: 'grey'});
                    } else {
                        container.css({color: 'grey'});
                    }
                }
            };
        })();


        var logsEl = $wrapper.find('.import-logs');
        var line = function(msg, addClasses) {
            msg = typeof msg === 'object' ? JSON.stringify(msg) : msg;
            return $('<p />').text(msg).addClass('import-logs-line ' + (addClasses || ''));
        };
        var onLog = function(msg) {
            logsEl.prepend(line(msg, 'import-log import-log-info'));
        };
        var onWarn = function(msg) {
            logsEl.prepend(line(msg, 'import-log import-log-warn'));
        };
        var onError = function(error) {
            logsEl.prepend(line(error, 'import-log import-log-error'));
            app.alertError(error);
        };

        var gatherConfigs = function() {
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
                redirectionTemplates: {
                    users: {
                        oldPath: $('#importer-templates-users-oldpath').val(),
                        newPath: $('#importer-templates-users-newpath').val()
                    },
                    categories: {
                        oldPath: $('#importer-templates-categories-oldpath').val(),
                        newPath: $('#importer-templates-categories-newpath').val()
                    },
                    topics: {
                        oldPath: $('#importer-templates-topics-oldpath').val(),
                        newPath: $('#importer-templates-topics-newpath').val()
                    },
                    posts: {
                        oldPath: $('#importer-templates-posts-oldpath').val(),
                        newPath: $('#importer-templates-posts-newpath').val()
                    }
                },
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

            if (!exporter.module) {
                app.alertError('You must select an Exporter module or enter one');
                return null;
            }

            return {exporter: exporter, importer: importer};
        };

        bindActions();

        Settings.load(plugin.name, $form, function(data) {

            socket.on('controller.state', onControllerState);

            socket.on('exporter.tail.line', onLog);
            socket.on('importer.tail.error', onError);
            socket.on('exporter.tail.error', onError);

            socket.on('exporter.log', onLog);
            socket.on('exporter.warn', onWarn);
            socket.on('exporter.error', onError);

            socket.on('importer.log', onLog);
            socket.on('importer.warn', onWarn);
            socket.on('importer.error', onError);

            getState().done(onControllerState);
            findExporters();
        });
    });
})(this);