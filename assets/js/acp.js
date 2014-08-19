(function(scope) {

    scope.plugins = scope.plugins || {};

    var PLUGIN_NAME = 'import';
    plugins[PLUGIN_NAME] = plugins[PLUGIN_NAME] || {};

    var plugin = plugins[PLUGIN_NAME];
    plugin.name = PLUGIN_NAME;
    plugin.apiHost = '/api/admin/plugins/' + PLUGIN_NAME;

    // nodebb app alias
    var nbb = window.app;

    // $wrapper
    var $wrapper = $('.' + plugin.name + '-settings');
    var $configForm = $('.' + plugin.name + '-config-wrapper');

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
            e.preventDefault();
            $configForm.find('.form-group').removeClass('has-error');

            var invalidSelector = '', invalidCount = 0;
            $configForm.find('input[type="checkbox"]').each(function(i, checkbox) {
                checkbox = $(checkbox);
                if (checkbox.is(':checked') && !$configForm.find(checkbox.attr('data-target')).val()) {
                    invalidSelector += (!invalidCount++ ? '' : ', ') + checkbox.attr('data-target');
                }
            });

            if (invalidSelector) {
                $wrapper.find(invalidSelector).each(function(i, el) { el = $(el); el.parents('.form-group').addClass('has-error'); });
            } else {
                Settings.save(plugin.name, $wrapper, function() {
                    // socket.emit('admin.restart');
                });
            }
        },

        start: function(e) {
            getState()
                .done(function() {

                })
                .fail(function(err) {
                    nbb.alertError(JSON.stringify(err));
                })
                .complete(function() {

                })
        },

        stop: function(e) {

        }
    };

    var fn = plugin.fn = function(fn, args) {
        $.ajax({
            type: 'post',
            data: args,
            url: plugin.apiHost + '/fn'
        })
    };

    var startExport = plugin.startExport = function(options) {
        return fn('export');
    };

    var startImport = plugin.startImport = function() {
        return fn('import');
    };

    var getState = plugin.getState = function() {
        return $.get(plugin.apiHost + '/state');
    };

    var listenToStateChange = function() {

    };

    var listenToLogsChange = function() {

    };

    var bindActions = function() {
        $wrapper.find('[data-action]').each(function(i, el) {
            el = $(el);
            var events = el.attr('data-on') || 'click',
                action = el.attr('data-action');

            if (action) {
                el.on(events, action);
            }
        });
    };


    require(['settings'], function(Settings) {

        bindActions();

        Settings.load(plugin.name, $configForm, function() {
            listenToStateChange();
            listenToLogsChange();
        });
    });
})(this);