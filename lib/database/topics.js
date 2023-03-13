const nbbRequire = require('nodebb-plugin-require')
const async = require('async')
const Data = require('../helpers/data')

const Topics = nbbRequire('src/topics')

Topics.import = async () => {
    throw new Error('not implemented')
}

Topics.batchImport = async (array, options = {}) => {
    let index = 0

    await async.eachSeries(array, async (record) => {
        const data = await Topics.import(record, options)
        options.onProgress && options.onProgress(null, {
            data,
            index: ++index
        })
    })
}

Topics.setImported = async (_tid, tid, topic) => {
    return Data.setImported('_imported:_topics', '_imported_topic:', _tid, tid, topic)
}

Topics.getImported = async (_tid) => {
    return Data.getImported('_imported:_topics', '_imported_topic:', _tid)
}

Topics.deleteImported = async (_tid) => {
    return Data.deleteImported('_imported:_topics', '_imported_topic:', _tid)
}

Topics.deleteEachImported = async (options = {}) => {
    return Data.deleteEachImported('_imported:_topics', '_imported_topic:', options)
}

Topics.isImported = async (_tid) => {
    return Data.isImported('_imported:_topics', _tid)
}

Topics.eachImported = async (iterator, options = {}) => {
    return Data.each('_imported:_topics', '_imported_topic:', iterator, options)
}

Topics.countImported = async () => {
    return Data.count('_imported:_topics')
}

Topics.count = async () => {
    return Data.count('topics:tid')
}

Topics.each = async (iterator, options = {}) => {
    return Data.each('topics:tid', 'topic:', iterator, options)
}

Topics.processNamesSet = async (process, options = {}) => {
    return Data.processIdsSet('topics:tid', process, options)
}

Topics.processSet = async (process, options = {}) => {
    return Data.processSet('topics:tid', 'topic:', process, options)
}

Topics.tools.forcePurge = async (tid) => {
    return Topics.tools.purge(tid, 1)
}

Topics.tools.forceLock = async (tid) => {
    return Topics.tools.lock(tid, 1)
}

Topics.tools.forceUnLock = async (tid) => {
    return Topics.tools.unlock(tid, 1)
}

Topics.tools.forcePin = async (tid) => {
    return Topics.tools.pin(tid, 1)
}

Topics.tools.forceUnpin = async (tid) => {
    return Topics.tools.unpin(tid, 1)
}

module.exports = Topics