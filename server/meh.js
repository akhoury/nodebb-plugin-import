var exporter  = require('./exporter.js');
var async = require('async');

exporter.once('exporter.ready', function() {
	var batchsize = 25000;

	console.log('serriesAll');
	async.series([
	/*		function(nextExport){
		    exporter.countAll(function(a) {
		        console.log('countedAll', a);
		        nextExport();
		    });
		},*/
		function(nextExport){
		    var c = 1;
		    exporter.exportUsers(function(err, map, arr, nextBatch) {
		        console.log('gotusers', 'error:' + err, 'arr.length:' + arr.length, 'batchcount:' + c++);
		        nextBatch();
		    },{batch: batchsize},function() {console.log('usersdone');nextExport();});
		},
		function(nextExport) {
			var c = 1;
			exporter.exportCategories(function (err, map, arr, nextBatch) {
				console.log('gotcategories', 'error:' + err, 'arr.length: ', arr.length, 'arr.length:' + arr.length, 'batchcount:' + c++);
				nextBatch();
			}, {}, function () {
				console.log('categoriesdone');
				nextExport();
			});
		},
		function(nextExport){
		    var c = 1;
		    exporter.exportTopics(function(err, map, arr, nextBatch) {
		        console.log('gottopics', 'error:' + err, 'arr.length:' + arr.length, 'batchcount:' + c++);
		        nextBatch();
		    },{batch: batchsize},function() {console.log('topicsdone');nextExport();});
		},
		function(nextExport){
		    var c = 1;
		    exporter.exportPosts(function(err, map, arr, nextBatch) {
		        console.log('gotposts', 'error:' + err, 'arr.length:' + arr.length, 'batchcount:' + c++);
		        nextBatch();
		    },{batch: batchsize},function() {console.log('postsdone');nextExport();});
		}
	], function() {
		console.log('done');
	});
});

exporter.init({
    exporter: {
        module: 'nodebb-plugin-import-wordpress',
        host: 'localhost',
        user: 'user',
        password: 'password',
        port: 3306,
        database: 'wp4_tiny',
        tablePrefix: 'wp_',
        skipInstall: true,
		custom: {
			bbpress: true
		}
    }
});