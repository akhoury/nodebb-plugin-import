
// todo: i think i need to start writing tests, this is getting out of hand;

var path = require("path");
var fs = require("fs");
var assert = require("chai").assert;
var pkg = require("../package.json");

var nbbpath = require("../server/helpers/nbbpath");

var Data = require("../server/helpers/data");

describe(pkg.name + "@" + pkg.version + " test", function() {

  before(function(done) {
    done();
  });

  it("find correct NodeBB path", function (done) {
    assert.equal(nbbpath.isNodebbDirectory(nbbpath.fullpath), true);
    done();
  });

  after(function(done) {
    done();
  });

});
