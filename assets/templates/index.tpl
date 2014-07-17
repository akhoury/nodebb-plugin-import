
<script>
	window.plugins = window.plugins || {};
	window.plugins['{json.nbbId}'] = window.plugins['{json.nbbId}'] || {};
	window.plugins['{json.nbbId}'].util = {
		customName: function() {
			options = options || {};
			options.delim = options.delim || '-';
			options.prefix = options.prefix || ('ramp' + options.delim + 'slider');

			var parts = (name || '')
				.replace(/\s{2,}/g, ' ')
				.split(' ');

			return $.map(parts, function(v, i) {
				return options.prefix + (v ? options.delim + v : '');
			}).join(' ');
		},
		cssName: function(name) {
			return this.customName(name || '{json.nbbId}', {delim: '-'});
		},
		eventName: function(name) {
			return this.customName(name || '{json.nbbId}', {delim: '.'});
		},

	    // Safely get/set chained properties on an object
		// set example: util.props(A, 'a.b.c.d', 10) // sets A to {a: {b: {c: {d: 10}}}}, and returns 10
		// get example: util.props(A, 'a.b.c') // returns {d: 10}
		// get example: util.props(A, 'a.b.c.foo.bar') // returns undefined without throwing a TypeError
		// credits to github.com/gkindel
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
		}
	};
</script>

<style>
	.{json.nbbId}-overflow-hidden {
		overflow: hidden;
	}
	.{json.nbbId}-hand {
		cursor: hand;
		cursor: pointer;
	}
</style>

<h1><i class="fa {json.faIcon}"></i> {json.name}</h1>

<form role="form" class="{json.nbbId}-settings">
	<fieldset>

		<div class="col-sm-12 {json.nbbId}-config-wrapper">
			<div class="col-sm-12 {json.nbbId}-config hidden">
				<div class="form-group">
					<label for="log">Log level</label>
					<select class="form-control" id="log" name="log">
						<option val="debug">debug</option>
						<option val="error">error</option>
						<option val="warn">warn</option>
						<option val="info">info</option>
					</select>
				</div>

				<button class="btn btn-lg btn-primary" id="save" type="button">Save Settings</button>
			</div>
			<div class="text-center">
				<i data-actions="click:slideToggle" data-target=".{json.nbbId}-config" class="fa fa-bars {json.nbbId}-hand"></i>
			</div>
		</div>

        <hr />

	</fieldset>
</form>


<script type="text/javascript">
	require(['settings'], function(Settings) {

		var nbbId = '{json.nbbId}',
		    klass = nbbId + '-settings',
		    wrapper = $('.' + klass),
		    actionableElements = wrapper.find('[data-actions]'),

		    actions = {
		    	slideVerticalToggle: function(e) {
					var btn = $(e.target),
						target = wrapper.find(btn.attr('data-target')),
						//// slideUp/Down, left/right

					if (target.is(':visible')) {
						target.slideUp();
					} else {
						target.show().removeClass('hidden');
					}
		    	},
		    	visibleToggle: function(e) {
					var btn = $(e.target),
						target = wrapper.find(btn.attr('data-target'));
					if (target.is(':visible')) {
						target.hide().addClass('hidden');
					} else {
						target.show().removeClass('hidden');
					}
		    	},
		    	availableToggle: function(e) {
					var btn = $(e.target),
						target = wrapper.find(btn.attr('data-target'));
					if (target.prop('disabled')) {
						target.prop('disabled', false);
					} else {
						target.prop('disabled', true);
					}
		    	},
		    	saveSettings: function(e) {
					e.preventDefault();
					wrapper.find('.form-group').removeClass('has-error');

					var invalidSelector = '', invalidCount = 0;
					wrapper.find('input[type="checkbox"]').each(function(i, checkbox) {
						checkbox = $(checkbox);
						if (checkbox.is(':checked') && !wrapper.find(checkbox.attr('data-toggle-target')).val()) {
							invalidSelector += (!invalidCount++ ? '' : ', ') + checkbox.attr('data-toggle-target');
						}
					});

					if (invalidSelector) {
						wrapper.find(invalidSelector).each(function(i, el) { el = $(el); el.parents('.form-group').addClass('has-error'); });
					} else {
						Settings.save(nbbId, wrapper, function() {
							// socket.emit('admin.restart');
						});
					}
		    	},
		    	startImport: function(e) {

		    	}
		    };

		Settings.load(nbbId, wrapper, function() {
			// on load
            wrapper.find('input[type="checkbox"]').trigger('change');
		});
	});
</script>