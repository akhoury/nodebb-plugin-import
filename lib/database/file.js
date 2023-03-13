const nbbRequire = require('nodebb-plugin-require')

const fs = require('fs').promises
const nconf = nbbRequire('nconf')
const path = require('path')
const winston = nbbRequire('winston')
const {
	fromBuffer: fileType
} = require('file-type-cjs')

const file = nbbRequire('/src/file')
const helpers = require('../helpers')
const utils = require('../../static/lib/utils')

file.saveBlobToLocal = async (filename, folder, blob) => {
    filename = filename.split('.').map(name => utils.slugify(name)).join('.')

    const uploadPath = path.join(nconf.get('base_dir'), nconf.get('upload_path'), folder, filename)
    const buffer = Buffer.from(blob, 'binary')

    const ftype = (await fileType(buffer)) || {
        mime: 'unknown/unkown',
        extension: ''
    }
    ftype.filepath = uploadPath

    winston.verbose(`Saving Blob ${filename} to : ${uploadPath}`)

    await fs.writeFile(uploadPath, buffer.toString('binary'), 'binary')

    ftype.url = `${nconf.get('upload_url') + folder}/${filename}`

    return ftype
}

file.writeBlobAndSaveFileToLocal = async (tmpPath, blob, filename, folder) => {
    const ftype = await helpers.writeBlob(tmpPath, blob)
    const ret = await file.saveFileToLocal(filename, folder, tmpPath)
    return { ftype, ret }
}

module.exports = file