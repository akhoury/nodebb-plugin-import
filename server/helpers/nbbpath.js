(function(module) {
	var path = require('path');
	var fs = require('fs-extra');
  var pkg;

	var isNodebbDirectory = function (dir) {
		try {
			pkg = fs.readJsonSync(path.join(dir, './package.json'));
			return pkg.name == "nodebb";
		} catch (e) {
			return false;
		}
	};

	var findNodebbDirectory = function (dir) {
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

  var fullpath = findNodebbDirectory(__dirname);

  var nbbpath = new String(fullpath); // String object so I can augment it with other functions :D

  var require = function (relative) {
    return require(path.join(fullpath, relative));
  };

	nbbpath.require = require;
	nbbpath.isNodebbDirectory = isNodebbDirectory;
	nbbpath.package = pkg;

	module.export = nbbpath;

}(module));

