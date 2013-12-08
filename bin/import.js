var argv = require('optimist').argv,
	fs = require('fs-extra'),
	path = require('path'),

	usage = function(notice) {
		if (notice) console.log('\n' + notice);

		console.log(+''
			+ '\nUsage: node bin/import.js --storage="path/to/storage" --config="path/to/import.config.json" --log="debug" --flush '
			+ '\n\nthis tool will import your well structured data, into NodeBB database of choice, see readme for files structures'
			+ '\n-c | --config	: [REQUIRED] input config file'
			+ '\n-s | --storage	: [OPTIONAL-only if you already have it in config.json] where your storage dir is, will override the import.config.json value'
			+ '\n-l | --log	: [OPTIONAL] log level, WILL override whatever is in the import.config.json file, if none, defaults to "debug", i think'
			+ '\n-f | --flush : [OPTIONAL] if you want to flush the db and start over, WILL override the its value in import.config.json'

			+ '\n\n--copy-from-test : [OPTIONAL][DEV-ONLY][IGNORE] I use it to copy ./test/storage to ./storage, so I could test this script easily, ignore it'
		);
	},

	error = function (msg) {
		usage();
		throw new Error(msg);
	};

var configFile = argv.c || argv.config || '';
if (!configFile) error ('You must provide a config file');
configFile = path.join(__dirname, configFile);
if (!fs.existsSync(configFile)) error(configFile + ' does not exist or cannot be read.');
var config = fs.readJsonSync(configFile);

config.storageDir = argv.s || argv.storage || config.storageDir;

if (config.storageDir) {
	config.log = argv.l || argv.log || config.log;
	config.nbb.setup.runFlush = argv.f || argv.flush ? true : config.nbb.setup.runFlush;

	// dev only
	if (argv['copy-from-test'])
		fs.copySync('../test/storage', config.storageDir);

	var Import = require('../lib/import.js');

	new Import(config).start();

} else {
	error ('You must provide a storage dir, either in the config file or using the --storage flag');
}