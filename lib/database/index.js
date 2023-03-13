const nbbRequire = require('nodebb-plugin-require')
const path = require('path')
const url = require('url')

const pkg = require(path.join(nbbRequire.fullpath, '/package.json'))
// lookup nconf
const nconf = nbbRequire('nconf')
let dbType

// nodebb/src/prestart
const loadConfig = (configFile) => {
    nconf.file({
        file: configFile,
    })

    nconf.defaults({
        base_dir: nbbRequire.fullpath,
        themes_path: path.join(nbbRequire.fullpath, '/node_modules'),
        upload_path: 'public/uploads',
        views_dir: path.join(nbbRequire.fullpath, 'build/public/templates'),
        version: pkg.version,
        isCluster: false,
        isPrimary: true,
        jobsDisabled: false,
    })

    const database = configFile.database

    dbType = database

    nconf.set('database', database)
    nconf.set(database, configFile[database])

    nconf.set('themes_path', path.resolve(nbbRequire.fullpath, nconf.get('themes_path')))
    nconf.set('core_templates_path', path.join(nbbRequire.fullpath, 'src/views'))
    nconf.set('base_templates_path', path.join(nconf.get('themes_path'), 'nodebb-theme-persona/templates'))
    nconf.set('upload_path', path.resolve(nconf.get('base_dir'), nconf.get('upload_path')))
    nconf.set('upload_url', '/assets/uploads')

    if (!nconf.get('sessionKey')) {
        nconf.set('sessionKey', 'express.sid')
    }

    nconf.set('url', configFile.url)

    if (process.env.url !== configFile.url) {
        process.env.url = configFile.url
    }

    if (nconf.get('url')) {
        nconf.set('url', nconf.get('url').replace(/\/$/, ''))
        nconf.set('url_parsed', url.parse(nconf.get('url')))
        // Parse out the relative_url and other goodies from the configured URL
        const urlObject = url.parse(nconf.get('url'))
        const relativePath = urlObject.pathname !== '/' ? urlObject.pathname.replace(/\/+$/, '') : ''
        nconf.set('base_url', `${urlObject.protocol}//${urlObject.host}`)
        nconf.set('secure', urlObject.protocol === 'https:')
        nconf.set('use_port', !!urlObject.port)
        nconf.set('relative_path', relativePath)
        if (!nconf.get('asset_base_url')) {
            nconf.set('asset_base_url', `${relativePath}/assets`)
        }
        nconf.set('port', nconf.get('PORT') || nconf.get('port') || urlObject.port || (nconf.get('PORT_ENV_VAR') ? nconf.get(nconf.get('PORT_ENV_VAR')) : false) || 4567)
    }
}

const mongoKeys = async (key) => {
    try {
        key = key[0] === '*' ? key : `^${key}`
        const regex = new RegExp(key.replace(/\*/g, '.*'))

        const arr = await db.client.collection('objects').find({ _key: { $regex: regex } }).toArray()
        return arr ? arr.map((v, i) => v._key) : []
    } catch (err) {
        return []
    }
}

// prestart phase
const prestart = nbbRequire('src/prestart')
const configFile = nbbRequire('config.json')
loadConfig(configFile)
prestart.setupWinston()

const db = nbbRequire('src/database')

db.keys = db.keys || (function () {
    switch (dbType) {
        case 'mongo':
            return mongoKeys
        case 'redis':
            return db.client.keys
    }
}())

module.exports = db
