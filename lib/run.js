var fs = require('fs-extra');

// copy my test data over
fs.copySync('../test/storage', '../storage');

var Import = require('./import.js');
new Import({}).start();

