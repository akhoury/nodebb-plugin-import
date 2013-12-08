var fs = require('fs-extra');
// copy my test data over, so they won't get overwritten, and I get to use them over and over
fs.copySync('../test/storage', '../storage');

var Import = require('../lib/import.js');

new Import({}).start();
