
(function (module) {
  const nbbRequire = require('nodebb-plugin-require');
  const _ = require('underscore');
  const async = require('async');

  // nbb-core
  const privileges = nbbRequire('src/privileges');
  const moderatorsOnlyPrivileges = ['purge', 'moderate'];
  const generalUserPrivileges = _.without.apply(_, [privileges.userPrivilegeList].concat(moderatorsOnlyPrivileges));

  privileges.categories.allowGroupOnCategory = function (groupName, cid, callback) {
    privileges.categories.give(generalUserPrivileges, cid, groupName, callback);
  };

  privileges.categories.disallowGroupOnCategory = function (groupName, cid, callback) {
    async.parallel([
      async.apply(privileges.categories.rescind, privileges.groupPrivilegeList, cid, groupName),
      async.apply(privileges.categories.rescind, privileges.userPrivilegeList, cid, groupName),
    ], callback);
  };

  module.exports = privileges;
}(module));
