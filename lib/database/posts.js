const nbbRequire = require('nodebb-plugin-require')
const db = require('./')
const async = require('async')
const Data = require('../helpers/data')

// nbb-core
const Posts = nbbRequire('src/posts')

Posts.import = async () => {
    throw new Error('not implemented')
}

Posts.batchImport = async (array, options = {}) => {
    await async.eachSeries(
        array,
        async (record) => {
            const data = await Posts.import(record, options)
            options.onProgress && options.onProgress(err, {
                data,
                index: ++index
            })
        }
    )
}

Posts.setImported = (_pid, pid, post) => {
    return Data.setImported('_imported:_posts', '_imported_post:', _pid, pid, post)
}

Posts.getImported = (_pid) => {
    return Data.getImported('_imported:_posts', '_imported_post:', _pid)
}

Posts.deleteImported = (_pid) => {
    return Data.deleteImported('_imported:_posts', '_imported_post:', _pid)
}

Posts.deleteEachImported = (options = {}) => {
    return Data.deleteEachImported('_imported:_posts', '_imported_post:', options)
}

Posts.isImported = (_pid) => {
    return Data.isImported('_imported:_posts', _pid)
}

Posts.eachImported = (iterator, options) => {
    return Data.each('_imported:_posts', '_imported_post:', iterator, options)
}

Posts.countImported = () => Data.count('_imported:_posts')

Posts.count = () => Data.count('posts:pid')

Posts.each = (iterator, options = {}) => {
    return Data.each('posts:pid', 'post:', iterator, options)
}

Posts.processNamesSet = (process, options = {}) => {
    return Data.processIdsSet('posts:pid', process, options)
}

Posts.processSet = (process, options = {}) => {
    return Data.processSet('posts:pid', 'post:', process, options)
}

module.exports = Posts