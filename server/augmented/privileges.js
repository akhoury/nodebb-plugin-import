
(function(module) {
  var nbbRequire = require('nodebb-plugin-require');

  // nbb-core
  var privileges = nbbRequire('src/privileges');

  privileges.categories.allowGroupOnCategory = function (groupName, cid, callback) {
    privileges.categories.give(privileges.userPrivilegeList, cid, groupName, callback);
  };

  privileges.categories.disallowGroupOnCategory = function (groupName, cid, callback) {
    privileges.categories.rescind(privileges.userPrivilegeList, cid, groupName, callback);
  };

  module.exports = privileges;

}(module));
