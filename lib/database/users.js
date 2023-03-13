const nbbRequire = require('nodebb-plugin-require')
const async = require('async')
const db = require('./')

// nbb-core
const User = nbbRequire('src/user')

// custom
const Data = require('../helpers/data')
const Groups = require('./groups')
const File = require('./file')

User.import = async (data, options) => {
    throw new Error('not implemented')
}

User.batchImport = async (array, options = {}) => {
    let index = 0

    await async.eachSeries(array, async (record) => {
        const data = await User.import(record, options)
        if (data._claimedOwnership) {
            options.adminTakeOwnership = false
        }

        options.onProgress && options.onProgress(err, {
            data,
            index: ++index
        })
    })
}

User.isFriends = (uid, toUid) => {
    const toUids = [].concat(toUid)
    return db.isSortedSetMembers(`uid:${uid}:friends`, toUids)
}

User.friend = (uid, toUid, timestamp = null) => {
    const now = timestamp || Date.now()
    return Promise.all([
        db.sortedSetAdd(`uid:${uid}:friends`, now, toUid),
        db.sortedSetRemove(`uid:${uid}:friends:pending`, toUid),
        db.sortedSetRemove(`uid:${uid}:friends:requests`, toUid),
        db.sortedSetAdd(`uid:${toUid}:friends`, now, uid),
        db.sortedSetRemove(`uid:${toUid}:friends:pending`, uid),
        db.sortedSetRemove(`uid:${toUid}:friends:requests`, uid)
    ])
}

User.setImported = (_uid, uid, user) => {
    return Data.setImported('_imported:_users', '_imported_user:', _uid, uid, user)
}

User.getImported = (_uid) => {
    return Data.getImported('_imported:_users', '_imported_user:', _uid)
}

User.deleteImported = (_uid) => {
    return Data.deleteImported('_imported:_users', '_imported_user:', _uid)
}

User.deleteEachImported = function (options) {
    return Data.deleteEachImported('_imported:_users', '_imported_user:', options)
}

User.isImported = (_uid) => {
    return Data.isImported('_imported:_users', _uid)
}

User.eachImported = (iterator, options) => {
    return Data.each('_imported:_users', '_imported_user:', iterator, options)
}

User.count = () => Data.count('users:joindate')

User.each = (iterator, options) => {
    return Data.each('users:joindate', 'user:', iterator, options)
}

User.processUidsSet = (process, options) => {
    return Data.processIdsSet('users:joindate', process, options)
}

User.processSet = (process, options) => {
    return Data.processSet('users:joindate', 'user:', process, options)
}

User.confirmEmail = (uid) => {
    // todo: gonna need to confirmation-code somehow and delete it from the set
    return User.setUserField(uid, 'email:confirmed', 1)
}

User.setReputation = async (uid, reputation) => {
    await db.sortedSetAdd('users:reputation', reputation, uid)
    await User.setUserField(uid, 'reputation', reputation)
}

User.makeAdministrator = (uid, joindate) => {
    return Groups.joinAt('administrators', uid, joindate)
}

User.makeModerator = (uid, cid, joindate) => {
    return Groups.joinAt(`cid:${cid}:privileges:mods:members`, uid, joindate)
}

User.setProfilePictureUrl = (uid, url) => {
    return User.setUserFields(uid, {
        uploadedpicture: url,
        picture: url
    })
}

User.setProfilePictureBlob = async (uid, blob, options = {}) => {
    const extension = options.extension || options.ext || '.png'
    const filename = options.filename || `profile_picture_${uid}${extension}`
    const folder = options.folder || 'profile_pictures'

    await File.saveBlobToLocal(filename, folder, blob)

    return User.setProfilePictureUrl(uid, ret.url)
}

module.exports = User
