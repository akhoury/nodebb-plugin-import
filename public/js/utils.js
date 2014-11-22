(function() {
	var utils = {};
	if ('undefined' === typeof window) {
		var path = require('path');
		utils = require(path.join(__dirname + '/../../../../public/src/utils.js'));
	} else {

		utils.printStack = utils.printStack || function() {
			var e = new Error('dummy');
			var stack = e.stack.replace(/^[^\(]+?[\n$]/gm, '')
					.replace(/^\s+at\s+/gm, '')
					.replace(/^Object.<anonymous>\s*\(/gm, '{anonymous}()@')
					.split('\n');
			console.log(stack);
		};

		utils.toggleVisible = utils.toggleVisible || function($el, toggle) {
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
		};

		utils.toggleAvailable = utils.toggleAvailable || function($el, toggle) {
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
		};

		utils.toggleHorizontal = utils.toggleHorizontal || function($el, toggle) {
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
		};

		utils.toggleVertical = utils.toggleVertical || function($el, toggle, visibleDirection) {
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
		};

		utils.customName = function(options) {
			options = options || {};
			options.delim = options.delim || '-';
			options.prefix = options.prefix || 'import';

			var parts = (name || '')
					.replace(/\s{2,}/g, ' ')
					.split(' ');

			return $.map(parts, function(v, i) {
				return options.prefix + (v ? options.delim + v : '');
			}).join(' ');
		};

		utils.cssName = function(name) {
			return utils.customName(name);
		};

		utils.eventName = function(name) {
			return utils.customName(name, {delim: '.'});
		};
	}


	// github.com/gkindel
	utils.props = function(obj, props, value) {
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
	};

	utils.recursiveIteration = utils.recursiveIteration || function(object) {
		for (var property in object) {
			if (object.hasOwnProperty(property)) {
				if (typeof object[property] == "object"){
					utils.recursiveIteration(object[property]);
				}else{
					object[property] = utils.resolveType(object[property]);
				}
			}
		}
	};

	utils.resolveType = utils.resolveType || function(str) {
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
			if (str === 'undefined')
				return undefined;
			if (str === 'null')
				return null;

			try {
				str = JSON.parse(str);
			} catch (e) {}

			return str;
		}
	};

	utils.buildFn = utils.buildFn || function(js) {
		var fn, noop = function(s) {return s;};
		try {
			// Function.apply(context, args (csv string), function-code (string))
			fn = Function.apply(null, ['content', (js || '') + '\nreturn content;' ]);

		} catch (e) {
			console.warn(js + '\nhas invalid javascript, ignoring...', e);
			fn = noop;
		}
		// let's see if it doesn't crash
		try {
			fn("test");
		} catch (e) {
			// if it did, then too bad, you had a good run, but no thanks
			console.warn(js + '\nhas a runtime error, ignoring...', e);
			fn = noop;
		}

		return fn;
	};

	utils.truncate = utils.truncate || function(str, len) {
		if (typeof str != 'string') return str;
		len = utils.isNumber(len) && len > 3 ? len : 20;
		return str.length <= len ? str : str.substr(0, len - 3) + '...';
	};
	utils.truncateStr = utils.truncateStr || utils.truncate;

	utils.isNumber = utils.isNumber || function(n) {
		return !isNaN(parseFloat(n)) && isFinite(n);
	};

	if ('undefined' === typeof window) {
		module.exports = utils;
	} else {
		window.plugins = window.plugins || {};
		plugins.import = plugins.import || {};
		plugins.import.utils = utils;
	}

})();
