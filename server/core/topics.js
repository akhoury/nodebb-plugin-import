//var Topics = require('../../../src/topics.js');



(function(module) {
	var nbbpath = require('nbbpath');
	var Topics = nbbpath.require('/src/topics.js');

	Topics.tools.forceLock = function (tid, callback) {
		return Topics.setTopicField(tid, 'locked', 1, callback);
	}

	Topics.tools.forceUnLock = function (tid, callback) {
		return Topics.setTopicField(tid, 'locked', 0, callback);
	}

	module.exports = Topics;

}(module));