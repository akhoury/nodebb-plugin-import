const path = require('path')
const nbbRequire = require('nodebb-plugin-require')
const nconf = nbbRequire('nconf')
const pkg = require(path.join(nbbRequire.fullpath, '/package.json'))

const defaults = {
    nconf: {
        base_dir: nbbRequire.fullpath,
        themes_path: path.join(nbbRequire.fullpath, '/node_modules'),
        upload_path: 'public/uploads',
        views_dir: path.join(nbbRequire.fullpath, '/build/public/templates'),
        version: pkg.version,
    },
    exporter: {
        host: '127.0.0.1',
        dbname: 'outlowe2_db',
        dbuser: 'root',
        dbpass: '',
        module: 'nodebb-plugin-import-vbulletin',
        skipInstall: false
    },
    importer: {
        flush: true,
        log: true,
        passwordGen: {
            enabled: false,
            chars: '{}.-_=+qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM1234567890',
            len: 13
        },
        categoriesTextColors: ['#FFFFFF'],
        categoriesBgColors: ['#AB4642', '#DC9656', '#F7CA88', '#A1B56C', '#86C1B9', '#7CAFC2', '#BA8BAF', '#A16946'],
        categoriesIcons: ['fa-comment'],
        autoConfirmEmails: true,
        userReputationMultiplier: 1,

        adminTakeOwnership: {
            enable: true,
            _username: 'admin',
            _uid: 1
        },

        importDuplicateEmails: true,
        overrideDuplicateEmailDataWithOriginalData: true,
        nbbTmpConfig: require('./nbbTmpConfig')
    },
    postImport: {
        redirectionFormat: 'json',
        deleteExtraFields: true,
        contentConvert: {
            mainConvert: 'html-to-md',
            convertRecords: {
                topicsTitle: true,
                topicsContent: true,
                categoriesDescriptions: true
            }
        },
        redirectionTemplates: {
            users: {
                oldPath: null,
                newPath: '/user/<%= userslug %>'
            },
            categories: {
                oldPath: null,
                newPath: '/category/<%= cid %>'
            },
            topics: {
                oldPath: null,
                newPath: '/topic/<%= tid %>'
            },
            posts: null
        }
    }
}

module.exports = defaults