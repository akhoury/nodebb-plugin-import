const db = require('./')
const async = require('async')
const Data = require('../helpers/data')

const Rooms = {}

Rooms.import = async () => {
    throw new Error('not implemented')
}

Rooms.batchImport = async (array, options = {}) => {
    let index = 0

    await async.eachSeries(array, async (record) => {
        const data = await Rooms.import(record, options)
        options.onProgress && options.onProgress(null, {
            data,
            index: ++index
        })
    })
}

Rooms.setImported = (_rid, rid, room) => {
    return Data.setImported('_imported:_rooms', '_imported_room:', _rid, rid, room)
}

Rooms.getImported = (_rid, callback) => {
    return Data.getImported('_imported:_rooms', '_imported_room:', _rid)
}

Rooms.deleteImported = (_rid) => {
    return Data.deleteImported('_imported:_rooms', '_imported_room:', _rid)
}

Rooms.deleteEachImported = (options = {}) => {
    return Data.deleteEachImported('_imported:_rooms', '_imported_room:', options)
}

Rooms.isImported = (_rid) => {
    return Data.isImported('_imported:_rooms', _rid)
}

Rooms.eachImported = (iterator, options = {}) => {
    return Data.each('_imported:_rooms', '_imported_room:', iterator, options)
}

Rooms.countImported = () => {
    Data.count('_imported:_rooms')
}

Rooms.count = () => db.keys('chat:room:*')

Rooms.each = async (iterator, options = {}) => {
    const prefix = 'chat:room:'
    const keys = await db.keys(`${prefix}*`)
    await async.mapLimit(keys, options.batch || Data.DEFAULT_BATCH_SIZE, async (key) => {
        const room = await db.getObject(key)
        if (room) {
            room.roomId = key.replace(prefix, '')
        }
        await iterator(room)
    })
}

module.exports = Rooms