var exporter  = require('./exporter.js');

exporter.once('exporter.ready', function() {
    var c = 1;
    exporter.exportUsers(function(err, map, arr, nextBatch) {
        console.log('outertest', err, Object.keys(map), arr.length, c++);
        // setTimeout(nextBatch, 2500);
    },
    {
        batch: 5
    },
    function() {
        console.log('\n\n\n\nim done');
        process.exit();
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


