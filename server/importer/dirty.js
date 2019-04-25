
const path = require('path');
const fs = require('fs-extra');
const PREFIX = 'tmp/importer.dirty.';
const CACHE = {};
const TYPES = [
	'groups',
	'categories',
	'users',
	'rooms',
	'messages',
	'topics',
	'posts',
	'votes',
	'bookmarks',
];
const SKIP = {};

const filepath = function (type) {
	return path.join(__dirname, PREFIX + type);
};

const checkSync = function (type) {
	const dirty = !!fs.existsSync(filepath(type));
	CACHE[type] = dirty;
	return dirty;
};

const cleanSync = function () {
	TYPES.forEach((type) => {
		fs.removeSync(filepath(type));
	});
};


let dirtyIndex = null;
TYPES.some((type, index) => {
	if (checkSync(type)) {
		dirtyIndex = index;
		return true;
	}
});

TYPES.forEach((type, index) => {
	if (dirtyIndex != null && index < dirtyIndex) {
		SKIP[type] = true;
	}
});

module.exports = {

	filepath,

	checkSync,

	cleanSync,

	writeSync(type) {
		return fs.writeFileSync(filepath(type), +new Date(), { encoding: 'utf8' });
	},

	remove(type, next) {
		debugger;
		fs.remove(filepath(type), (err, response) => {
			if (!err) {
				delete CACHE[type];
			}
			next && next(err, response);
		});
	},

	are(type, checkSyncfs) {
		if (checkSyncfs) {
			return checkSync(type);
		}
		return !!CACHE[type];
	},

	any() {
		return TYPES.some(type => checkSync(type));
	},

	skip(type) {
		return SKIP[type];
	},
};
