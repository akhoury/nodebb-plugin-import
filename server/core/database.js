(function(module) {
	var nodebbpath = require('nodebbpath');
	var winston  = require('winston');
	var async  = require('async');
	var path  = require('path');
	var nconf = require('nconf');

	nconf.file({file: path.join(nodebbpath, '/config.json') });

	var dbType = nconf.get('database');
	var productionDbConfig = nconf.get(dbType);

	var db = nodebbpath.require('/src/database');

	if (! db.client) {
		// init was not called (yet), most likely running import-standlone
		// todo: potential race condition here if it nodebb was in fact started, but its db.init() was too slow to be called
		nconf.set(dbType, productionDbConfig);
		db.init();
	}

	db.createObjectIndexes = function (callback) {
		if (dbType != "mongo") {
			return callback && callback();
		}
		async.parallel([
			async.apply(createIndex, 'objects', {_key: 1, score: -1}, {background: true}),
			async.apply(createIndex, 'objects', {_key: 1, value: -1}, {background: true, unique: true, sparse: true}),
			async.apply(createIndex, 'objects', {expireAt: 1}, {expireAfterSeconds: 0, background: true})
		], function(err) {
			callback(err);
		});
	}

	db.dropObjectIndexes = function (callback) {
		if (dbType != "mongo") {
			return callback && callback();
		}
		async.parallel([
			async.apply(dropIndex, 'objects', {_key: 1, score: -1}),
			async.apply(dropIndex, 'objects', {_key: 1, value: -1}),
			async.apply(dropIndex, 'objects', {expireAt: 1})
		], function(err) {
			callback(err);
		});
	}

	function createIndex(collection, index, options, callback) {
		db.collection(collection).ensureIndex(index, options, function(err) {
			if (err) {
				winston.error('Error creating index ' + err.message);
			}
			callback(err);
		});
	}

	function dropIndex(collection, index, callback) {
		db.collection(collection).dropIndex(index, function(err) {
			if (err) {
				winston.error('Error droping index ' + err.message);
			}
			callback(err);
		});
	}

	module.exports = db;
}(module));

