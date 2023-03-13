/**
 * You can run these tests by executing `npx mocha test/plugins-installed.js`
 * from the NodeBB root folder. The regular test runner will also run these
 * tests.
 *
 * Keep in mind tests do not activate all plugins, so if you are testing
 * hook listeners, socket.io, or mounted routes, you will need to add your
 * plugin to `config.json`, e.g.
 *
 * {
 *     "test_plugins": [
 *         "nodebb-plugin-quickstart"
 *     ]
 * }
 */

'use strict';

/* globals describe, it, before */

const assert = require('assert');

const db = require.main.require('./test/mocks/databasemock');

describe('nodebb-plugin-quickstart', () => {
	before(() => {
		// Prepare for tests here
	});

	it('should pass', (done) => {
		const actual = 'value';
		const expected = 'value';
		assert.strictEqual(actual, expected);
		done();
	});

	it('should load config object', async () => {	// Tests can be async functions too
		const config = await db.getObject('config');
		assert(config);
	});
});
