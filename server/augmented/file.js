
(function (module) {
  const nbbRequire = require('nodebb-plugin-require');

  const fs = require('fs');
  const nconf = nbbRequire('nconf');
  const path = require('path');
  const winston = nbbRequire('winston');
  const fileType = require('file-type');

  // nbb-core
  const file = nbbRequire('/src/file');

  // [potential-nodebb-core]
  file.saveBlobToLocal = function (filename, folder, blob, callback) {
    /*
     * remarkable doesn't allow spaces in hyperlinks, once that's fixed, remove this.
     * same as file.saveFileToLocal()
     */
    filename = filename.split('.').map(name => utils.slugify(name)).join('.');

    const uploadPath = path.join(nconf.get('base_dir'), nconf.get('upload_path'), folder, filename);
    const buffer = new Buffer(blob, 'binary');

    const ftype = fileType(buffer) || { mime: 'unknown/unkown', extension: '' };
    ftype.filepath = uploadPath;

    winston.verbose(`Saving Blob ${filename} to : ${uploadPath}`);

    fs.writeFile(uploadPath, buffer.toString('binary'), 'binary', (err) => {
      ftype.url = `${nconf.get('upload_url') + folder}/${filename}`;

      callback(err, ftype);
    });
  };

  module.exports = file;
}(module));
