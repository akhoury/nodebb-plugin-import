const nbbRequire = require('nodebb-plugin-require')
const async = require('async')
const extend = require('extend')

// nbb-core
const Messages = nbbRequire('src/messaging')

// custom
const Data = require('../helpers/data')
const User = require('./users')
const db = require('./')

const Messaing = {}

Messages.import = async (data, options = {}) => {
    throw new Error('not implemented')
}

Messages.batchImport = async (array, options = {}) => {
    let index = 0
    await async.eachSeries(array, async (record) => {
        const data = await Messages.import(record, options)
        options.onProgress && options.onProgress(null, {
            data,
            index: ++index
        })
    })
}

Messages.newRoomWithNameAndTimestamp = async (fromUid, toUids, roomName, timestamp) => {
    const roomId = await Messages.newRoom(fromUid, toUids)
    await Messages.renameRoom(fromUid, roomId, roomName)
    const uids = [fromUid].concat(toUids).sort()
    const results = await Promise.all([
        db.sortedSetAdd(`chat:room:${roomId}:uids`, timestamp, fromUid),
        db.sortedSetAdd(`chat:room:${roomId}:uids`, uids.map(() => timestamp), uids),
        db.sortedSetsAdd(uids.map(uid => `uid:${uid}:chat:rooms`), timestamp, roomId),
        Messages.getRoomData(roomId)
    ])

    return results[3]
}

Messages.setImported = (_mid, uid, message) => {
    return Data.setImported('_imported:_messages', '_imported_message:', _mid, uid, message)
}

Messages.getImported = (_mid) => {
    return Data.getImported('_imported:_messages', '_imported_message:', _mid)
}

Messages.deleteImported = (_mid) => {
    return Data.deleteImported('_imported:_messages', '_imported_message:', _mid)
}

Messages.deleteEachImported = (options = {}) => {
    return Data.deleteEachImported('_imported:_messages', '_imported_message:', options)
}

Messages.isImported = (_mid) => {
    return Data.isImported('_imported:_messages', _mid)
}

Messages.eachImported = function (iterator, options = {}) {
    return Data.each('_imported:_messages', '_imported_message:', iterator, options)
}

Messages.countImported = ()  => {
    return Data.count('_imported:_messages')
}

Messages.count = () => db.keys('message:*')

Messages.each = async (iterator, options = {}) => {
    const prefix = 'message:'
    const keys = await db.keys(`${prefix}*`)
    await async.mapLimit(keys, options.batch || 100, async (key) => {
        const message = await db.getObject(key)
        if (message) {
            message.mid = key.replace(prefix, '')
        }
        await iterator(message)
    })
}

module.exports = Messages