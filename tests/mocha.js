
var path = require("path");
var fs = require("fs");
var assert = require("chai").assert;
var pkg = require("../package.json");

var nbbRequire = require("nodebb-plugin-require");

var Data = require("../server/helpers/data");

describe(pkg.name + "@" + pkg.version + " test", function() {

  before(function(done) {
    done();
  });

  it("find correct NodeBB path", function (done) {
    assert.equal(nbbRequire.isNodebbDirectory(nbbRequire.fullpath), true);
    done();
  });

  after(function(done) {
    done();
  });

});
