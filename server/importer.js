var async = require('async'),
		EventEmitter2 = require('eventemitter2').EventEmitter2,
		_ = require('underscore'),
		nodeExtend = require('node.extend'),
		fs = require('fs-extra'),
		path = require('path'),
		nconf = require('nconf'),

		utils = require('../public/js/utils.js'),
		Data = require('./data.js'),

		MAX_INT = -1 >>> 1,

		Groups = require('../../../src/groups.js'),
		Favourites = require('../../../src/favourites.js'),
		privileges = require('../../../src/privileges.js'),
		Meta = require('../../../src/meta.js'),
		User = require('../../../src/user.js'),
		Messaging = require('../../../src/messaging.js'),
		File = require('../../../src/file.js'),
		Topics = require('../../../src/topics.js'),
		Posts = require('../../../src/posts.js'),
		Categories = require('../../../src/categories.js'),
		db = module.parent.require('../../../src/database.js'),

		IMPORT_BATCH_SIZE = 10,
		FLUSH_BATCH_SIZE = 10,

//todo use the real one
		LOGGEDIN_UID = 1,

		logPrefix = '[nodebb-plugin-import]',

		BACKUP_CONFIG_FILE = path.join(__dirname, '/tmp/importer.nbb.backedConfig.json'),

		DIRTY_GROUPS_FILE = path.join(__dirname, '/tmp/importer.dirty.groups'),
		DIRTY_USERS_FILE = path.join(__dirname, '/tmp/importer.dirty.users'),
		DIRTY_MESSAGES_FILE = path.join(__dirname, '/tmp/importer.dirty.messages'),
		DIRTY_CATEGORIES_FILE = path.join(__dirname, '/tmp/importer.dirty.categories'),
		DIRTY_TOPICS_FILE = path.join(__dirname, '/tmp/importer.dirty.topics'),
		DIRTY_POSTS_FILE = path.join(__dirname, '/tmp/importer.dirty.posts'),
		DIRTY_VOTES_FILE = path.join(__dirname, '/tmp/importer.dirty.votes'),
		DIRTY_BOOKMARKS_FILE = path.join(__dirname, '/tmp/importer.dirty.bookmarks'),

		areGroupsDirty,
		areUsersDirty,
		areMessagesDirty,
		areCategoriesDirty,
		areTopicsDirty,
		arePostsDirty,
		areVotesDirty,
		areBookmarksDirty,

		isAnythingDirty,

		alreadyImportedAllGroups = false,
		alreadyImportedAllUsers = false,
		alreadyImportedAllMessages = false,
		alreadyImportedAllCategories = false,
		alreadyImportedAllTopics = false,
		alreadyImportedAllPosts = false,
		alreadyImportedAllVotes = false,
		alreadyImportedAllBookmarks = false,

		flushed = false,

		defaults = {
			log: true,
			passwordGen: {
				enabled: false,
				chars: '{}.-_=+qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM1234567890',
				len: 13
			},
			categoriesTextColors: ['#FFFFFF'],
			categoriesBgColors: ['#AB4642', '#DC9656', '#F7CA88', '#A1B56C', '#86C1B9', '#7CAFC2', '#BA8BAF', '#A16946'],
			categoriesIcons: ['fa-comment'],
			autoConfirmEmails: true,
			userReputationMultiplier: 1,

			adminTakeOwnership: {
				enable: false,
				_username: null,
				_uid: null
			},

			nbbTmpConfig: {
				maximumPostLength: MAX_INT,
				maximumChatMessageLength: MAX_INT,
				maximumTitleLength: MAX_INT,
				maximumUsernameLength: MAX_INT,
				postDelay: 0,
				initialPostDelay: 0,
				newbiePostDelay: 0,
				minimumPostLength: 0,
				minimumPasswordLength: 0,
				minimumTitleLength: 0,
				requireEmailConfirmation: 0,
				trackIpPerPost: 1,
				"newbiePostDelayThreshold": 0,
				"minimumTagsPerTopic": 0,
				"maximumTagsPerTopic": MAX_INT,
				"allowGuestSearching": 1,
				"allowTopicsThumbnail": 1,
				"registrationType": "normal",
				"allowLocalLogin": 1,
				"allowAccountDelete": 1,
				"allowFileUploads": 1,
				"allowUserHomePage": 1,
				"maximumFileSize": MAX_INT,
				"minimumUsernameLength": 1,
				"maximumSignatureLength": MAX_INT,
				"maximumAboutMeLength": MAX_INT,
				"maximumProfileImageSize": MAX_INT,
				"maximumCoverImageSize": MAX_INT,
				"profileImageDimension": 128,
				"profile:allowProfileImageUploads": 1,
			}
		};

(function(Importer) {

	var coolDownFn = function (timeout) {
		return function (next) {
			timeout = timeout || 5000;
			Importer.log('cooling down for ' + timeout/1000 + ' seconds');
			setTimeout(next, timeout);
		};
	};

	var groupsJoin = function (groupName, uid, timestamp, callback) {
		Groups.join(groupName, uid, function(err, ret) {
			if (err) {
				return callback(err);
			}
			db.sortedSetAdd('group:' + groupName + ':members', timestamp, uid, function (err) {
				if (err) {
					return callback(err);
				}
				Importer.log(uid, 'joined group:', groupName);
				callback(null, ret);
			});
		});
	};

	Importer._dispatcher = new EventEmitter2({
		wildcard: true
	});

	Importer.init = function(exporter, config, callback) {
		Importer.setup(exporter, config, callback);
	};

	Importer.setup = function(exporter, config, callback) {
		Importer.exporter = exporter;

		Importer._config = nodeExtend(true, {}, defaults, config && config.importer ? config.importer : config || {});

		//todo I don't like this
		Importer._config.serverLog = !!config.log.server;
		Importer._config.clientLog = !!config.log.client;
		Importer._config.verbose = !!config.log.verbose;

		Importer.emit('importer.setup.start');

		flushed = false;

		Importer.emit('importer.setup.done');
		Importer.emit('importer.ready');
		if (_.isFunction(callback)) {
			callback();
		}
	};

	function start (flush, callback) {
		Importer.emit('importer.start');

		var series = [];

		if (flush) {
			series.push(Importer.flushData);
		} else {
			Importer.log('Skipping data flush');
			series.push(makeDirty);
		}
		async.series(series.concat([
			Importer.backupConfig,
			Importer.setTmpConfig,
			Importer.importGroups,
			coolDownFn(5000),
			Importer.importCategories,
			Importer.allowGuestsOnAllCategories,
			Importer.importUsers,
			Importer.importMessages,
			Importer.importTopics,
			Importer.importPosts,
			Importer.importVotes,
			Importer.importBookmarks,
			Importer.fixCategoriesParentsAndAbilities,
			Importer.fixPostsToPids,
			Importer.fixGroupsOwners,
			Importer.relockUnlockedTopics,
			Importer.rebanUnbannedUsers,
			Importer.fixTopicTimestamps,
			Importer.restoreConfig,
			Importer.disallowGuestsWriteOnAllCategories,
			Importer.teardown
		]), callback);
	}

	Importer.start = function(callback) {
		var config = Importer.config();
		start(config.flush, callback);
	};

	Importer.resume = function(callback) {
		Importer.emit('importer.start');
		Importer.emit('importer.resume');

		Importer.isDirty();

		var series = [];
		if (! alreadyImportedAllGroups) {
			series.push(Importer.importGroups);
		} else {
			Importer.warn('alreadyImportedAllGroups=true, skipping importGroups Phase');
		}

		if (! alreadyImportedAllCategories) {
			series.push(Importer.importCategories);
			series.push(Importer.allowGuestsOnAllCategories);
		} else {
			Importer.warn('alreadyImportedAllCategories=true, skipping importCategories Phase');
		}
		if (! alreadyImportedAllUsers) {
			series.push(Importer.importUsers);
		} else {
			Importer.warn('alreadyImportedAllUsers=true, skipping importUsers Phase');
		}
		if (! alreadyImportedAllMessages) {
			series.push(Importer.importMessages);
		} else {
			Importer.warn('alreadyImportedAllMessages=true, skipping importMessages Phase');
		}

		if (! alreadyImportedAllTopics) {
			series.push(Importer.importTopics);
		} else {
			Importer.warn('alreadyImportedAllTopics=true, skipping importTopics Phase');
		}
		if (! alreadyImportedAllPosts) {
			series.push(Importer.importPosts);
		} else {
			Importer.warn('alreadyImportedAllPosts=true, skipping importPosts Phase');
		}

		if (! alreadyImportedAllVotes) {
			series.push(Importer.importVotes);
		} else {
			Importer.warn('alreadyImportedAllVotes=true, skipping importVotes Phase');
		}

		if (! alreadyImportedAllBookmarks) {
			series.push(Importer.importBookmarks);
		} else {
			Importer.warn('alreadyImportedAllVotes=true, skipping importVotes Phase');
		}

		series.concat([
			Importer.fixCategoriesParentsAndAbilities,
			Importer.fixPostsToPids,
			Importer.fixGroupsOwners,
			Importer.relockUnlockedTopics,
			Importer.rebanUnbannedUsers,
			Importer.fixTopicTimestamps,
			Importer.restoreConfig,
			Importer.disallowGuestsWriteOnAllCategories,
			Importer.teardown
		]);

		async.series(series, callback);
	};

	function makeDirty (done) {

		areGroupsDirty = true;
		areUsersDirty = true;
		areMessagesDirty = true;
		areCategoriesDirty = true;
		areTopicsDirty = true;
		arePostsDirty = true;
		areVotesDirty = true;
		areBookmarksDirty = true;
		isAnythingDirty = true;

		alreadyImportedAllGroups = false;
		alreadyImportedAllUsers = false;
		alreadyImportedAllMessages = false;
		alreadyImportedAllCategories = false;
		alreadyImportedAllTopics = false;
		alreadyImportedAllPosts = false;
		alreadyImportedAllVotes = false;
		alreadyImportedAllBookmarks = false;

		flushed = false;

		return _.isFunction(done) ? done(null, true) : true;
	}

	// todo: really? wtf is this logic
	Importer.isDirty = function(done) {

		areGroupsDirty = !! fs.existsSync(DIRTY_GROUPS_FILE);
		areVotesDirty = !! fs.existsSync(DIRTY_VOTES_FILE);
		areUsersDirty = !! fs.existsSync(DIRTY_USERS_FILE);
		areMessagesDirty = !! fs.existsSync(DIRTY_MESSAGES_FILE);
		areCategoriesDirty = !! fs.existsSync(DIRTY_CATEGORIES_FILE);
		areTopicsDirty = !! fs.existsSync(DIRTY_TOPICS_FILE);
		arePostsDirty = !! fs.existsSync(DIRTY_POSTS_FILE);
		areBookmarksDirty = !! fs.existsSync(DIRTY_BOOKMARKS_FILE);

		isAnythingDirty =
				areGroupsDirty
				|| areVotesDirty
				|| areUsersDirty
				|| areCategoriesDirty
				|| areTopicsDirty
				|| arePostsDirty
				|| areMessagesDirty
				|| areBookmarksDirty;

		// order in start() and resume() matters and must be in sync
		if (areGroupsDirty) {
			alreadyImportedAllGroups = false;
			alreadyImportedAllCategories = false;
			alreadyImportedAllUsers = false;
			alreadyImportedAllMessages = false;
			alreadyImportedAllTopics = false;
			alreadyImportedAllPosts = false;
			alreadyImportedAllVotes = false;
			alreadyImportedAllBookmarks = false;
		} else if (areCategoriesDirty) {
			alreadyImportedAllGroups = true;
			alreadyImportedAllCategories = false;
			alreadyImportedAllUsers = false;
			alreadyImportedAllMessages = false;
			alreadyImportedAllTopics = false;
			alreadyImportedAllPosts = false;
			alreadyImportedAllVotes = false;
			alreadyImportedAllBookmarks = false;
		} else if (areUsersDirty) {
			alreadyImportedAllGroups = true;
			alreadyImportedAllCategories = true;
			alreadyImportedAllUsers = false;
			alreadyImportedAllMessages = false;
			alreadyImportedAllTopics = false;
			alreadyImportedAllPosts = false;
			alreadyImportedAllVotes = false;
			alreadyImportedAllBookmarks = false;
		} else if (areMessagesDirty) {
			alreadyImportedAllGroups = true;
			alreadyImportedAllCategories = true;
			alreadyImportedAllUsers = true;
			alreadyImportedAllMessages = false;
			alreadyImportedAllTopics = false;
			alreadyImportedAllPosts = false;
			alreadyImportedAllVotes = false;
			alreadyImportedAllBookmarks = false;
		} else if (areTopicsDirty) {
			alreadyImportedAllGroups = true;
			alreadyImportedAllCategories = true;
			alreadyImportedAllUsers = true;
			alreadyImportedAllMessages = true;
			alreadyImportedAllTopics = false;
			alreadyImportedAllPosts = false;
			alreadyImportedAllVotes = false;
			alreadyImportedAllBookmarks = false;
		} else if (arePostsDirty) {
			alreadyImportedAllGroups = true;
			alreadyImportedAllCategories = true;
			alreadyImportedAllUsers = true;
			alreadyImportedAllMessages = true;
			alreadyImportedAllTopics = true;
			alreadyImportedAllPosts = false;
			alreadyImportedAllVotes = false;
			alreadyImportedAllBookmarks = false;
		} else if (areVotesDirty) {
			alreadyImportedAllGroups = true;
			alreadyImportedAllCategories = true;
			alreadyImportedAllUsers = true;
			alreadyImportedAllMessages = true;
			alreadyImportedAllTopics = true;
			alreadyImportedAllPosts = true;
			alreadyImportedAllVotes = false;
			alreadyImportedAllBookmarks = false;
		} else if (areBookmarksDirty) {
			alreadyImportedAllGroups = true;
			alreadyImportedAllCategories = true;
			alreadyImportedAllUsers = true;
			alreadyImportedAllMessages = true;
			alreadyImportedAllTopics = true;
			alreadyImportedAllPosts = true;
			alreadyImportedAllVotes = true;
			alreadyImportedAllBookmarks = false;
		}

		return _.isFunction(done) ? done(null, isAnythingDirty) : isAnythingDirty;
	};

	Importer.flushData = function(next) {
		async.series([
			function(done){
				Importer.phase('purgeCategories+Topics+Bookmarks+Posts+VotesStart');
				Importer.progress(0, 1);

				// that will delete, categories, topics, topics.bookmarks, posts and posts.votes
				Data.countCategories(function(err, total) {
					var index = 0;
					Data.processCategoriesCidsSet(
							function (err, ids, nextBatch) {
								async.mapLimit(ids, FLUSH_BATCH_SIZE, function(id, cb) {
									Importer.progress(index++, total);
									Categories.purge(id, cb);
								}, nextBatch);
							},
							{alwaysStartAt: 0},
							function(err) {
								if (err) {
									Importer.warn(Importer._phase + " : " + err.message);
								}
								Importer.progress(1, 1);
								Importer.phase('purgeCategories+Topics+Bookmarks+Posts+VotesDone');
								done()
							});
				});

			},
			function(done) {
				Importer.phase('purgeUsersStart');
				Importer.progress(0, 1);

				Data.countUsers(function(err, total) {
					var index = 0; var count = 0;
					Data.processUsersUidsSet(
							function(err, ids, nextBatch) {
								async.mapLimit(ids, FLUSH_BATCH_SIZE, function(uid, cb) {
									Importer.progress(index++, total);
									if (parseInt(uid, 10) === 1) {
										return cb();
									}
									User.delete(uid, function() {
										count++;
										cb();
									});
								}, nextBatch);
							}, {
								// since we're deleting records the range is always shifting backwards, so need to advance the batch start boundary
								alwaysStartAt: 0,
								// done if the uid=1 in the only one in the db
								doneIf: function(start, end, ids) {
									return ids.length === 1;
								}
							},
							function(err) {
								Importer.progress(1, 1);
								Importer.phase('purgeUsersDone');
								done(err)
							}
					);
				});
			},
			function(done) {
				Importer.phase('purgeGroupsStart');
				Importer.progress(0, 1);

				Data.countGroups(function(err, total) {
					var index = 0; var count = 0;
					Data.processGroupsNamesSet(
							function(err, names, nextBatch) {
								async.mapLimit(names, FLUSH_BATCH_SIZE, function(name, cb) {
									Importer.progress(index++, total);

									// skip if system group
									if (name === 'administrators') {
										return cb();
									}
									Groups.destroy(name, function() {
										count++;
										cb();
									});
								}, nextBatch);
							}, {
								// since we're deleting records the range is always shifting backwards, so need to advance the batch start boundary
								alwaysStartAt: 0,

								// done if the administrators group in the only one in the db
								doneIf: function(start, end, names) {
									return !names.length || names.length === 1;
								}
							},
							function(err) {
								Importer.progress(1, 1);
								Importer.phase('purgeGroupsDone');
								done(err)
							}
					);
				});
			},
			function(done) {
				Importer.phase('purgeMessagesStart');
				Importer.progress(0, 1);

				Data.countMessages(function(err, total) {
					var index = 0;
					Data.eachMessage(
							function(message, next) {
								Importer.progress(index++, total);
								var uids = [message.fromuid, message.touid].sort();
								async.parallel([
									function(nxt) {
										db.delete('message:' + message.mid, function () {
											nxt();
										});
									},
									function(nxt) {
										db.sortedSetRemove('messages:uid:' + uids[0] + ':to:' + uids[1], message.mid, function() {
											nxt();
										});
									},
									function(next) {
										db.sortedSetRemove('uid:' + uids[0] + ':chats', uids[1], next);
									},
									function(next) {
										db.sortedSetRemove('uid:' + uids[1] + ':chats', uids[0], next);
									}
								], next);
							},
							{},
							function(err) {
								Importer.progress(1, 1);
								Importer.phase('purgeMessagesDone');
								done(err)
							}
					);
				});
			},
			function(done) {
				flushed = true;

				Importer.phase('resetGlobalsStart');
				Importer.progress(0, 1);

				async.parallel([
					function(cb) {
						db.setObjectField('global', 'nextUid', 1, cb);
					},
					function(cb) {
						db.setObjectField('global', 'userCount', 1, cb);
					},
					function(cb) {
						db.setObjectField('global', 'nextGid', 1, cb);
					},
					function(cb) {
						db.setObjectField('global', 'groupCount', 1, cb);
					},
					function(cb) {
						db.setObjectField('global', 'nextMid', 1, cb);
					},
					function(cb) {
						db.setObjectField('global', 'nextCid', 1, cb);
					},
					function(cb) {
						db.setObjectField('global', 'categoryCount', 1, cb);
					},
					function(cb) {
						db.setObjectField('global', 'nextTid', 1, cb);
					},
					function(cb) {
						db.setObjectField('global', 'topicCount', 1, cb);
					},
					function(cb) {
						db.setObjectField('global', 'nextPid', 1, cb);
					},
					function(cb) {
						db.setObjectField('global', 'postCount', 1, cb);
					},
					function(cb) {
						db.setObjectField('global', 'nextVid', 1, cb);
					},
					function(cb) {
						db.setObjectField('global', 'voteCount', 1, cb);
					},
					function(cb) {
						db.setObjectField('global', 'nextBid', 1, cb);
					},
					function(cb) {
						db.setObjectField('global', 'bookmarkCount', 1, cb);
					}
				], function() {
					Importer.progress(1, 1);
					Importer.phase('resetGlobalsDone');
					done();
				});
			},
			Importer.deleteTmpImportedSetsAndObjects
		], function(err) {
			if (err) {
				Importer.error(err);
				next(err);
			}
			next();
		});
	};

	Importer.phasePercentage = 0;

	Importer.progress = function(count, total, interval) {
		interval = interval || 0.01;
		var percentage = count / total * 100;
		if (percentage === 0 || percentage >= 100 || (percentage - Importer.phasePercentage >= interval)) {
			Importer.phasePercentage = percentage;
			Importer.emit('importer.progress', {count: count, total: total, percentage: percentage});
		}
	};

	Importer.phase = function(phase, data) {
		Importer.phasePercentage = 0;
		Importer._phase = phase;
		Importer.emit('importer.phase', {phase: phase, data: data, timestamp: +new Date()});
	};

	var recoverImportedGroup = function(_gid, callback) {
		if (! flushed && (alreadyImportedAllGroups || areGroupsDirty)) {
			return Data.getImportedGroup(_gid, callback);
		}
		return callback(null, null);
	};

	var recoverImportedUser = function(_uid, callback) {
		if (! flushed && (alreadyImportedAllUsers || areUsersDirty)) {
			return Data.getImportedUser(_uid, callback);
		}
		return callback(null, null);
	};

	var recoverImportedMessage = function(_mid, callback) {
		if (! flushed && (alreadyImportedAllMessages || areMessagesDirty)) {
			return Data.getImportedMessage(_mid, callback);
		}
		return callback(null, null);
	};

	var recoverImportedCategory = function(_cid, callback) {
		if (! flushed && (alreadyImportedAllCategories || areCategoriesDirty)) {
			return Data.getImportedCategory(_cid, callback);
		}
		return callback(null, null);
	};

	var recoverImportedTopic = function(_tid, callback) {
		if (! flushed && (alreadyImportedAllTopics || areTopicsDirty)) {
			return Data.getImportedTopic(_tid, callback);
		}
		return callback(null, null);
	};

	var recoverImportedPost = function(_pid, callback) {
		if (! flushed && (alreadyImportedAllPosts || arePostsDirty)) {
			return Data.getImportedPost(_pid, callback);
		}
		return callback(null, null);
	};
	var recoverImportedVote = function(_vid, callback) {
		if (! flushed && (alreadyImportedAllVotes || areVotesDirty)) {
			return Data.getImportedVote(_vid, callback);
		}
		return callback(null, null);
	};
	var recoverImportedBookmark = function(_bid, callback) {
		if (! flushed && (alreadyImportedAllBookmarks || areBookmarksDirty)) {
			return Data.getImportedBookmark(_bid, callback);
		}
		return callback(null, null);
	};

	var writeBlob = function(filepath, blob, callback) {
		fs.writeFile(filepath, new Buffer(blob, 'binary').toString('binary'), 'binary', function (err) {
			callback();
		});
	};

	Importer.importUsers = function(next) {
		Importer._lastPercentage = 0;
		Importer.phase('usersImportStart');
		Importer.progress(0, 1);
		var count = 0,
				imported = 0,
				alreadyImported = 0,
				picturesTmpPath = path.join(__dirname, '/tmp/pictures'),
				folder = '_imported_profiles',
				picturesPublicPath = path.join(nconf.get('base_dir'), nconf.get('upload_path'), '_imported_profiles'),
				config = Importer.config(),
				oldOwnerNotFound = config.adminTakeOwnership.enable,
				startTime = +new Date();

		fs.writeFileSync(DIRTY_USERS_FILE, +new Date(), {encoding: 'utf8'});
		fs.ensureDirSync(picturesTmpPath);
		fs.ensureDirSync(picturesPublicPath);

		Importer.exporter.countUsers(function(err, total) {
			Importer.success('Importing ' + total + ' users.');
			Importer.exporter.exportUsers(function(err, users, usersArr, nextExportBatch) {
						async.eachLimit(usersArr, IMPORT_BATCH_SIZE, function(user, done) {
									count++;
									var _uid = user._uid;
									recoverImportedUser(_uid, function(err, _user) {
										if (_user) {
											Importer.progress(count, total);
											imported++;
											alreadyImported++;
											return done();
										}
										var u = Importer.makeValidNbbUsername(user._username || '', user._alternativeUsername || '');

										var p, generatedPassword;

										if (config.passwordGen.enabled) {
											generatedPassword = Importer.genRandPwd(config.passwordGen.len, config.passwordGen.chars);
											p = generatedPassword;
										} else {
											p = user._password;
										}

										var userData = {
											username: u.username,
											email: user._email,
											password: p
										};
										if (!userData.username) {
											Importer.warn('[process-count-at:' + count + '] skipping _username:' + user._username + ':_uid:' + user._uid + ', username is invalid.');
											Importer.progress(count, total);
											return done();
										}
										Importer.log('[process-count-at: ' + count + '] saving user:_uid: ' + _uid);
										var onCreate = function(err, uid) {

											if (err) {
												Importer.warn('[process-count-at: ' + count + '] skipping username: "' + user._username + '" ' + err);
												Importer.progress(count, total);
												done();
											} else {

												var onLevel = function() {

													var onGroups = function () {

														var fields = {
															// preseve the signature, but Nodebb allows a max of 255 chars, so i truncate with an '...' at the end
															signature: user._signature || '',
															website: user._website || '',
															location: user._location || '',
															joindate: user._joindate || startTime,
															reputation: (user._reputation || 0) * config.userReputationMultiplier,
															profileviews: user._profileViews || 0,
															fullname: user._fullname || '',
															birthday: user._birthday || '',
															showemail: user._showemail ? 1 : 0,
															lastposttime: user._lastposttime || 0,

															// this is a migration script, no one is online
															status: 'offline',

															// don't ban the users now, ban them later, if _imported_user:_uid._banned == 1
															banned: 0,

															_imported_path: user._path || '',
															_imported_uid: _uid,
															_imported_username: user._username || '',
															_imported_password: user._password || '',
															_imported_hashed_password: user._hashed_password || '',
															_imported_tmp_autogenerated_password: generatedPassword || '',
															_imported_slug: user._slug || user._userslug || '',
															_imported_signature: user._signature
														};

														if (user._lastonline) {
															fields.lastonline = user._lastonline;
														}

														var keptPicture = false;
														var onUserFields = function(err, result) {
															if (err) {
																return done(err);
															}

															user.imported = true;
															imported++;

															fields.uid = uid;
															user = nodeExtend(true, {}, user, fields);
															user.keptPicture = keptPicture;
															user.userslug = u.userslug;
															users[_uid] = user;
															Importer.progress(count, total);
															var onEmailConfirmed = function() {
																Data.setUserImported(_uid, uid, user, done);
															};
															if (config.autoConfirmEmails) {
																db.setObjectField('email:confirmed', user.email, '1', onEmailConfirmed);
															} else {
																onEmailConfirmed();
															}
														};

														if (user._pictureBlob) {
															var filename = user._pictureFilename ? '_' + uid + '_' + user._pictureFilename : uid + '.png';
															var tmpPath = path.join(picturesTmpPath, filename);
															writeBlob(tmpPath, user._pictureBlob, function(err) {
																if (err) {
																	Importer.warn(tmpPath, err);
																	User.setUserFields(uid, fields, onUserFields);
																} else {
																	File.saveFileToLocal(filename, folder, tmpPath, function(err, ret) {
																		if (!err) {
																			fields.uploadedpicture = ret.url;
																			fields.picture = ret.url;
																			keptPicture = true;
																		} else {
																			Importer.warn(filename, err);
																		}
																		User.setUserFields(uid, fields, onUserFields);
																	});
																}
															});
														} else {
															if (user._picture) {
																fields.uploadedpicture = user._picture;
																fields.picture = user._picture;
																keptPicture = true;
															}

															User.setUserFields(uid, fields, onUserFields);
														}
													};

													if (user._groups && user._groups.length) {
														async.eachLimit(user._groups, 5, function(_gid, next) {
															Data.getImportedGroup(_gid, function(err, _group) {
																if (_group && _group.name) {
																	groupsJoin(_group._name, uid, user._joindate || startTime, function() {
																		Importer.warn(userData.username + ' joined ' + _group._name);
																		next();
																	});
																} else {
																	next();
																}
															});
														}, function() {
															onGroups();
														});
													} else {
														onGroups();
													}
												};

												if (('' + user._level).toLowerCase() == 'moderator') {
													Importer.makeModeratorOnAllCategories(uid, user._joindate || startTime, function () {
														Importer.warn(userData.username + ' just became a moderator on all categories');
														onLevel();
													});
												} else if (('' + user._level).toLowerCase() == 'administrator') {
													groupsJoin('administrators', uid, user._joindate || startTime, function(){
														Importer.warn(userData.username + ' became an Administrator');
														onLevel();
													});
												} else {
													onLevel();
												}

											}
										};  // end onCreate

										if (oldOwnerNotFound
												&& parseInt(user._uid, 10) === parseInt(config.adminTakeOwnership._uid, 10)
												|| (user._username || '').toLowerCase() === config.adminTakeOwnership._username.toLowerCase()
										) {
											Importer.warn('[process-count-at:' + count + '] skipping user: ' + user._username + ':'+ user._uid + ', it was revoked ownership');
											// cache the _uid for the next phases
											Importer.config('adminTakeOwnership', {
												enable: true,
												username: user._username,
												// just an alias in this case
												_username: user._username,
												_uid: user._uid
											});
											// no need to make it a mod or an admin, it already is
											user._level = null;
											// set to false so we don't have to match all users
											oldOwnerNotFound = false;
											// dont create, but set the fields
											return onCreate(null, LOGGEDIN_UID);
										} else {
											User.create(userData, onCreate);
										}
									});
								},
								nextExportBatch);
					},
					{
						// options
					},
					function(err) {
						if (err) {
							throw err;
						}
						Importer.success('Imported ' + imported + '/' + total + ' users' + (alreadyImported ? ' (out of which ' + alreadyImported + ' were already imported at an earlier time)' : ''));
						var nxt = function () {
							fs.remove(picturesTmpPath, function() {
								fs.remove(DIRTY_USERS_FILE, next);
							});
						};
						if (config.autoConfirmEmails && Data.keys) {
							async.parallel([
								function (done) {
									Data.keys('confirm:*', function (err, keys) {
										keys.forEach(function (key) {
											db.delete(key);
										});
										done();
									});
								},
								function (done) {
									Data.keys('email:*:confirm', function (err, keys) {
										keys.forEach(function (key) {
											db.delete(key);
										});
										done();
									});
								}
							], function () {
								Importer.progress(1, 1);
								Importer.phase('usersImportDone');
								nxt();
							});
						} else {
							Importer.progress(1, 1);
							Importer.phase('usersImportDone');
							nxt();
						}
					});
		});
	};


	Importer.importMessages = function(next) {
		Importer.phase('messagesImportStart');
		Importer.progress(0, 1);

		Importer._lastPercentage = 0;
		var count = 0,
				imported = 0,
				alreadyImported = 0,
				startTime = +new Date();

		fs.writeFileSync(DIRTY_MESSAGES_FILE, +new Date(), {encoding: 'utf8'});
		Importer.exporter.countMessages(function(err, total) {
			Importer.success('Importing ' + total + ' messages.');
			Importer.exporter.exportMessages(
					function(err, messages, messagesArr, nextExportBatch) {

						var onEach = function(message, done) {
							count++;
							var _mid = message._mid;

							recoverImportedMessage(_mid, function(err, _message) {
								if (_message) {
									Importer.progress(count, total);
									imported++;
									alreadyImported++;
									return done();
								}

								if (message._fromuid == message._touid) {
									Importer.warn('[process-count-at:' + count + '] skipping message:_mid: ' + _mid + ', because it was send to self');
									Importer.progress(count, total);
									return done();
								}

								async.parallel([
									function(cb) {
										Data.getImportedUser(message._fromuid, function(err, toUser) {
											if (err) {
												Importer.warn('getImportedUser:_fromuid:' + message._fromuid + ' err: ' + err.message);
											}
											cb(null, toUser);
										});
									},
									function(cb) {
										Data.getImportedUser(message._touid, function(err, toUser) {
											if (err) {
												Importer.warn('getImportedUser:_touid:' + message._touid + ' err: ' + err.message);
											}
											cb(null, toUser);
										});
									}
								], function(err, results) {
									var fromUser = results[0];
									var toUser = results[1];

									if (!fromUser || !toUser) {
										Importer.warn('[process-count-at: ' + count + '] skipping message:_mid: ' + _mid + ' _fromuid:' + message._fromuid + ':imported: ' + !!fromUser + ', _touid:' + message._touid + ':imported: ' + !!toUser);
										Importer.progress(count, total);
										done();
									} else {
										Importer.log('[process-count-at: ' + count + '] saving message:_mid: ' + _mid + ' _fromuid:' + message._fromuid + ', _touid:' + message._touid);

										var onAddMessage = function(err, messageReturn) {
											if (err || !messageReturn) {
												Importer.warn('[process-count-at: ' + count + '] skipping message:_mid: ' + _mid + ' _fromuid:' + message._fromuid + ':imported: ' + !!fromUser + ', _touid:' + message._touid + ':imported: ' + !!toUser
												+ (err ? ' err: ' + err.message : ' messageReturn: ' + !!messageReturn));
												Importer.progress(count, total);
												return done();
											}

											imported++;
											var mid = messageReturn.mid;
											var uids =  [messageReturn.fromuid, messageReturn.touid].sort();

											var _imported_content = message._content;
											var timestamp = message._timestamp;
											var timestampISO = (new Date(message._timestamp)).toISOString();

											delete messageReturn._key;
											delete messageReturn.toUser;
											delete messageReturn.fromUser;

											async.parallel([
												function(next) {
													db.setObjectField('message:' + mid, '_imported_content', _imported_content, next);
												},
												function(next) {
													db.setObjectField('message:' + mid, 'timestamp', timestamp, next);
												},
												function(next) {
													db.setObjectField('message:' + mid, 'timestampISO', timestampISO, next);
												},
												function(next) {
													db.sortedSetAdd('messages:uid:' + uids[0] + ':to:' + uids[1], timestamp, mid, next);
												},
												function(next) {
													db.sortedSetAdd('uid:' + uids[0] + ':chats', timestamp, uids[1], next);
												},
												function(next) {
													db.sortedSetAdd('uid:' + uids[1] + ':chats', timestamp, uids[0], next);
												},
												function(next) {
													db.sortedSetRemove('uid:' + messageReturn.touid + ':chats:unread', messageReturn.fromuid, next);
												}
											], function(err) {
												if (err) {
													Importer.warn('[process-count-at: ' + count + '] message creation error message:_mid: ' + _mid + ':mid:' + mid, err);
													return done();
												}

												Importer.progress(count, total);
												message = nodeExtend(true, {}, message, messageReturn);
												Data.setMessageImported(_mid, mid, message, done);
											});
										};

										Messaging.addMessage(fromUser.uid, toUser.uid, message._content, onAddMessage);
									}
								});
							});
						};
						async.eachLimit(messagesArr, IMPORT_BATCH_SIZE, onEach, nextExportBatch);
					},
					{
						// options
					},
					function() {
						Importer.progress(1, 1);
						Importer.phase('messagesImportDone');
						Importer.success('Imported ' + imported + '/' + total + ' messages' + (alreadyImported ? ' (out of which ' + alreadyImported + ' were already imported at an earlier time)' : ''));
						fs.remove(DIRTY_MESSAGES_FILE, next);
					});
		});
	};


	Importer.importCategories = function(next) {
		Importer.phase('categoriesImportStart');
		Importer.progress(0, 1);

		Importer._lastPercentage = 0;

		var count = 0,
				imported = 0,
				alreadyImported = 0,
				startTime = +new Date(),
				config = Importer.config();

		fs.writeFileSync(DIRTY_CATEGORIES_FILE, +new Date(), {encoding: 'utf8'});

		Importer.exporter.countCategories(function(err, total) {
			Importer.success('Importing ' + total + ' categories.');
			Importer.exporter.exportCategories(
					function(err, categories, categoriesArr, nextExportBatch) {
						var onEach = function(category, done) {
							count++;
							var _cid = category._cid;

							recoverImportedCategory(_cid, function(err, _category) {
								if (_category) {
									imported++;
									alreadyImported++;
									Importer.progress(count, total);
									return done();
								}

								Importer.log('[process-count-at:' + count + '] saving category:_cid: ' + _cid);

								var categoryData = {
									name: category._name || ('Category ' + (count + 1)),
									description: category._description || 'no description available',

									// force all categories Parent to be 0, then after the import is done, we can iterate again and fix them.
									parentCid: 0,
									// same deal with disabled
									disabled: 0,

									// you can fix the order later, nbb/admin
									order: category._order || (count + 1),

									link: category._link || 0
								};

								if (config.categoriesIcons && config.categoriesIcons.length) {
									categoryData.icon = config.categoriesIcons[Math.floor(Math.random() * config.categoriesIcons.length)];
								}
								if (config.categoriesBgColors && config.categoriesBgColors.length) {
									categoryData.bgColor = config.categoriesBgColors[Math.floor(Math.random() * config.categoriesBgColors.length)];
								}
								if (config.categoriesTextColors && config.categoriesTextColors.length) {
									categoryData.color = config.categoriesTextColors[Math.floor(Math.random() * config.categoriesTextColors.length)];
								}

								var onCreate = function(err, categoryReturn) {
									if (err) {
										Importer.warn('skipping category:_cid: ' + _cid + ' : ' + err);
										Importer.progress(count, total);
										return done();
									}

									var onFields = function(err) {
										if (err) {
											Importer.warn(err);
										}

										Importer.progress(count, total);

										category.imported = true;
										imported++;
										category = nodeExtend(true, {}, category, categoryReturn, fields);
										categories[_cid] = category;

										Data.setCategoryImported(_cid, categoryReturn.cid, category, done);
									};

									var fields = {
										_imported_cid: _cid,
										_imported_path: category._path || '',
										_imported_name: category._name || '',
										_imported_slug: category._slug || '',
										_imported_parentCid: category._parent || category._parentCid || '',
										_imported_disabled: category._disabled || 0,
										_imported_description: category._description || ''
									};

									db.setObject('category:' + categoryReturn.cid, fields, onFields);
								};

								Categories.create(categoryData, onCreate);
							});
						};
						async.eachLimit(categoriesArr, 1, onEach, nextExportBatch);
					},
					{
						// options
					},
					function(err) {
						if (err) {
							throw err;
						}
						Importer.success('Imported ' + imported + '/' + total + ' categories' + (alreadyImported ? ' (out of which ' + alreadyImported + ' were already imported at an earlier time)' : ''));
						Importer.progress(1, 1);
						Importer.phase('categoriesImportDone');
						fs.remove(DIRTY_CATEGORIES_FILE, next);
					});
		});
	};

	Importer.importGroups = function(next) {
		Importer.phase('groupsImportStart');
		Importer.progress(0, 1);

		Importer._lastPercentage = 0;

		var count = 0,
				imported = 0,
				alreadyImported = 0,
				startTime = +new Date(),
				config = Importer.config();

		fs.writeFileSync(DIRTY_GROUPS_FILE, +new Date(), {encoding: 'utf8'});

		Importer.exporter.countGroups(function(err, total) {
			Importer.success('Importing ' + total + ' groups.');
			Importer.exporter.exportGroups(
					function(err, groups, groupsArr, nextExportBatch) {

						var onEach = function(group, done) {
							count++;
							var _gid = group._gid;

							recoverImportedGroup(_gid, function(err, _group) {
								if (_group) {
									imported++;
									alreadyImported++;
									Importer.progress(count, total);
									return done();
								}

								Importer.log('[process-count-at:' + count + '] saving group:_gid: ' + _gid);

								var groupData = {
									name: group._name || ('Group ' + (count + 1)),
									description: group._description || 'no description available'
								};

								var onCreate = function(err, groupReturn) {
									if (err) {
										Importer.warn('skipping group:_gid: ' + _gid + ' : ' + err);
										Importer.progress(count, total);
										return done();
									}

									var onFields = function(err) {
										if (err) {
											Importer.warn(err);
										}

										var onTime = function () {

											Importer.progress(count, total);

											group.imported = true;
											imported++;
											group = nodeExtend(true, {}, group, groupReturn, fields);
											groups[_gid] = group;

											Data.setGroupImported(_gid, groupReturn.name, group, done);
										};

										if (group._createtime || group._timestamp) {
											db.sortedSetAdd('groups:createtime', group._createtime || group._timestamp, groupReturn.name, function() {
												onTime();
											});
										} else {
											onTime();
										}
									};

									var fields = {
										_imported_gid: _gid,
										_imported_name: group._name,
										_imported_ownerUid: group._ownerUid || '',
										_imported_path: group._path || '',
										_imported_slug: group._slug || '',
										_imported_description: group._description || ''
									};

									if (group._createtime || group._timestamp) {
										fields.createtime = group._createtime || group._timestamp;
									}

									db.setObject('group:' + groupReturn.name, fields, onFields);
								};

								Groups.create(groupData, onCreate);
							});
						};
						async.eachLimit(groupsArr, 1, onEach, nextExportBatch);
					},
					{
						// options
					},
					function(err) {
						if (err) {
							throw err;
						}
						Importer.success('Importing ' + imported + '/' + total + ' groups' + (alreadyImported ? ' (out of which ' + alreadyImported + ' were already imported at an earlier time)' : ''));
						Importer.progress(1, 1);
						Importer.phase('groupsImportDone');
						fs.remove(DIRTY_GROUPS_FILE, next);
					});
		});
	};

	Importer.allowGuestsOnAllCategories = function(done) {
		Data.eachCategory(function(category, next) {
					async.parallel([
						function(nxt) {
							Groups.join('cid:' + category.cid + ':privileges:groups:topics:create', 'registered-users', nxt);
						},
						function(nxt) {
							Groups.join('cid:' + category.cid + ':privileges:groups:topics:reply', 'registered-users', nxt);
						},
						function(nxt) {
							Groups.join('cid:' + category.cid + ':privileges:groups:find', 'registered-users', nxt);
						},
						function(nxt) {
							Groups.join('cid:' + category.cid + ':privileges:groups:read', 'registered-users', nxt);
						},
						function(nxt) {
							Groups.join('cid:' + category.cid + ':privileges:groups:topics:create', 'guests', nxt);
						},
						function(nxt) {
							Groups.join('cid:' + category.cid + ':privileges:groups:topics:reply', 'guests', nxt);
						},
						function(nxt) {
							Groups.join('cid:' + category.cid + ':privileges:groups:find', 'guests', nxt);
						},
						function(nxt) {
							Groups.join('cid:' + category.cid + ':privileges:groups:read', 'guests', nxt);
						}
					], next);
				},
				{async: true, eachLimit: 10},
				function() {
					done();
				});
	};

	Importer.disallowGuestsWriteOnAllCategories = function(done) {
		Data.eachCategory(function(category, next) {
					async.parallel([
						function(nxt) {
							Groups.leave('cid:' + category.cid + ':privileges:groups:find', 'guests', nxt);
						},
						function(nxt) {
							Groups.leave('cid:' + category.cid + ':privileges:groups:read', 'guests', nxt);
						}
					], next);
				},
				{async: true, eachLimit: 10},
				function() {
					done();
				});
	};

	Importer.importTopics = function(next) {
		Importer.phase('topicsImportStart');
		Importer.progress(0, 1);

		Importer._lastPercentage = 0;
		var count = 0,
				imported = 0,
				alreadyImported = 0,
				startTime = +new Date(),
				config = Importer.config();

		fs.writeFileSync(DIRTY_TOPICS_FILE, +new Date(), {encoding: 'utf8'});

		Importer.exporter.countTopics(function(err, total) {
			Importer.success('Importing ' + total + ' topics.');
			Importer.exporter.exportTopics(
					function(err, topics, topicsArr, nextExportBatch) {
						var onEach = function(topic, done) {
							count++;
							var _tid = topic._tid;
							recoverImportedTopic(_tid, function(err, _topic) {
								if (_topic) {
									Importer.progress(count, total);
									imported++;
									alreadyImported++;
									return done();
								}

								async.parallel([
									function(cb) {
										Data.getImportedCategory(topic._cid, function(err, cat) {
											if (err) {
												Importer.warn('getImportedCategory: ' + topic._cid + ' err: ' + err);
											}
											cb(null, cat);
										});
									},
									function(cb) {
										Data.getImportedUser(topic._uid, function(err, usr) {
											if (err) {
												Importer.warn('getImportedUser: ' + topic._uid + ' err: ' + err);
											}
											cb(null, usr);
										});
									}
								], function(err, results) {

									var category = results[0];
									var user = results[1] || {uid: '0'};

									if (!category) {
										Importer.warn('[process-count-at:' + count + '] skipping topic:_tid:"' + _tid + '" --> _cid: ' + topic._cid + ':imported:' + !!category);
										Importer.progress(count, total);
										done();
									} else {
										Importer.log('[process-count-at:' + count + '] saving topic:_tid: ' + _tid);

										var onPost = function (err, returnTopic) {
											if (err) {
												Importer.warn('[process-count-at:' + count + '] skipping topic:_tid: ' + _tid + ':cid:' + category.cid + ':_cid:' + topic._cid + ':uid:' + user.uid +  ':_uid:' + topic._uid + ' err: ' + err);
												Importer.progress(count, total);
												done();
											} else {

												topic.imported = true;
												imported++;

												var timestamp = topic._timestamp || startTime;
												var relativeTime = new Date(timestamp).toISOString();

												var topicFields = {
													viewcount: topic._viewcount || topic._viewscount || 0,

													// assume that this topic not locked for now, but will iterate back again at the end and lock it back after finishing the importPosts()
													// locked: normalizedTopic._locked ? 1 : 0,
													locked: 0,

													deleted: topic._deleted ? 1 : 0,

													// if pinned, we should set the db.sortedSetAdd('cid:' + cid + ':tids', Math.pow(2, 53), tid);
													pinned: topic._pinned ? 1 : 0,
													timestamp: timestamp,
													lastposttime: timestamp,

													_imported_tid: _tid,
													_imported_uid: topic._uid || '',
													_imported_cid: topic._cid,
													_imported_slug: topic._slug || '',
													_imported_path: topic._path || '',
													_imported_title: topic._title || '',
													_imported_content: topic._content || '',
													_imported_guest: topic._guest || '',
													_imported_ip: topic._ip || '',
													_imported_user_slug: user._slug || '',
													_imported_user_path: user._path || '',
													_imported_category_path: category._path || '',
													_imported_category_slug: category._slug || ''
												};

												var postFields = {
													timestamp: timestamp,
													votes: topic._votes || 0,
													reputation: topic._reputation || 0,
													edited: topic._edited || undefined,
													// todo: not sure if I need this
													relativeTime: relativeTime
												};

												var onPinned = function() {

													var onFields = function(err, result) {
														Importer.progress(count, total);
														if (err) {
															Importer.warn(err);
														}

														var onPostFields = function(){
															topic = nodeExtend(true, {}, topic, topicFields, returnTopic.topicData);
															topics[_tid] = topic;
															Data.setTopicImported(_tid, returnTopic.topicData.tid, topic, done);
														};

														Posts.setPostFields(returnTopic.postData.pid, postFields, onPostFields);
													};

													db.setObject('topic:' + returnTopic.topicData.tid, topicFields, onFields);
												};

												// pinned = 1 not enough to float the topic to the top in it's category
												if (topicFields.pinned) {
													db.sortedSetAdd('cid:' + category.cid + ':tids', Math.pow(2, 53), returnTopic.topicData.tid, onPinned);
												}  else {
													db.sortedSetAdd('cid:' + category.cid + ':tids', timestamp, returnTopic.topicData.tid, onPinned);
												}
											}
										};

										topic._content = (topic._content || '').trim() ? topic._content : '[[blank-post-content-placeholder]]';
										topic._title = utils.slugify(topic._title) ? topic._title[0].toUpperCase() + topic._title.substr(1) : utils.truncate(topic._content, 100);

										if (topic._tags && !Array.isArray(topic._tags)) {
											topic._tags = ('' + topic._tags).split(',');
										}

										Topics.post({
											uid: !config.adminTakeOwnership.enable ? user.uid : parseInt(config.adminTakeOwnership._uid, 10) === parseInt(topic._uid, 10) ? LOGGEDIN_UID : user.uid,
											title: topic._title,
											content: topic._content,
											cid: category.cid,
											thumb: topic._thumb,
											tags: topic._tags
										}, onPost);
									}
								});
							});
						};

						async.eachLimit(topicsArr, IMPORT_BATCH_SIZE, onEach, nextExportBatch);
					},
					{
						//options
					},
					function(err) {
						if (err) {
							throw err;
						}
						Importer.success('Imported ' + imported + '/' + total + ' topics' + (alreadyImported ? ' (out of which ' + alreadyImported + ' were already imported at an earlier time)' : ''));
						Importer.progress(1, 1);
						Importer.phase('topicsImportDone');
						fs.remove(DIRTY_TOPICS_FILE, next);
					});
		});

	};

	Importer.importPosts = function(next) {
		Importer.phase('postsImportStart');
		Importer.progress(0, 1);

		Importer._lastPercentage = 0;
		var count = 0,
				imported = 0,
				alreadyImported = 0,
				startTime = +new Date(),
				config = Importer.config();

		fs.writeFileSync(DIRTY_POSTS_FILE, +new Date(), {encoding: 'utf8'});
		Importer.exporter.countPosts(function(err, total) {
			Importer.success('Importing ' + total + ' posts.');
			Importer.exporter.exportPosts(
					function(err, posts, postsArr, nextExportBatch) {

						var onEach = function(post, done) {
							count++;
							var _pid = post._pid;

							recoverImportedPost(_pid, function(err, _post) {
								if (_post) {
									Importer.progress(count, total);
									imported++;
									alreadyImported++;
									return done();
								}

								async.parallel([
									function(cb) {
										Data.getImportedTopic(post._tid, function(err, top) {
											if (err) {
												Importer.warn('getImportedTopic: ' + post._tid + ' err: ' + err);
											}
											cb(null, top);
										});
									},
									function(cb) {
										Data.getImportedUser(post._uid, function(err, usr) {
											if (err) {
												Importer.warn('getImportedUser: ' + post._uid + ' err: ' + err);
											}
											cb(null, usr);
										});
									}
								], function(err, results) {
									var topic = results[0];
									var user = results[1] || {uid: '0'};

									if (!topic) {
										Importer.warn('[process-count-at: ' + count + '] skipping post:_pid: ' + _pid + ' _tid:' + post._tid + ':uid:' + user.uid + ':_uid:' + post._uid + ' imported: ' + !!topic);
										done();
									} else {

										Importer.log('[process-count-at: ' + count + '] saving post: ' + _pid + ':tid:' + topic.tid + ':_tid:' + post._tid + ':uid:' + user.uid + ':_uid:' + post._uid);

										var onCreate = function(err, postReturn){
											if (err) {
												Importer.warn('[process-count-at: ' + count + '] skipping post: ' + post._pid + ':tid:' + topic.tid + ':_tid:' + post._tid + ':uid:' + user.uid + ':_uid:' + post._uid + ' ' + err);
												Importer.progress(count, total);
												done();
											} else {

												post.imported = true;
												imported++;

												var fields = {
													reputation: post._reputation || 0,
													votes: post._votes || 0,

													edited: post._edited || undefined,
													deleted: post._deleted || 0,

													// todo: not sure if I need this
													relativeTime: new Date(post._timestamp || startTime).toISOString(),

													_imported_pid: _pid,
													_imported_uid: post._uid || '',
													_imported_tid: post._tid || '',
													_imported_content: post._content || '',
													_imported_cid: topic._cid || '',
													_imported_ip: post._ip || '',
													_imported_guest: post._guest || '',
													_imported_toPid: post._toPid || '',
													_imported_user_slug: user._slug || '',
													_imported_user_path: user._path || '',
													_imported_topic_slug: topic._slug || '',
													_imported_topic_path: topic._path || '',
													_imported_category_path: topic._imported_category_path || '',
													_imported_category_slug: topic._imported_category_slug || '',
													_imported_path: post._path || ''
												};

												var onPostFields = function() {
													Importer.progress(count, total);
													post = nodeExtend(true, {}, post, fields, postReturn);
													post.imported = true;
													posts[_pid] = post;
													Data.setPostImported(_pid, post.pid, post, done);
												};
												Posts.setPostFields(postReturn.pid, fields, onPostFields);
											}
										};

										post._content = (post._content || '').trim() ? post._content : '[[blank-post-content-placeholder]]';
										Posts.create({
											uid: !config.adminTakeOwnership.enable ? user.uid : config.adminTakeOwnership._uid === post._uid ? 1 : user.uid,
											tid: topic.tid,
											content: post._content,
											timestamp: post._timestamp || startTime,
											ip: post._ip
										}, onCreate);
									}
								});
							});
						};
						async.eachLimit(postsArr, IMPORT_BATCH_SIZE, onEach, nextExportBatch);
					},
					{
						// options
					},
					function() {
						Importer.progress(1, 1);
						Importer.phase('postsImportDone');
						Importer.success('Imported ' + imported + '/' + total + ' posts' + (alreadyImported ? ' (out of which ' + alreadyImported + ' were already imported at an earlier time)' : ''));
						fs.remove(DIRTY_POSTS_FILE, next);
					});
		});
	};

	Importer.importVotes = function(next) {
		Importer.phase('votesImportStart');
		Importer.progress(0, 1);

		Importer._lastPercentage = 0;

		var count = 0,
				imported = 0,
				alreadyImported = 0,
				startTime = +new Date(),
				config = Importer.config();

		fs.writeFileSync(DIRTY_VOTES_FILE, +new Date(), {encoding: 'utf8'});

		Importer.exporter.countVotes(function(err, total) {
			Importer.success('Importing ' + total + ' votes.');
			Importer.exporter.exportVotes(
					function(err, votes, votesArr, nextExportBatch) {

						var onEach = function(vote, done) {
							count++;
							var _vid = vote._vid;

							recoverImportedVote(_vid, function(err, _vote) {
								if (_vote) {
									imported++;
									alreadyImported++;
									Importer.progress(count, total);
									return done();
								}

								if (err) {
									Importer.warn('skipping vote:_vid: ' + _vid + ' : ' + err);
									Importer.progress(count, total);
									return done();
								}

								Importer.log('[process-count-at:' + count + '] saving vote:_vid: ' + _vid);

								async.parallel([
											function(cb) {
												Data.getImportedPost(vote._pid, function(err, post) {
													if (err) {
														Importer.warn('getImportedPost: ' + vote._pid + ' err: ' + err);
													}
													cb(null, post);
												});
											},
											function(cb) {
												Data.getImportedTopic(vote._tid, function(err, topic) {
													if (err) {
														Importer.warn('getImportedTopic: ' + vote._tid + ' err: ' + err);
													}
													cb(null, topic);
												});
											},
											function(cb) {
												Data.getImportedUser(vote._uid, function(err, user) {
													if (err) {
														Importer.warn('getImportedUser: ' + vote._uid + ' err: ' + err);
													}
													cb(null, user);
												});
											}
										],
										function(err, results){
											var post = results[0];
											var topic = results[1];
											var user = results[2] || {uid: '0'};

											if (!post && !topic) {
												Importer.warn('[process-count-at: ' + count + '] post and topic do not exist! Likely it was deleted. _vid: ' + _vid);
												done();
											} else {

												var onCreate = function(err, voteReturn) {
													if (err) {
														Importer.warn('skipping vote:_vid: ' + _vid + ' : ' + err);
														Importer.progress(count, total);
														return done();
													}

													Importer.progress(count, total);

													vote.imported = true;
													imported++;
													vote = nodeExtend(true, {}, vote, voteReturn);
													votes[_vid] = vote;
													Data.setVoteImported(_vid, vote._action, vote, done);
												};

												var sendVote = function(pid, uid, action) {
													if (action == 'down') {
														Favourites.downvote(pid, uid, onCreate);
													} else {
														Favourites.upvote(pid, uid, onCreate);
													}
												};
												var pid;
												if (!_.isUndefined(post) && !_.isNull(post)) {
													pid = post.pid;
												} else if (!_.isUndefined(topic) && !_.isNull(topic)) {
													pid = topic.tid;
												}

												var action = vote._action == -1 ? 'down' : 'up';

												sendVote(pid, user.uid, action);
											}
										});
							});
						};
						async.eachLimit(votesArr, 1, onEach, nextExportBatch);
					},
					{
						// options
					},
					function(err) {
						if (err) {
							throw err;
						}
						Importer.success('Imported ' + imported + '/' + total + ' votes' + (alreadyImported ? ' (out of which ' + alreadyImported + ' were already imported at an earlier time)' : ''));
						Importer.progress(1, 1);
						Importer.phase('votesImportDone');
						fs.remove(DIRTY_VOTES_FILE, next);
					});
		});
	};

	Importer.importBookmarks = function(next) {
		Importer.phase('bookmarksImportStart');
		Importer.progress(0, 1);

		Importer._lastPercentage = 0;

		var count = 0,
				imported = 0,
				alreadyImported = 0,
				startTime = +new Date(),
				config = Importer.config();

		fs.writeFileSync(DIRTY_BOOKMARKS_FILE, +new Date(), {encoding: 'utf8'});

		Importer.exporter.countBookmarks(function(err, total) {
			Importer.success('Importing ' + total + ' bookmarks.');
			Importer.exporter.exportBookmarks(
					function(err, bookmarks, bookmarksArr, nextExportBatch) {

						var onEach = function(bookmark, done) {
							count++;
							var _bid = bookmark._bid;

							recoverImportedBookmark(_bid, function(err, _bookmark) {
								if (_bookmark) {
									imported++;
									alreadyImported++;
									Importer.progress(count, total);
									return done();
								}

								if (err) {
									Importer.warn('skipping bookmark:_bid: ' + _bid + ' : ' + err);
									Importer.progress(count, total);
									return done();
								}

								Importer.log('[process-count-at:' + count + '] saving bookmark:_bid: ' + _bid);

								async.parallel([
											function(cb) {
												Data.getImportedTopic(bookmark._tid, function(err, topic) {
													if (err) {
														Importer.warn('getImportedTopic: ' + bookmark._tid + ' err: ' + err);
													}
													cb(null, topic);
												});
											},
											function(cb) {
												Data.getImportedUser(bookmark._uid, function(err, user) {
													if (err) {
														Importer.warn('getImportedUser: ' + bookmark._uid + ' err: ' + err);
													}
													cb(null, user);
												});
											}
										],
										function(err, results){
											var topic = results[0];
											var user = results[1] || {uid: '0'};

											if (!topic) {
												Importer.warn('[process-count-at: ' + count + '] topic does not exist! Likely it was deleted. _bid: ' + _bid);
												done();
											} else {

												var onCreate = function(err, bookmarkReturn) {
													if (err) {
														Importer.warn('skipping bookmark:_bid: ' + _bid + ' : ' + err);
														Importer.progress(count, total);
														return done();
													}

													Importer.progress(count, total);

													bookmark.imported = true;
													imported++;
													bookmark = nodeExtend(true, {}, bookmark, bookmarkReturn);
													bookmarks[_bid] = bookmark;
													Data.setBookmarkImported(_bid, bookmark._index, bookmark, done);
												};

												Topics.setUserBookmark(topic.tid, user.uid, bookmark._index, onCreate);
											}
										});
							});
						};
						async.eachLimit(bookmarksArr, 1, onEach, nextExportBatch);
					},
					{
						// options
					},
					function(err) {
						if (err) {
							throw err;
						}
						Importer.success('Imported ' + imported + '/' + total + ' bookmarks' + (alreadyImported ? ' (out of which ' + alreadyImported + ' were already imported at an earlier time)' : ''));
						Importer.progress(1, 1);
						Importer.phase('bookmarksImportDone');
						fs.remove(DIRTY_BOOKMARKS_FILE, next);
					});
		});
	};

	Importer.teardown = function(next) {
		Importer.phase('importerTeardownStart');
		Importer.phase('importerTeardownDone');
		Importer.phase('importerComplete');

		Importer.emit('importer.complete');
		next();
	};

	Importer.relockUnlockedTopics = function(next) {
		var count = 0;

		Importer.phase('relockingTopicsStart');
		Importer.progress(0, 1);

		Data.countImportedTopics(function(err, total) {
			Data.eachImportedTopic(function(topic, done) {
						Importer.progress(count++, total);

						if (!topic || !parseInt(topic._locked, 10)) {
							return done();
						}
						db.setObjectField('topic:' + topic.tid, 'locked', 1, function(err) {
							if (err) {
								Importer.warn(err);
							} else {
								Importer.log('[process-count-at: ' + count + '] locked topic:' + topic.tid + ' back');
							}
							done();
						});
					},
					{async: true, eachLimit: IMPORT_BATCH_SIZE},
					function(err) {
						if (err) throw err;
						Importer.progress(1, 1);
						Importer.phase('relockingTopicsDone');
						next();
					});
		});
	};

	Importer.rebanUnbannedUsers = function(next) {
		var count = 0;

		Importer.phase('rebanUnbannedUsersStart');
		Importer.progress(0, 1);

		Data.countImportedUsers(function(err, total) {
			Data.eachImportedUser(function(user, done) {
						Importer.progress(count++, total);

						if (!user || !parseInt(user._banned, 10)) {
							return done();
						}
						User.ban(user.uid, function() {
							if (err) {
								Importer.warn(err);
							} else {
								Importer.log('[process-count-at: ' + count + '] banned user:' + user.uid + ' back');
							}
							done();
						});
					},
					{async: true, eachLimit: IMPORT_BATCH_SIZE},
					function(err) {
						if (err) throw err;
						Importer.progress(1, 1);
						Importer.phase('rebanUnbannedUsersDone');
						next();
					});
		});
	};

	Importer.fixTopicTimestamps = function(next) {
		var count = 0;

		Importer.phase('fixTopicTimestampsStart');
		Importer.progress(0, 1);

		Data.countTopics(function(err, total) {
			Data.eachTopic(function(topic, done) {
						Importer.progress(count++, total);

						if (!topic || !topic.tid)
							return done();

						// todo paginate this as well
						db.getSortedSetRevRange('tid:' + topic.tid + ':posts', 0, -1, function(err, pids) {
							if (err) {
								return done(err);
							}

							if (!Array.isArray(pids) || !pids.length) {
								return done();
							}
							async.parallel({
								cid: function(next) {
									db.getObjectField('topic:' + topic.tid, 'cid', next);
								},
								lastPostTimestamp: function(next) {
									db.getObjectField('post:' + pids[0], 'timestamp', next);
								}
							}, function(err, results) {
								if (err) {
									return done(err);
								}

								db.sortedSetAdd('cid:' + results.cid + ':tids', results.lastPostTimestamp, topic.tid, done);
							});
						});
					},
					{async: true, eachLimit: IMPORT_BATCH_SIZE},
					function(err) {
						if (err) throw err;
						Importer.progress(1, 1);
						Importer.phase('fixTopicTimestampsDone');
						next();
					});
		});
	};

	Importer.fixPostsToPids = function(next) {
		var count = 0;
		Importer.phase('fixPostsToPidsStart');
		Importer.progress(0, 1);

		Data.countPosts(function(err, total) {
			Data.eachPost(function(post, done) {
						Importer.progress(count++, total);
						if (!post || !post._imported_toPid || !post.pid || post._imported_toPid_fixed) {
							return done();
						}
						Data.getImportedPost(post._imported_toPid, function(err, toPost) {
							if (err || !toPost) {
								return done();
							}
							Posts.setPostFields(post.pid, {'toPid': toPost.pid, '_imported_toPid_fixed': 1}, done);
						});
					},
					{async: true, eachLimit: IMPORT_BATCH_SIZE},
					function(err) {
						if (err) throw err;
						Importer.progress(1, 1);
						Importer.phase('fixPostsToPidsDone');
						next();
					});
		});
	};

	Importer.fixGroupsOwners = function(next) {
		var count = 0;
		Importer.phase('fixGroupsOwnersStart');
		Importer.progress(0, 1);

		Data.countGroups(function(err, total) {
			Data.eachGroup(function(group, done) {
						Importer.progress(count++, total);
						if (!group || !group._imported_ownerUid) {
							return done();
						}
						Data.getImportedUser(group._imported_ownerUid, function(err, user) {
							if (err || !user) {
								return done();
							}
							db.setAdd('group:' + group.name + ':owners', user.uid, function() {
								done();
							});
						});
					},
					{async: true, eachLimit: IMPORT_BATCH_SIZE},
					function(err) {
						if (err) throw err;
						Importer.progress(1, 1);
						Importer.phase('fixGroupsOwnersDone');
						next();
					});
		});
	};


	Importer.fixCategoriesParentsAndAbilities = function(next) {
		var count = 0;

		Importer.phase('fixCategoriesParentsAndAbilitiesStart');
		Importer.progress(0, 1);

		Data.countCategories(function(err, total) {
			Data.eachCategory(function (category, done) {
						Importer.progress(count++, total);

						var disabled = 0;

						if (category) {
							var cb = function (parentCid, disabled) {
								var hash = {};
								if (disabled) {
									hash['disabled'] = 1;
								}
								if (parentCid) {
									hash['parentCid'] = parentCid;
								}
								if (Object.keys(hash).length) {
									db.setObject('category:' + category.cid, hash, done);
								} else {
									done();
								}
							}

							if (parseInt(category._imported_disabled, 10)) {
								disabled = 1;
							}
							if (category._imported_parentCid) {
								Data.getImportedCategory(category._imported_parentCid, function (err, parentCategory) {
									cb(parentCategory && parentCategory.cid, disabled);
								});
							} else {
								cb(null, disabled);
							}
						} else {
							done();
						}
					},
					{async: true, eachLimit: 10},
					function() {
						if (err) throw err;
						Importer.progress(1, 1);
						Importer.phase('fixCategoriesParentsAndAbilitiesDone');
						next();
					}
			);
		});
	};

	Importer.backupConfig = function(next) {
		// if the backedConfig file exists, that means we did not complete the restore config last time,
		// so don't overwrite it, assuming the nodebb config in the db are the tmp ones
		if (fs.existsSync(BACKUP_CONFIG_FILE)) {
			Importer.config('backedConfig', fs.readJsonSync(BACKUP_CONFIG_FILE) || {});
			next();
		} else {
			db.getObject('config', function(err, data) {
				if (err) {
					throw err;
				}
				Importer.config('backedConfig', data || {});
				fs.outputJsonSync(BACKUP_CONFIG_FILE, Importer.config('backedConfig'));
				next();
			});
		}
	};

	Importer.setTmpConfig = function(next) {
		// get the nbb backedConfigs, change them, then set them back to the db
		// just to make the transition a little less flexible
		// yea.. i dont know .. i have a bad feeling about this
		var config = nodeExtend(true, {}, Importer.config().backedConfig, Importer.config().nbbTmpConfig);

		// if you want to auto confirm email, set the host to null, if there is any
		// this will prevent User.sendConfirmationEmail from setting expiration time on the email address
		// per https://github.com/designcreateplay/NodeBB/blob/master/src/user.js#L458'ish
		if (Importer.config().autoConfirmEmails) {
			config['email:smtp:host'] = '';
		}

		db.setObject('config', config, function(err){
			if (err) {
				throw err;
			}

			Meta.configs.init(next);
		});
	};

	// im nice
	Importer.restoreConfig = function(next) {
		if (fs.existsSync(BACKUP_CONFIG_FILE)) {
			Importer.config('backedConfig', fs.readJsonFileSync(BACKUP_CONFIG_FILE));

			db.setObject('config', Importer.config().backedConfig, function(err){
				if (err) {
					Importer.warn('Something went wrong while restoring your nbb configs');
					Importer.warn('here are your backed-up configs, you do it manually');
					Importer.warn(JSON.stringify(Importer.config().backedConfig));
					return next();
				}

				Importer.success('Config restored:' + JSON.stringify(Importer.config().backedConfig));
				fs.removeSync(BACKUP_CONFIG_FILE);

				Meta.configs.init(function(err) {
					if (err) {
						Importer.warn('Could not re-init Meta configs, just restart NodeBB, you\'ll be fine');
					}

					next();
				});
			});
		} else {
			Importer.warn('Could not restore NodeBB tmp configs, because ' + BACKUP_CONFIG_FILE + ' does not exist');
			next();
		}
	};

	// aka forums
	Importer.makeModeratorOnAllCategories = function(uid, timestamp, done) {
		Data.eachCategory(function(category, next) {
					groupsJoin('group:cid:' + category.cid + ':privileges:mods:members', uid, timestamp, function(err) {
						next();
					});
				},
				{async: true, eachLimit: 10},
				done);
	};

	// which of the values is falsy
	Importer.whichIsFalsy = function(arr){
		for (var i = 0; i < arr.length; i++) {
			if (!arr[i])
				return i;
		}
		return null;
	};

	// a helper method to generate temporary passwords
	Importer.genRandPwd = function(len, chars) {
		var index = (Math.random() * (chars.length - 1)).toFixed(0);
		return len > 0 ? chars[index] + Importer.genRandPwd(len - 1, chars) : '';
	};

	// todo: i think I got that right?
	Importer.cleanUsername = function(str) {
		str = str.replace(/[^\u00BF-\u1FFF\u2C00-\uD7FF\-.*\w\s]/gi, '');
		// todo: i don't know what I'm doing HALP
		return str.replace(/ /g,'').replace(/\*/g, '').replace(/æ/g, '').replace(/ø/g, '').replace(/å/g, '');
	};

	// todo: holy fuck clean this shit
	Importer.makeValidNbbUsername = function(_username, _alternativeUsername) {
		var _userslug = utils.slugify(_username || '');

		if (utils.isUserNameValid(_username) && _userslug) {
			return {username: _username, userslug: _userslug};

		} else {
			var username = Importer.cleanUsername(_username);
			var userslug = utils.slugify(username);

			if (utils.isUserNameValid(username) && userslug) {
				return {username: username, userslug: userslug};

			} else if (_alternativeUsername) {

				var _alternativeUsernameSlug = utils.slugify(_alternativeUsername);

				if (utils.isUserNameValid(_alternativeUsername) && _alternativeUsernameSlug) {
					return {username: _alternativeUsername, userslug: _alternativeUsernameSlug};

				} else {

					var alternativeUsername = Importer.cleanUsername(_alternativeUsername);
					var alternativeUsernameSlug = utils.slugify(alternativeUsername);

					if (utils.isUserNameValid(alternativeUsername) && alternativeUsernameSlug) {
						return {username: alternativeUsername, userslug: alternativeUsernameSlug};
					} else {
						return {username: null, userslug: null};
					}
				}
			} else {
				return {username: null, userslug: null};
			}
		}
	};

	Importer.emit = function () {
		var args = Array.prototype.slice.call(arguments, 0);

		if (args && args[args.length - 1] !== 'logged') {
			Importer.log.apply(Importer, args);
		} else {
			args.pop();
		}

		args.unshift(args[0]);
		Importer._dispatcher.emit.apply(Importer._dispatcher, args);
	};

	Importer.on = function () {
		Importer._dispatcher.on.apply(Importer._dispatcher, arguments);
	};

	Importer.once = function () {
		Importer._dispatcher.once.apply(Importer._dispatcher, arguments);
	};

	Importer.removeAllListeners = function () {
		Importer._dispatcher.removeAllListeners();
	};

	Importer.warn = function() {
		var args = _.toArray(arguments);
		args[0] = '[' + (new Date()).toISOString() + '] ' + args[0];

		args.unshift('importer.warn');
		args.push('logged');
		Importer.emit.apply(Importer, args);
		args.unshift(logPrefix);
		args.pop();

		console.warn.apply(console, args);
	};

	Importer.log = function() {
		if (!Importer.config.verbose) {
			return;
		}

		var args = _.toArray(arguments);
		args[0] = '[' + (new Date()).toISOString() + '] ' + args[0];

		args.unshift('importer.log');
		args.push('logged');

		if (Importer.config.clientLog) {
			Importer.emit.apply(Importer, args);
		}
		args.unshift(logPrefix);
		args.pop();
		if (Importer.config.serverLog) {
			console.log.apply(console, args);
		}
	};

	Importer.success = function() {
		var args = _.toArray(arguments);
		args[0] = '[' + (new Date()).toISOString() + '] ' + args[0];
		args.unshift('importer.success');
		args.push('logged');
		Importer.emit.apply(Importer, args);
		args.unshift(logPrefix);
		args.pop();

		console.log.apply(console, args);
	};

	Importer.error = function() {
		var args = _.toArray(arguments);
		args[0] = '[' + (new Date()).toISOString() + '] ' + args[0];
		args.unshift('importer.error');
		args.push('logged');
		Importer.emit.apply(Importer, args);
		args.unshift(logPrefix);
		args.pop();

		console.error.apply(console, args);
	};

	Importer.config = function(config, val) {
		if (config != null) {
			if (typeof config === 'object') {
				Importer._config = config;
			} else if (typeof config === 'string') {
				if (val != null) {
					Importer._config = Importer._config || {};
					Importer._config[config] = val;
				}
				return Importer._config[config];
			}
		}
		return Importer._config;
	};

	Importer.deleteTmpImportedSetsAndObjects = function(done) {
		var phasePrefix = 'deleteTmpImportedSetsAndObjects';
		async.series(['users', 'groups', 'categories', 'topics', 'posts', 'messages', 'votes', 'bookmarks']
				.reduce(function(series, current) {
					var Current = current[0].toUpperCase() + current.slice(1);

					series.push(function(next) {
						Importer.phase(phasePrefix + Current + 'Start');
						Data['deleteImported' + Current](
								function(err, progress) {
									Importer.progress(progress.count, progress.total);
								},
								function(err) {
									Importer.progress(1, 1);
									Importer.phase(phasePrefix + Current + 'Done');
									next();
								});
					});
					return series;
				}, []), done);
	};

})(module.exports);
