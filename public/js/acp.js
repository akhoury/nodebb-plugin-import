(function(scope) {
	require(['settings', 'csrf'], function(Settings, csrf) {

		scope.plugins = scope.plugins || {};
		var plugin = plugins.import = plugins.import || {};

		plugin.name = 'import';
		plugin.apiHost = RELATIVE_PATH + '/api/admin/plugins/' + 'import';

		var STORAGE_KEY = 'nodebb-plugin-' + plugin.name + ':exporters';
		var STORAGE_TTL = 2 * 24 * 60 * 60 * 1000; // 2 days

		var $wrapper = $('.' + plugin.name + '-wrapper');
		var $form = $('.' + plugin.name + '-settings');
		var utils = plugin.utils;
		var _settings = null;

		var actions = plugin.actions = {

			slideVerticalToggle: function(e) {
				var btn = $(e.target),
						target = $wrapper.find(btn.attr('data-target')),
						visibleDirection = btn.attr('data-target-visible-direction');
				return utils.toggleVertical(target, visibleDirection);
			},

			slideHorizontalToggle: function(e) {
				var btn = $(e.target),
						target = $wrapper.find(btn.attr('data-target'));

				return utils.toggleHorizontal(target);
			},

			visibleToggle: function(e) {
				var btn = $(e.target),
						target = $wrapper.find(btn.attr('data-target'));

				return utils.toggleVisible(target);
			},

			availableToggle: function(e) {
				var btn = $(e.target),
						target = $wrapper.find(btn.attr('data-target'));

				return utils.toggleAvailable(target);
			},

			matchVal: function(e) {
				var btn = $(e.target),
						target = $wrapper.find(btn.attr('data-target'));

				return target.val(btn.val());
			},

			saveSettings: function(e) {
				if (e) {
					e.preventDefault();
				}
				$form.find('.form-group').removeClass('has-error');

				Settings.save(plugin.name, $form, function() {
					utils.toggleVertical($form.find('.import-config'), false, 'down');
				});
			},

			start: function(e) {
				actions.saveSettings();
				if (start()) {
					$wrapper.find('#import-start').prop('disabled', true).addClass('disabled');
					$wrapper.find('#import-resume').prop('disabled', true).addClass('disabled');
					$wrapper.find('.import-logs').empty();
				}
			},

			resume: function(e) {
				actions.saveSettings();
				if (resume()) {
					$wrapper.find('#import-start').prop('disabled', true).addClass('disabled');
					$wrapper.find('#import-resume').prop('disabled', true).addClass('disabled');
					$wrapper.find('.import-logs').empty();
				}
			},


			downloadUsersCsv: function(e) {
				togglePostImportTools(false);

				app.alert({
					message: 'Preparing users.csv, please be patient',
					timeout: 1000
				});

				saveConfig().done(function() {
					postImportToolsAvailable().done(function (data) {
						if (data && data.available) {
							$.get(plugin.apiHost + '/download/users.csv')
									.fail(function () {
										app.alertError('Something went wrong :(');
									})
						} else {
							app.alertError('Cannot download file at the moment', 1000);
						}
					});
				});
			},

			downloadUsersJson: function(e) {
				togglePostImportTools(false);

				app.alert({
					message: 'Preparing users.json, please be patient',
					timeout: 1000
				});

				saveConfig().done(function() {
					postImportToolsAvailable().done(function (data) {
						if (data && data.available) {
							$.get(plugin.apiHost + '/download/users.json')
									.fail(function () {
										app.alertError('Something went wrong :(');
									})
						} else {
							app.alertError('Cannot download file at the moment', 1000);
						}
					});
				});
			},

			downloadRedirectionJson: function(e) {
				togglePostImportTools(false);
				app.alert({
					message: 'Preparing redirect.map.json, please be patient',
					timeout: 1000
				});
				saveConfig().done(function() {
					postImportToolsAvailable().done(function (data) {
						if (data && data.available) {
							$.get(plugin.apiHost + '/download/redirect.json')
									.fail(function () {
										app.alertError('Something went wrong :(');
									})
						} else {
							app.alertError('Cannot download file at the moment', 1000);
						}
					});
				});
			},

			convertContent: function(e) {
				app.alert({
					message: 'Starting content conversion, please be patient',
					timeout: 1000
				});
				saveConfig().done(function() {
					postImportToolsAvailable().done(function (data) {
						if (data && data.available) {
							$.get(plugin.apiHost + '/convert/all')
									.fail(function () {
										app.alertError('Something went wrong :(');
									})
						} else {
							app.alertError('Cannot download file at the moment', 1000);
						}
					});
				});
			},

			toggleVerboseLogs: function(e) {
				var verbose = $('#log-control-verbose').is(':checked');
				if (verbose) {
					$('.import-log-info').removeClass('hidden');
				} else {
					$('.import-log-info').addClass('hidden');
				}
			},

			deleteExtraFields: function() {
				var sure = confirm("Are you sure you want to delete the added fields? You will not longer be able to use the Post-Import tools, unless you run the import process from the beginning.");
				if (sure) {
					saveConfig().done(function() {
						postImportToolsAvailable().done(function (data) {
							if (data && data.available) {
								$.get(plugin.apiHost + '/deleteExtraFields')
										.fail(function () {
											app.alertError('Something went wrong :(');
										});
							} else {
								app.alertError('Cannot download file at the moment', 1000);
							}
						});
					});
				}
			},

			findExporters: function(e) {
				return plugin.findExporters(e);
			}
		};

		var toggleLogBtns = function(bool) {
			var serverBtn = $wrapper.find('#log-control-server');
			var clientBtn = $wrapper.find('#log-control-client');
			var verboseBtn = $wrapper.find('#log-control-verbose');

			utils.toggleAvailable(serverBtn, bool);
			utils.toggleAvailable(clientBtn, bool);
			// utils.toggleAvailable(verboseBtn, bool);
		};

		var togglePostImportTools = function(bool) {
			$wrapper.find('.import-tools').find('button, input, textarea').each(function(i, el) {
				utils.toggleAvailable($(el), bool);
			});
		};

		var convert = plugin.convert = function(content) {
			return $.ajax({
				type: 'post',
				data: {
					_csrf: csrf.get(),
					content: content,
					config: gatherConfig()
				},
				url: plugin.apiHost + '/convert',
				cache: false
			});
		};

		var start = plugin.start = function() {
			var config = gatherConfig();
			if (config) {
				$.ajax({
					type: 'post',
					data: {
						_csrf: csrf.get(),
						config: config
					},
					url: plugin.apiHost + '/start',
					cache: false
				});
				return true;
			} else {
				return false;
			}
		};

		var resume = plugin.resume = function() {
			var config = gatherConfig();
			if (config) {
				$.ajax({
					type: 'post',
					data: {
						_csrf: csrf.get(),
						config: config
					},
					url: plugin.apiHost + '/resume',
					cache: false
				});
				return true;
			} else {
				return false;
			}
		};

		var saveConfig = plugin.saveConfig = function() {
			utils.toggleVertical($form.find('.import-config'), false, 'down');
			utils.toggleVertical($form.find('.import-tools'), false, 'down');

			return $.ajax({
				type: 'post',
				data: {
					_csrf: csrf.get(),
					config: gatherConfig(true)
				},
				url: plugin.apiHost + '/config',
				cache: false
			});
		};


		var getState = plugin.getState = function() {
			return $.get(plugin.apiHost + '/state');
		};

		var postImportToolsAvailable = plugin.postImportToolsAvailable = function() {
			return $.get(plugin.apiHost + '/postImportTools')
					.done(function(data) {
						if (data && data.available) {
							togglePostImportTools(true);
						} else {
							togglePostImportTools(false);
						}
					})
					.fail(function() {
						togglePostImportTools(false);
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

		var findExporters = plugin.findExporters = function(e) {

			var btn = $form.find('.exporter-module-refresh').addClass('hidden').hide();
			var spinner = $form.find('.exporter-module-spinner').addClass('fa-spin').removeClass('hidden').show();

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
				btn.removeClass('hidden').show();
				spinner.removeClass('fa-spin').addClass('hidden').hide();
				app.alert({
					title: '[[global:alert.info]]',
					message: 'Exporters list Loaded from localStorage to avoid an expensive API call to NPM',
					type: 'info',
					timeout: timeout ? timeout : 5000
				});
			} else {
				$.get(plugin.apiHost + '/exporters')
						.done(function(exporters) {
							var data = $.extend(true, getLocalStorage() || {}, {exporters: exporters});
							setLocalStorage(data);
							done(data.exporters);
						}).
						fail(function() {
							app.alertError('Could not detect exporters via the npm registry, loading only the pre-defined ones from package.json');
						}).
						always(function() {
							btn.removeClass('hidden').show();
							spinner.removeClass('fa-spin').addClass('hidden').hide();
						});
			}
		};

		var checkDirty = function() {
			$.get(plugin.apiHost + '/isDirty')
					.done(function(data) {
						if (data && data.isDirty) {
							utils.toggleVisible($wrapper.find('#import-resume'), true);
						} else {
							utils.toggleVisible($wrapper.find('#import-resume'), false);
						}
					})
					.fail(function() {
						utils.toggleVisible($wrapper.find('#import-resume'), false);
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
			var resumeBtn = $wrapper.find('#import-resume');

			return function(state) {
				if (state) {
					now.text(state.now);
					icon.removeClass('fa-spinner fa-spin fa-warning');
					event.html(state.event);

					if (state.now === 'busy') {
						icon.addClass('fa-spinner fa-spin');
						utils.toggleAvailable(startBtn, false);
						utils.toggleAvailable(resumeBtn, false);
						container.css({color: 'blue'});
						toggleLogBtns(false);
						togglePostImportTools(false);
					} else if (state.now === 'errored') {
						utils.toggleAvailable(startBtn, true);
						utils.toggleAvailable(resumeBtn, true);
						icon.addClass('fa-warning');
						container.css({color: 'red'});
						toggleLogBtns(true);
					} else if (state.now === 'idle') {
						utils.toggleAvailable(startBtn, true);
						utils.toggleAvailable(resumeBtn, true);
						container.css({color: 'grey'});
						postImportToolsAvailable();
						toggleLogBtns(true);
					} else {
						container.css({color: 'grey'});
					}

					if (state.details) {
						console.warn(state.details);
						app.alert({
							message: JSON.stringify(state.details),
							timeout: 2000
						})
					}
				}
			};
		})();


		var logsEl = $wrapper.find('.import-logs');
		var logOptionEl = $('#log-control-client');
		var logVerboseOptionEl = $('#log-control-verbose');
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

		var $progress = $wrapper.find('.controller-progress');
		var $progressPercentage = $wrapper.find('.controller-progress-percentage');
		var $progressPhase = $wrapper.find('.controller-progress-phase');

		var onPhase = function(data) {
			onSuccess('current phase: ' + data.phase);
			$progressPhase.text(data.phase);
		};

		var onProgress = function(data) {
			$progressPercentage.text((data.percentage || 0).toFixed(2));
		};

		var onDownload = function(data) {
			if (data) {
				var pom = document.createElement('a');
				pom.setAttribute('download', data.filename || 'file');

				if (data.content) {
					pom.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(data.content || ''));
				} else if (data.fileurl) {
					pom.setAttribute('href', data.fileurl);
				}

				pom.click();
			}
		};

		gatherConfig = function(ignoreErrors) {
			var exporter = {
				dbhost: $('#exporter-dbhost').val(),
				dbname: $('#exporter-dbname').val(),
				dbuser: $('#exporter-dbuser').val(),
				dbpass: $('#exporter-dbpass').val(),
				dbport: $('#exporter-dbport').val(),
				tablePrefix: $('#exporter-tablePrefix').val(),
				module: $('#exporter-module-input').val() || $('#exporter-module').val(),
				skipInstall:  $('#exporter-module-skip-install').is(':checked'),
				custom: $('#exporter-custom').val()
			};

			var importer = {
				passwordGen: {
					enabled: $('#importer-passwordgen-enabled').is(':checked'),
					chars: $('#importer-passwordgen-chars').val(),
					len: parseInt($('#importer-passwordgen-len').val(), 10)
				},
				adminTakeOwnership: {
					enable: $wrapper.find('#importer-admin-take-ownership').is(':checked'),
					_username: $wrapper.find('#importer-admin-take-ownership-username').val(),
					_uid: $wrapper.find('#importer-admin-take-ownership-uid').val()
				},
				autoConfirmEmails: $('#importer-autoconfirm-emails').is('checked'),
				userReputationMultiplier: parseInt($('#importer-user-reputation-multiplier').val(), 10),

				categoriesTextColors: (($('#importer-categories-text-colors').val() || '')).replace(/ /g,'').split(','),
				categoriesBgColors: (($('#importer-categories-bg-colors').val() || '')).replace(/ /g,'').split(','),
				categoriesIcons: (($('#importer-categories-icons').val() || '')).replace(/ /g,'').split(',')
			};

			if (!ignoreErrors) {
				if (!exporter.module) {
					app.alertError('You must select an Exporter module or enter one');
					return null;
				}

				if (importer.adminTakeOwnership.enable && !importer.adminTakeOwnership._uid && !importer.adminTakeOwnership._username) {
					app.alertError('You must enter the old uid or username that you want to take posts ownerships from');
					return null;
				}
			}

			return {
				exporter: exporter,
				importer: importer,
				log: {
					client: $wrapper.find('#log-control-client').is(':checked'),
					server: $wrapper.find('#log-control-server').is(':checked'),
					verbose: $wrapper.find('#log-control-verbose').is(':checked')
				},
				redirectionTemplates: {
					users: {
						oldPath: $wrapper.find('#redirection-templates-users-oldpath').val(),
						newPath: $wrapper.find('#redirection-templates-users-newpath').val()
					},
					categories: {
						oldPath: $wrapper.find('#redirection-templates-categories-oldpath').val(),
						newPath: $wrapper.find('#redirection-templates-categories-newpath').val()
					},
					topics: {
						oldPath: $wrapper.find('#redirection-templates-topics-oldpath').val(),
						newPath: $wrapper.find('#redirection-templates-topics-newpath').val()
					},
					posts: {
						oldPath: $wrapper.find('#redirection-templates-posts-oldpath').val(),
						newPath: $wrapper.find('#redirection-templates-posts-newpath').val()
					}
				},
				contentConvert: {
					parseBefore: {
						enabled: $wrapper.find('#content-convert-use-parse-before').is(':checked'),
						js: $wrapper.find('#content-convert-parse-before').val()
					},
					mainConvert: $('#content-convert-main').val(),
					parseAfter: {
						enabled: $wrapper.find('#content-convert-use-parse-after').is(':checked'),
						js: $wrapper.find('#content-convert-parse-after').val()
					},
					convertRecords: {
						usersSignatures: $wrapper.find('#content-convert-users-signatures').is(':checked'),
						messages: $wrapper.find('#content-convert-messages').is(':checked'),
						groups: $wrapper.find('#content-convert-groups').is(':checked'),
						categoriesNames: $wrapper.find('#content-convert-categories-names').is(':checked'),
						categoriesDescriptions: $wrapper.find('#content-convert-categories-descriptions').is(':checked'),
						topicsTitle: $wrapper.find('#content-convert-topics-titles').is(':checked'),
						topicsContent: $wrapper.find('#content-convert-topics-content').is(':checked'),
						postsContent: $wrapper.find('#content-convert-posts-content').is(':checked')
					}
				}
			};
		};

		bindActions();

		Settings.load(plugin.name, $form, function(err, data) {

			var onValues = function (err, values) {
				if (!err) {
					values = values || {};
					Object.keys(values).forEach(function(id) {
						var val = values[id];
						if ( val === 'on' || val[id] === 'off') {
							val = val === 'on';
							var checkbox = $wrapper.find('#' + id);
							var on = checkbox.attr('data-on');
							var action = checkbox.attr('data-action');

							checkbox.prop('checked', val);
							if (on && typeof actions[action] === 'function') {
								checkbox.trigger(on);
							}
						} else if (val && typeof val === 'object') {
							var input = $wrapper.find('#' + id);
							input.val(JSON.stringify(val));
						}
					});
				} else {
					console.log('[settings] Unable to load settings for hash: ', data);
				}
			};


			if (data) {
				onValues(err, data);
			} else {
				socket.emit('admin.settings.get', {
					hash: 'import'
				}, onValues);
			}

			socket.on('connect', function() {
				onControllerState({
					now: 'idle',
					event: 'server.connected'
				});
				setTimeout(function() {
					getState().done(onControllerState);
				}, 1000);
			});

			socket.on('event:disconnect', function() {
				onError('Server disconnected :(');
				onControllerState({
					now: 'errored',
					event: 'server.disco, disconnected'
				});

			});

			socket.on('controller.state', onControllerState);

			socket.on('exporter.log', onLog);
			socket.on('exporter.warn', onWarn);
			socket.on('exporter.error', onError);

			socket.on('importer.log', onLog);
			socket.on('importer.warn', onWarn);
			socket.on('importer.error', onError);
			socket.on('importer.success', onSuccess);

			socket.on('controller.phase', onPhase);
			socket.on('controller.progress', onProgress);
			socket.on('importer.phase', onPhase);
			socket.on('importer.progress', onProgress);

			socket.on('importer.complete', function() {
				setTimeout(postImportToolsAvailable, 1500);
			});

			socket.on('controller.download', onDownload);

			socket.on('convert.done', function() {
				app.alert({
					message: 'Content convert done',
					timeout: 1500
				});
			});

			socket.on('redirectionTemplates.done', function() {
				app.alert({
					message: 'Redirection map done',
					timeout: 1500
				});
			});

			socket.on('delete.done', function() {
				app.alert({
					message: 'Deletion done',
					timeout: 1500
				});
				postImportToolsAvailable();
			});

			postImportToolsAvailable();
			checkDirty();

			getState().done(function() {
				setTimeout(function() {
					utils.toggleVertical($form.find('.import-config'), false, 'down');
					utils.toggleVertical($form.find('.import-tools'), false, 'down');
				}, 500);
				onControllerState(data);
			});
		});
	});
})(this);
