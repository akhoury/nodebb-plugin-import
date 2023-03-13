const nbbRequire = require('nodebb-plugin-require')
const async = require('async')
const db = require('./')
const Data = require('../helpers/data')
const Categories = nbbRequire('src/categories')

Categories.import = async (data, options) => {
    throw new Error('not implemented')
}

Categories.batchImport = async (array, options = {}) => {
    let index = 0
    await async.eachSeries(array, async (data) => {
        await Categories.import(data, options)
        options.onProgress && options.onProgress(err, { data, index: ++index })
    })
}

Categories.setImported = (_cid, cid, category) => {
    return Data.setImported('_imported:_categories', '_imported:_category:', _cid, cid, category)
}

Categories.getImported = (_cid) => {
    return Data.getImported('_imported:_categories', '_imported:_category:', _cid)
}

Categories.deleteImported = (_cid) => {
    return Data.deleteImported('_imported:_categories', '_imported:_category:', _cid)
}

Categories.deleteEachImported = (options) => {
    return Data.deleteEachImported('_imported:_categories', '_imported:_category:', options)
}

Categories.isImported = (_cid) => {
    return Data.isImported('_imported:_categories', _cid)
}

Categories.eachImported = (iterator, options) => {
    return Data.each('_imported:_categories', '_imported:_category:', iterator, options)
}

Categories.countImported = () => {
    return Data.count('_imported:_categories')
}

Categories.count = () => {
    return Data.count('categories:cid')
}

Categories.each = (iterator, options) => {
    return Data.each('categories:cid', 'category:', iterator, options)
}

Categories.processCidsSet = (process, options) => {
    return Data.processIdsSet('categories:cid', process, options)
}

Categories.processSet = (process, options) => {
    return Data.processSet('categories:cid', 'category:', process, options)
}

Categories.adopt = async (parentCid, cid) => {
    const category = await Categories.getCategoryData(cid)
    await db.sortedSetRemove(`cid:${parseInt(category.parentCid || 0, 10)}:children`, cid)
    await db.setObjectField(`category:${cid}`, 'parentCid', parentCid)
    await db.sortedSetAdd(`cid:${parentCid}:children`, category.order || cid, cid)
}

Categories.orphan = (cid) => {
    return Categories.adopt(cid, 0)
}

Categories.abandon = (parentCid, cid) => {
    return Categories.orphan(cid)
}

Categories.reparent = (cid, parentCid) => {
    return Categories.adopt(parentCid, cid)
}

Categories.disable = (cid) => {
    return Categories.setCategoryField(cid, 'disabled', 1)
}

Categories.enable = (cid) => {
    return Categories.setCategoryField(cid, 'disabled', 0)
}

Categories.setMaximumTagd = (maxTags) => {
    return Categories.setCategoryField(cid, 'disabled', 0)
}

module.exports = Categories
