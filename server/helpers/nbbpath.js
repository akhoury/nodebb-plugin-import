var path = require('path');
var fs = require('fs-extra');

(function(module) {
  var nbbpath = {};

  var isNodebbDirectory = nbbpath.isNodebbDirectory = function (dir) {
		try {
      nbbpath.pkg = fs.readJsonSync(path.join(dir, './package.json'));
			return nbbpath.pkg.name == "nodebb";
		} catch (e) {
			return false;
		}
	};

	var findNodebbDirectory = nbbpath.findNodebbDirectory = function (dir) {
		while (dir) {
			if (isNodebbDirectory(dir)) {
				return dir;
			}
			var parts = dir.split(path.sep);
			parts.pop();
			dir = parts.join(path.sep);
		}
		throw new Error("Cannot find NodeBB installation path, are you sure you installed this module as a nodebb plugin? at least in '/path/to/nodebb/node_modules'?");
	};

  var fullpath = nbbpath.fullpath = findNodebbDirectory(__dirname);

  nbbpath.require = function (relative) {
    return require(path.join(fullpath, relative));
  };

	module.exports = nbbpath;
}(module));

