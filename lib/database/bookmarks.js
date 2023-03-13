const Data = require('../helpers/data')

const Bookmarks = {}

Bookmarks.setImported = (_bid, bid, bookmark) => {
    return Data.setImported('_imported:_bookmarks', '_imported_bookmark:', _bid, bid, bookmark)
}

Bookmarks.getImported = (_bid) => {
    return Data.getImported('_imported:_bookmarks', '_imported_bookmark:', _bid)
}

Bookmarks.deleteImported = (_bid) => {
    return Data.deleteImported('_imported:_bookmarks', '_imported_bookmark:', _bid)
}

Bookmarks.deleteEachImported = (options = {}) => {
    return Data.deleteEachImported('_imported:_bookmarks', '_imported_bookmark:', options)
}

Bookmarks.isImported = (_bid) => {
    return Data.isImported('_imported:_bookmarks', _bid)
}

Bookmarks.eachImported = (iterator, options = {}) => {
    return Data.each('_imported:_bookmarks', '_imported_bookmark:', iterator, options)
}

Bookmarks.countImported = () => {
    return Data.count('_imported:_bookmarks')
}

module.exports = Bookmarks