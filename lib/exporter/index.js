const nbbRequire = require('nodebb-plugin-require')
const _ = require('lodash')
const npm = require('npm-programmatic')
const path = require('path')

const utils = require('../../static/lib/utils')
const helpers = require('../helpers')

const COUNT_BATCH_SIZE = 600000
const DEFAULT_EXPORT_BATCH_SIZE = 600000

const Exporter = {
    _exporter: null,
    config: null,
    npm: {
        cwd: path.resolve('..', __dirname),
        save: true
    }
}

const safeRequire = (moduleName) => {
    let module = null
    try {
        module = require(require.resolve(moduleName))
    } catch (e) {
        module = nbbRequire(moduleName)
    }
    return module
}

const getModuleId = function (module) {
    if (module.indexOf('github.com') > -1) {
        return module.split('/').pop().split('#')[0]
    }
    return module.split('@')[0]
}

Exporter.init = async (config) => {
    Exporter.config = config.exporter || {}
    const module = config.exporter.module
    const mid = getModuleId(module)
    let _exporter = null
    if (!config.exporter.skipInstall) {
        // todo: await install here config.exporter.module
        _exporter = safeRequire(mid)
        if (!_exporter) {
            console.log('installing ' + module)
            await npm.install(module, Exporter.npm)
            _exporter = safeRequire(mid)
        }
    }
    // todo: Exporter._exporter = safe require
    Exporter._exporter = _exporter
}

Exporter.setup = () => {
    return new Promise((resolve, reject) => {
        Exporter._exporter.setup(Exporter.config, (err, result) => {
            if (err) {
                return reject(err)
            }
            return resolve(result)
        })
    })
}

Exporter.exportType = async (type, process, options = {}) => {
    options.doneIf = typeof options.doneIf === 'function' ? options.doneIf : function () {}
    const batch = options.batch || Exporter._exporter.DEFAULT_EXPORT_BATCH_SIZE || DEFAULT_EXPORT_BATCH_SIZE
    let start = options.start || 0
    const limit = options.limit || batch
    let done = false

    const Type = type[0].toUpperCase() + type.substr(1).toLowerCase()
    const fnName = `get${Type}`

    await helpers.promiseWhile(() => !done, async () => {
        const map = await Exporter[fnName](start, limit)
        const arr = _.toArray(map)
        if (!arr.length || options.doneIf(start, limit, map, arr)) {
            done = true
            return
        }
        await process(map)
        start += utils.isNumber(options.alwaysStartAt) ? options.alwaysStartAt : batch + 1
    })
}

Exporter.exportGroups = (process, options) => {
    return Exporter.exportType('groups', process, options)
}

Exporter.exportCategories = (process, options) => {
    return Exporter.exportType('categories', process, options)
}

Exporter.exportUsers = (process, options) => {
    return Exporter.exportType('users', process, options)
}

Exporter.exportRooms = (process, options) => {
    return Exporter.exportType('rooms', process, options)
}

Exporter.exportMessages = (process, options) => {
    return Exporter.exportType('messages', process, options)
}

Exporter.exportTopics = (process, options) => {
    return Exporter.exportType('topics', process, options)
}

Exporter.exportPosts = (process, options) => {
    return Exporter.exportType('posts', process, options)
}

Exporter.exportVotes = (process, options) => {
    return Exporter.exportType('votes', process, options)
}

Exporter.exportBookmarks = (process, options) => {
    return Exporter.exportType('bookmarks', process, options)
}

Exporter.countAll = () => {
    return Promise.all([
        Exporter.countUsers,
        Exporter.countGroups,
        Exporter.countCategories,
        Exporter.countTopics,
        Exporter.countPosts,
        Exporter.countRooms,
        Exporter.countMessages,
        Exporter.countVotes,
        Exporter.countBookmarks,
    ])
}

Exporter.getType = (type, start, limit) => {
    const Type = type[0].toUpperCase() + type.substr(1).toLowerCase()
    const fnName = `getPaginated${Type}`
    return new Promise((resolve, reject) => {
        if (Exporter._exporter[fnName]) {
            return Exporter._exporter[fnName](start, limit, (err, map) => {
                if (err) {
                    return reject(err)
                }
                return resolve(map)
            })
        }
        console.warn(`${fnName} not implemented`)
        return resolve({})
    })
}

Exporter.getGroups = (start = 0, limit = 100) => {
    return Exporter.getType('groups', start, limit)
}

Exporter.getCategories = (start = 0, limit = 100) => {
    return Exporter.getType('categories', start, limit)
}

Exporter.getUsers = (start = 0, limit = 100) => {
    return Exporter.getType('users', start, limit)
}

Exporter.getRooms = (start = 0, limit = 100) => {
    return Exporter.getType('rooms', start, limit)
}

Exporter.getMessages = (start = 0, limit = 100) => {
    return Exporter.getType('messages', start, limit)
}

Exporter.getTopics = (start = 0, limit = 100) => {
    return Exporter.getType('topics', start, limit)
}

Exporter.getPosts = (start = 0, limit = 100) => {
    return Exporter.getType('posts', start, limit)
}

Exporter.getVotes = (start = 0, limit = 100) => {
    return Exporter.getType('votes', start, limit)
}

Exporter.getBookmarks = (start = 0, limit = 100) => {
    return Exporter.getType('bookmarks', start, limit)
}

Exporter.countType = (type) => {
    const Type = type[0].toUpperCase() + type.substr(1).toLowerCase()
    const fnName = `count${Type}`
    return new Promise(async (resolve, reject) => {
        if (Exporter._exporter[fnName]) {
            return Exporter._exporter[fnName]((err, count) => {
                if (err) {
                    return reject(err)
                }
                return resolve(count)
            })
        }

        let count = 0

        await Exporter.exportType(type, (map) => {
            count += _.toArray(map).length
        }, {
            batch: COUNT_BATCH_SIZE,
        })
        return resolve(count)
    })
}

Exporter.countGroups = () => {
    return Exporter.countType('groups')
}

Exporter.countCategories = () => {
    return Exporter.countType('categories')
}

Exporter.countUsers = () => {
    return Exporter.countType('users')
}

Exporter.countRooms = () => {
    return Exporter.countType('rooms')
}

Exporter.countMessages = () => {
    return Exporter.countType('messages')
}

Exporter.countPosts = () => {
    return Exporter.countType('posts')
}

Exporter.countTopics = () => {
    return Exporter.countType('topics')
}

Exporter.countVotes = () => {
    return Exporter.countType('votes')
}

Exporter.countBookmarks = () => {
    return Exporter.countType('bookmarks')
}

Exporter.eachTypeImmediateProcess = (type, obj, options = {}) => {
    const exporter = Exporter._exporter
    if (Exporter.supportsEachTypeImmediateProcess(type) && obj) {
        return exporter[`each${type[0].toUpperCase()}${type.slice(1)}ImmediateProcess`](obj, options)
    }
}

Exporter.supportsEachTypeImmediateProcess = (type) => {
    return Exporter._exporter && typeof Exporter._exporter[`each${type[0].toUpperCase()}${type.slice(1)}ImmediateProcess`] === 'function'
}

module.exports = Exporter