var exporter  = require('./exporter.js');

exporter.once('exporter.ready', function() {
    var c = 1;
    var batchsize = 25000;
    
    async.series([
        function(nextExport){
            exporter.exportUsers(function(err, map, arr, nextBatch) {
                console.log('gotusers', err, Object.keys(map), arr.length, c++);
                nextBatch();
            },{batch: batchsize},function() {console.log('usersdone');nextExport();}); 
        },
        function(nextExport){
            exporter.exportCategories(function(err, map, arr, nextBatch) {
                console.log('gotcategories', err, Object.keys(map), arr.length, c++);
                nextBatch();
            },{batch: batchsize},function() {console.log('categoriesdone');nextExport();}); 
        },
        function(nextExport){
            exporter.exportTopics(function(err, map, arr, nextBatch) {
                console.log('gottopics', err, Object.keys(map), arr.length, c++);
                nextBatch();
            },{batch: batchsize},function() {console.log('topicsdone');nextExport();}); 
        },
        function(nextExport){
            exporter.exportPosts(function(err, map, arr, nextBatch) {
                console.log('gotposts', err, Object.keys(map), arr.length, c++);
                nextBatch();
            },{batch: batchsize},function() {console.log('postsdone');nextExport();}); 
        }
        ], function() {
        console.log('done');
    });
});

exporter.init({
    exporter: {
        module: 'nodebb-plugin-import-smf',
        host: 'localhost',
        user: 'user',
        password: 'password',
        port: 3306,
        database: 'smf_large',
        tablePrefix: 'yabbse_',
        skipInstall: true
    }
});


