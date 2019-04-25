
const path = require('path');
const fs = require('fs');
const { assert } = require('chai');
const nbbRequire = require('nodebb-plugin-require');
const pkg = require('../package.json');


const Data = require('../server/helpers/data');

describe(`${pkg.name}@${pkg.version} test`, () => {
  before((done) => {
    done();
  });

  it('find correct NodeBB path', (done) => {
    assert.equal(nbbRequire.isNodebbDirectory(nbbRequire.fullpath), true);
    done();
  });

  after((done) => {
    done();
  });
});
