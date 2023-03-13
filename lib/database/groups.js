const nbbRequire = require('nodebb-plugin-require')
const async = require('async')
const _ = require('lodash')
const db = require('./')
const Data = require('../helpers/data')

// nbb-core
const Groups = nbbRequire('src/groups')
const meta = nbbRequire('src/meta')
const slugify = nbbRequire('src/slugify')

Groups.import = () => {
    throw new Error('not implemented')
}

Groups.batchImport = async (array, options = {}) => {
    let index = 0
    await async.eachSeries(array, async (data) => {
        await Groups.import(data, options)
        options.onProgress && options.onProgress(err, { data, index: ++index })
    })
}

Groups.setImported = (_gid, gidOrGname, group) => {
    return Data.setImported('_imported:_groups', '_imported_group:', _gid, gidOrGname, group)
}

Groups.getImported = (_gid) => {
    return Data.getImported('_imported:_groups', '_imported_group:', _gid)
}

Groups.deleteImported = (_gid) => {
    return Data.deleteImported('_imported:_groups', '_imported_group:', _gid)
}

Groups.deleteEachImported = (options) => {
    return Data.deleteEachImported('_imported:_groups', '_imported_group:', options)
}

Groups.isImported = (_gid) => {
    return Data.isImported('_imported:_groups', _gid)
}

Groups.eachImported = (iterator, options) => {
    return Data.each('_imported:_groups', '_imported_group:', iterator, options)
}

Groups.countImported = () => {
    return Data.count('_imported:_groups')
}

Groups.count = () => {
    return Data.count('groups:createtime')
}

Groups.each = (iterator, options) => {
    return Data.each('groups:createtime', 'group:', iterator, options)
}

Groups.processNamesSet = (process, options) => {
    return Data.processIdsSet('groups:createtime', process, options)
}

Groups.processSet = (process, options) => {
    return Data.processSet('groups:createtime', 'group:', process, options)
}

Groups.joinAt = async (name, uid, timestamp) => {
    const names = [].concat(name)
    await Groups.join(names, uid)
    await Promise.all(names.map(name => db.sortedSetAdd(`group:${name}:members`, timestamp, uid)))
}

// nodebb/src/groups.create.js
// This function throws an error
// so I copy pasted the code and returned a boolean instead
Groups.validateName = (name) => {
    if (!name) {
        return false
    }

    if (typeof name !== 'string') {
        return false
    }

    if (!Groups.isPrivilegeGroup(name) && name.length > meta.config.maximumGroupNameLength) {
        return false
    }

    if (name === 'guests' || (!Groups.isPrivilegeGroup(name) && name.includes(':'))) {
        return false
    }

    if (name.includes('/') || !slugify(name)) {
        return false
    }

    return true
}

module.exports = Groups
