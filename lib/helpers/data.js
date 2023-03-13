const nbbRequire = require('nodebb-plugin-require')
const async = require('async')
const helpers = require('./')
const db = require('../database')
const utils = require('../../static/lib/utils')

const batch = nbbRequire('src/batch')
const nconf = nbbRequire('nconf')

const DEFAULT_BATCH_SIZE = 100
const Data = { DEFAULT_BATCH_SIZE }

Data.count = (setKey) => db.sortedSetCard(setKey)

Data.each = (setKey, prefixEachId, iterator, options = {}) => {
    const processCallback = async (records) => {
        if (options.async) {
            if (options.eachLimit) {
                await async.eachLimit(records, options.eachLimit, iterator)
            } else {
                await async.each(records, iterator)
            }
        } else {
            records.forEach(iterator)
        }
    }
    return Data.processSet(setKey, prefixEachId, processCallback, options)
}

Data.processSet = (setKey, prefixEachId, process, options = {}) => {
    const processCallback = async (ids) => {
        const keys = ids.map(id => prefixEachId + id)
        const objects = await db.getObjects(keys)
        await process(objects)
    }
    return batch.processSortedSet(setKey, processCallback, options)
}

Data.processIdsSet = async (setKey, process, options = {}) => {
    options.doneIf = typeof options.doneIf === 'function' ? options.doneIf : function () { }
    const batch = options.batch || DEFAULT_BATCH_SIZE

    if (nconf.get('database') == 'mongo' && !utils.isNumber(options.alwaysStartAt)) {
        const arr = await db.client.collection('objects')
            .find({ _key: setKey })
            .sort({ score: 1 })
            .project({ _id: 0, value: 1 })
            .batchSize(batch)
            .toArray()

        const ids = arr.map(obj => obj.value)

        return await process(ids)
    }

    let start = options.alwaysStartAt || 0
    let end = batch
    let done = false

    await helpers.promiseWhile(() => !done, async () => {
        const ids = await db.getSortedSetRange(setKey, start, end)
        if (!ids.length || options.doneIf(start, end, ids)) {
            done = true
            return
        }
        await process(ids)
        start += utils.isNumber(options.alwaysStartAt) ? options.alwaysStartAt : batch + 1
        end = start + batch
    })
}

Data.isImported = (setKey, _id) => db.isSortedSetMember(setKey, _id)

Data.getImported = async (setKey, objPrefix, _id) => {
    const result = await Data.isImported(setKey, _id)
    if (!result) {
        return undefined
    }
    return await db.getObject(objPrefix + _id)
}

Data.setImported = (setKey, objPrefix, _id, score, data) => {
    delete data._typeCast   
    delete data.parse
    delete data._key // for mongo

    if (typeof score !== 'number' || isNaN(score)) {
        score = +new Date() // for redis, zadd score must be a number
    }

    return Promise.all([
        db.sortedSetAdd(setKey, score, _id),
        db.setObject(objPrefix + _id, data)
    ])
}

Data.deleteImported = async (setKey, objPrefix, _id) => {
    await db.sortedSetRemove(setKey, _id)
    await db.delete(objPrefix + _id)
}

Data.deleteEachImported = async (setKey, objPrefix, options = {}) => {
    let count = 1
    options.alwaysStartAt = options.alwaysStartAt || 0
    const total = await Data.count(setKey)
    const processCallback = async (ids) => {
        await async.each(ids, async (_id) => {
            await Data.deleteImported(setKey, objPrefix, _id)
            options.onProgress && options.onProgress(err, { total, count: count++, percentage: (count / total) })
        })
    }
    await batch.processSortedSet(setKey, processCallback, options)
}

module.exports = Data
