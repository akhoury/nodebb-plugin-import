
(function(module) {

	var nbbpath = require('./nbbpath.js');
	var Groups = require('./groups.js');
	var file = require('./file.js');

	var User = nbbpath.require('/src/user.js');

	User.import = function (data, options, callback) {
		var uid;

		async.waterfall([
			function(next) {
				User.create({
					username: data.username,
					email: data.email,
					password: data.password
				}, next);
			},

			function(userid, next) {
				uid = userid;
				next();
			},

			function(next) {
				if (data.picture) {
					return User.setProfilePictureUrl(uid, data.picture, next);
				}
				if (data.pictureBlob) {
					return User.setProfilePictureBlob(uid, data.pictureBlob, {filename: data.pictureFilename}, next);
				}
			},

			function(next) {
				var fields = {
					signature: data.signature || '',
					website: data.website || '',
					location: data.location || '',
					joindate: data.joindate || +new Date(),
					reputation: data.reputation || 0,
					profileviews: data.profileviews || 0,
					fullname: data.fullname || '',
					birthday: data.birthday || '',
					showemail: data.showemail ? 1 : 0,
					lastposttime: data.lastposttime || 0,
					// we're importing, no one is online
					status: 'offline',
					// don't ban anyone now, ban them later
					banned: 0,
				};

				if (data.lastonline) {
					fields.lastonline = data.lastonline;
				}

				fields._imported_original_ = JSON.stringify(data);

				User.setUserFields(uid, fields, next);
			},

			function(uid, next) {

				var isModerator = false;
				var isAdministrator = false;

				var groups = [].concat(data.groups)

					// backward compatible level field
					.concat((data.level || "").toLowerCase() == "administrator" ? "administrators" : [])
					.concat((data.level || "").toLowerCase() == "moderator" ? "moderators" : [])

					// filter out the moderator.
					.reduce(function (groups, group, index, arr) {
						if (group == "moderators" && !isModerator) {
							isModerator = true;
							return groups;
						}
						if (group == "administrators" && !isAdministrator) {
							isAdministrator = true;
						}
						groups.push(group);
						return groups;
					}, []);

				async.eachLimit(groups, 10, function (group, next) {
					Groups.joinAt(uid, group, next);
				}, next);
			}
		], function() {});
	};

	// [potential-nodebb-core]
	User.setRepuration = function (uid, reputation, callback) {
		async.series([
			async.apply(db.sortedSetRemove, 'users:reputation', uid),
			async.apply(db.sortedSetAdd, 'users:reputation', reputation, uid),
			async.apply(User.setUserField, uid, 'reputation', reputation),
		], callback);
	};

	// [potential-nodebb-core]
	User.makeAdministrator = function (uid, joindate, callback) {
		Groups.joinAt('administrators', uid, joindate, callback);
	};

	// [potential-nodebb-core]
	User.makeModerator = function (uid, cid, joindate) {
		Groups.joinAt('cid:' + cid + ':privileges:mods:members', uid, joindate, callback);
	};

	// [potential-nodebb-core]
	User.setProfilePictureUrl = function (uid, url, callback) {
		return User.setUserFields(uid, {uploadedpicture: url, picture: url}, callback);
	};

	// [potential-nodebb-core]
	User.setProfilePictureBlob = function (uid, blob, options, callback) {
		callback = arguments[arguments.length - 1];

		var extension = options.extension || options.ext || '.png';
		var filename = options.filename || 'profile_picture_' + uid + extension;
		var folder = options.folder || 'profile_pictures';

		File.saveBlobToLocal(filename, folder, blob, function(err, ret) {
			if (err) return callback(err);

			User.setProfilePictureUrl(uid, ret.url, callback);
		});
	};

	module.exports = User;

}(module));

//
//var Favourites = require('../../../src/favourites.js');
//var privileges = require('../../../src/privileges.js');
//var Meta = require('../../../src/meta.js');
//var Messaging = require('../../../src/messaging.js');
//var File = require('../../../src/file.js');
//var Topics = require('../../../src/topics.js');
//var Posts = require('../../../src/posts.js');
//var Categories = require('../../../src/categories.js');
//var db = module.parent.require('../../../src/database.js');