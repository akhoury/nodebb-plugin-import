
var path = require('path');
var fs = require('fs-extra');

var filepath = function (type) {
  return path.join(__dirname, PREFIX + type);
};

var checkSync = function (type) {
  var dirty = !!fs.existsSync(filepath(type));
  CACHE[type] = dirty;
  return dirty;
};

var cleanSync = function () {
  TYPES.forEach(function (type) {
      fs.removeSync(filepath(type));
  });
};

var CACHE = {};
var PREFIX = 'tmp/importer.dirty.';

var TYPES = [
  'groups',
  'categories',
  'users',
  'rooms',
  'messages',
  'topics',
  'posts',
  'votes',
  'bookmarks'
];

var dirtyIndex = null;
TYPES.some(function (type, index) {
  if (checkSync(type)) {
    dirtyIndex = index;
    return true;
  }
});

var SKIP = {};
TYPES.forEach(function (type, index) {
  if (dirtyIndex != null && index < dirtyIndex)  {
    SKIP[type] = true;
  }
});

module.exports = {

  filpath: filepath,

  checkSync: checkSync,

  cleanSync: cleanSync,

  writeSync: function (type) {
    return fs.writeFileSync(filepath(type), +new Date(), {encoding: 'utf8'});
  },

  remove: function (type, next) {
    fs.remove(filepath(type), function (err, response) {
      if (!err) {
        delete CACHE[type];
      }
       next && next(err, response)
    });
  },

  are: function (type, checkSyncfs) {
    if (checkSyncfs) {
      return checkSync(type);
    }
    return !!CACHE[type];
  },

  any: function () {
    return TYPES.some(function (type) {
      return checkSync(type);
    });
  },

  skip: function (type) {
    return SKIP[type];
  }
};

