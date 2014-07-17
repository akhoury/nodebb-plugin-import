var fs = require('fs-extra');
// copy my test data over, so they won't get overwritten, and I get to use them over and over
fs.copySync('../test/storage', '../storage');

var Import = require(path.resolve('./lib/import.js'));
var imprt = new Import(config);

imprt.on('init.done', function(){
	// todo: overwrite dispatcher scope to the Import instance
	imprt.start();
});
imprt.init();
