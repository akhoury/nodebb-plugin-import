//var Groups = require('../../../src/groups.js');

(function(module) {
  var nbbRequire = require('nodebb-plugin-require');
  var db = require('../helpers/database');

  // nbb-core
  var Groups = nbbRequire('/src/groups');

  // join with passed-in timestamp
  // [potential-nodebb-core]
  Groups.joinAt = function (name, uid, timestamp, callback) {
    Groups.join(name, uid, function(err, ret) {
      if (err) {
        return callback(err);
      }
      // partially undo what Group.join by replacing the timestamp
      // obviously if this was moved to core, we would re-write Group.join
      db.sortedSetAdd('group:' + name + ':members', timestamp, uid, callback)
    });
  };

  module.exports = Groups;

}(module));
