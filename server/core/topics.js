//var Topics = require('../../../src/topics.js');



(function(module) {
	var nbbpath = require('nbbpath');
	var Topics = nbbpath.require('/src/topics.js');

  // use uid=1 assuming it's the main admin

	Topics.tools.forcePurge = function (tid, callback) {
		return Topics.tools.purge(tid, 1, callback);
	}

	Topics.tools.forceLock = function (tid, callback) {
		return Topics.tools.lock(tid, 1, callback);
	}

	Topics.tools.forceUnLock = function (tid, callback) {
		return Topics.tools.unlock(tid, 1, callback);
	}

	Topics.tools.forcePin = function (tid, callback) {
		return Topics.tools.pin(tid, 1, callback);
	}

	Topics.tools.forceUnpin = function (tid, callback) {
    return Topics.tools.unpin(tid, 1, callback);
	}

	module.exports = Topics;

}(module));