'use strict';

define('forum/quickstart', function () {
	var module = {};
	module.init = function () {
		$('#last-p').text('quickstart.js loaded!');
	};
	return module;
});
