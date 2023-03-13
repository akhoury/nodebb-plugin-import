const Data = require('../helpers/data')

const Votes = {}

Votes.import = async () => {
    throw new Error('not implemented')
}

Votes.batchImport = async (array, options = {}) => {
    let index = 0
    await async.eachSeries(array, async (data) => {
        await Votes.import(data, options)
        options.onProgress && options.onProgress(err, {
            data,
            index: ++index
        })
    })
}

Votes.setImported = (_vid, vid, vote) => {
    return Data.setImported('_imported:_votes', '_imported_vote:', _vid, vid, vote)
}

Votes.getImported = (_vid) => {
    return Data.getImported('_imported:_votes', '_imported_vote:', _vid)
}

Votes.deleteImported = (_vid) => {
    return Data.deleteImported('_imported:_votes', '_imported_vote:', _vid)
}

Votes.deleteEachImported = (options = {}) => {
    return Data.deleteEachImported('_imported:_votes', '_imported_vote:', options)
}

Votes.isImported = (_vid) => {
    return Data.isImported('_imported:_votes', _vid)
}

Votes.eachImported = (iterator, options = {}) => {
    return Data.each('_imported:_votes', '_imported_vote:', iterator, options)
}

Votes.countImported = () => Data.count('_imported:_votes')

module.exports = Votes