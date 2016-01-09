(function(module) {
	var path = require('path');
	var fs = require('fs-extra');

	var isNodebbDirectory = function (dir) {
		try {
			var pkg = fs.readJsonSync(path.join(dir, './package.json'));
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
		throw new Error("Cannot find NodeBB installation path, are you sure you installed this module as a nodebb plugin?");
	};

	var fullpath = findNodebbDirectory(__dirname);

	var nbbpath = new String(fullpath); // String object so I can augment it with other functions :D

	nbbpath.require = function (relative) {
		return require(path.join(fullpath, relative));
	}

	nbbpath.isNodebbDirectory = isNodebbDirectory;

	module.export = nbbpath;

}(module));

