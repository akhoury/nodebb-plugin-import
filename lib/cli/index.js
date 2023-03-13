const readline = require('readline')
const fs = require('fs-extra')
const path = require('path')
const stringify = require('json-stringify-safe')

const db = require('../database/')
const config = require('../config')
const Exporter = require('../exporter')
const Importer = require('../importer')
const privileges = require('../database/privileges')
const controller = require('../controllers')

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
})

rl.on('close', () => {
    console.log('\n Thanks for using nodebb-plugin-import, bye!')
    process.exit(0)
})

const resolveInput = (input) => {
    if (input == null) {
        return input
    }

    if (input === 'y' || input === 'n' || input === 'N' || input === 'Y') {
        input = input.toLowerCase()
        return input === 'y' ? true : false
    }

    if (input.indexOf(',') !== -1) {
        return input.trim().split(',')
    }

    if (/^\d+$/.test(input)) {
        return parseInt(input, 10)
    }

    return input
}

const ask = (question) => {
    return new Promise((resolve) => {
        rl.question(question, (input) => {
            resolve(input)
        })
    })
}

const prompt = async (...args) => {
    let input = await ask(args[0])
    input = resolveInput(input)
    if (args[1] !== undefined) { // args[1] is default answer
        if (input === null || input === undefined || input === '') {
            return args[1]
        }
        return input
    } else if (!input) {
        console.warn('A value is required')
        return await prompt(args)
    }
    return input
}

const CONFIG_PATH = path.join(__dirname, '../config')

const saveConfigJson = (file, config) => fs.writeFile(path.join(CONFIG_PATH, file), stringify(config))
const fileExists = (file) => fs.existsSync(path.join(CONFIG_PATH, file))

let skip = false

const getExporterConfig = async () => {
    if (fileExists('export.json') && skip) {
        return
    }
    const exporter = {
        host: '127.0.0.1',
        dbname: 'outlowe2_db',
        dbuser: 'root',
        dbpass: '',
        module: 'nodebb-plugin-import-vbulletin',
        skipInstall: false
    }
    console.info('Exporter Config:')
    exporter.host = await prompt('host (127.0.0.1): ', '127.0.0.1')
    exporter.dbname = await prompt('db name: ')
    exporter.dbuser = await prompt('db user (root): ', 'root')
    exporter.dbpass = await prompt('db password: ', '')
    exporter.module = await prompt('export module (nodebb-plugin-import-vbulletin): ', 'nodebb-plugin-import-vbulletin')
    exporter.skipInstall = await prompt('Skip module install? (y/N) ', false)

    await saveConfigJson('export.json', exporter)
}

const getImporterConfig = async () => {
    if (fileExists('import.json') && skip) {
        return
    }
    const importer = {
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
        overrideDuplicateEmailDataWithOriginalData: true
    }

    if (skip) {
        return await saveConfigJson('import.json', importer)
    }

    const password = importer.passwordGen

    password.enabled = await prompt('Enable auto password generation? (y/N) ', false)
    if (password.enabled) {
        password.chars = await prompt('Characters for password auto generation: ')
        password.len = await prompt('Password length ', 13)
    }

    importer.categoriesTextColors = await prompt('Categories text colors csv: (#FFFFFF) ', importer.categoriesTextColors)
    importer.categoriesBgColors = await prompt('Categories bg colors csv: (#AB4642,#DC9656,#F7CA88,#A1B56C,#86C1B9,#7CAFC2,#BA8BAF,#A16946) ', importer.categoriesBgColors)
    importer.categoriesIcons = await prompt('Categories icons csv: (fa-comment) ', importer.categoriesIcons)
    importer.autoConfirmEmails = await prompt('Auto confirm emails? (Y/n) ', true)

    const ownership = importer.adminTakeOwnership
    ownership.enable = await prompt('Would you like to take ownership admin old posts? (Y/n) ', true)
    if (ownership.enable) {
        ownership._username = await prompt('Old admin username: (admin)', 'admin')
        ownership._uid = await prompt('Old admin uid: (1)', 1)
    }

    importer.importDuplicateEmails = await prompt('Import duplicate emails? (Y/n) ', true)
    importer.overrideDuplicateEmailDataWithOriginalData = await prompt('Override deuplicate email data with original data? (Y/n) ', true)

    await saveConfigJson('import.json', importer)
}

const getPostImportConfig = async () => {
    if (fileExists('post-import.json') && skip) {
        return
    }
    const postImport = {
        contentConvert: {
            mainConvert: 'html-to-md',
            convertRecords: {
                topicsTitle: true,
                topicsContent: true,
                categoriesDescriptions: true
            }
        },
        deleteExtraFields: true,
        redirectionFormat: 'json',
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
            posts: {
                oldPath: null,
                newPath: '/post/<%= tid %>'
            },
        }
    }

    if (skip) {
        return await saveConfigJson('post-import.json', postImport)
    }

    postImport.contentConvert.mainConvert = await prompt('Main covert: (Don\'t touch my content) ', null)
    postImport.deleteExtraFields = await prompt('Delete extra fields? (Y/n)', true)
    postImport.redirectionFormat = await prompt('Redirection format: (json) ', 'json')
    postImport.redirectionTemplates.users.oldPath = await prompt('Users old path: (null) ', null)
    postImport.redirectionTemplates.users.newPath = await prompt('Users new path: (null) ', null)
    postImport.redirectionTemplates.categories.newPath = await prompt('Categories new path: (null) ', null)
    postImport.redirectionTemplates.categories.oldPath = await prompt('Categories old path: (null) ', null)
    postImport.redirectionTemplates.topics.newPath = await prompt('Topics new path: (null) ', null)
    postImport.redirectionTemplates.topics.oldPath = await prompt('Topics old path: (null) ', null)
    postImport.redirectionTemplates.posts.oldPath = await prompt('Posts old path: (null) ', null)
    postImport.redirectionTemplates.posts.newPath = await prompt('Posts new path: (null) ', null)

    await saveConfigJson('post-import.json', postImport)
}

exports.init = async () => {
    skip = await prompt('Use default settings? (Y/n)', true)
    await getExporterConfig()
    await getImporterConfig()
    await getPostImportConfig()

    await db.init()

    const exportData = await prompt('Export Data? (Y/n)', true)
    if (exportData) {
        await Exporter.init(config)
        await Exporter.setup()

        Importer.setup(Exporter, config)
        await privileges.init()
        // await Importer.deleteTmpImportedSetsAndObjects()
        // await Importer.clearProgress()
        await Importer.start()
    }

    const postImport = await prompt('Convert Data? (Y/n)', true)
    if (postImport) {
        await controller.postImport()
    }


    rl.close()
}