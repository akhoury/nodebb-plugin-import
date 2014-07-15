var argv = require('optimist').argv,
	fs = require('fs-extra'),
	path = require('path'),

	usage = function(notice) {
		if (notice) console.log('\n' + notice);

		console.log(+''
				+ '\nUsage: node import.js --storage="path/to/storage" --log="debug" --flush --convert="bbcode-to-md"'
				+ '\n\nthis tool will import your well structured data, into NodeBB database of choice, see readme for files structures'
				+ '\n-s | --storage : [REQUIRED unless you pass in a --config file with storageDir property in it, but the cmd line one will take precedence] where your storage dir is'
				+ '\n-l | --log	: [OPTIONAL] log level, defaults to "debug", you can pass multiple comma separated i.e. "info,warn,error"'
				+ '\n-f | --flush : [OPTIONAL] if you want to flush the db and start over, do not use it if you\'re trying to pick up where you left off'
				+ '\n-t | --convert : [OPTIONAL] if you want to attempt and convert the post content, and user signatures, currently support "html-to-md" or "bbcode-to-md"'
				+ '\n-c | --config	: [OPTIONAL] input config file, see ./lib/import.js: Import.config for defaults and structure'
				+ '\n\n--copy-from-test : [OPTIONAL][DEV-ONLY][IGNORE] I use it to copy ./test/storage to ./storage, so I could test this script easily, ignore it'
		);
	},

	error = function (msg) {
		usage();
		throw new Error(msg);
	};

var configFile = argv.c || argv.config || '',
	config = {};

if (configFile) {
	configFile = path.resolve(configFile);
	if (fs.existsSync(configFile)) {
		config = fs.readJsonSync(configFile);
	}
}

config.storageDir = argv.s || argv.storage || config.storageDir;

if (config.storageDir) {
	config.log = argv.l || argv.log || config.log;

	config.nbb = config.nbb || {};
	config.nbb.setup = config.nbb.setup || {};
	config.nbb.setup.runFlush = argv.f || argv.flush ? true : config.nbb.setup.runFlush;

	config.convert = argv.t || argv.convert || config.convert;

	// dev only
	if (argv['copy-from-test'])
		fs.copySync(path.resolve('./test/storage'), config.storageDir);

	var Import = require(path.resolve('./lib/import.js'));
	var imprt = new Import(config);

	imprt.on('ready', function() {
		imprt.start();
	});

} else {
	error ('You must provide a storage dir, either in a --config file or using the --storage flag');
}
