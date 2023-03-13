const nbbRequire = require('nodebb-plugin-require')
const _ = require('lodash')

// nbb-core
const privileges = nbbRequire('src/privileges')
const moderatorsOnlyPrivileges = ['purge', 'moderate']
const generalUserPrivileges = _.without.apply(_, [privileges.userPrivilegeList].concat(moderatorsOnlyPrivileges))

privileges.categories.allowGroupOnCategory = (groupName, cid) => {
    return privileges.categories.give(generalUserPrivileges, cid, groupName)
}

privileges.categories.disallowGroupOnCategory = async (groupName, cid) => {
    return await Promise.all([
        privileges.categories.rescind(await privileges.categories.getGroupPrivilegeList(), cid, groupName),
        privileges.categories.rescind(await privileges.categories.getUserPrivilegeList(), cid, groupName)
    ])
}

module.exports = privileges