
(function(module) {
  var nbbRequire = require('nodebb-plugin-require');

  var fs = require('fs');
  var nconf = nbbRequire('./node_modules/nconf');
  var path = require('path');
  var winston = nbbRequire('./node_modules/winston');
  var fileType = require('file-type');

  // nbb-core
  var file = nbbRequire('/src/file.js');

  // [potential-nodebb-core]
  file.saveBlobToLocal = function(filename, folder, blob, callback) {
    /*
     * remarkable doesn't allow spaces in hyperlinks, once that's fixed, remove this.
     * same as file.saveFileToLocal()
     */
    filename = filename.split('.').map(function(name) { return utils.slugify(name); }).join('.');

    var uploadPath = path.join(nconf.get('base_dir'), nconf.get('upload_path'), folder, filename);
    var buffer = new Buffer(blob, 'binary');

    var ftype = fileType(buffer) || {mime: "unknown/unkown", extension: ""};
    ftype.filepath = uploadPath;

    winston.verbose('Saving Blob '+ filename +' to : ' + uploadPath);

    fs.writeFile(uploadPath, buffer.toString('binary'), 'binary', function (err) {
      ftype.url =  nconf.get('upload_url') + folder + '/' + filename;

      callback(err, ftype);
    });
  };

  module.exports = file;

}(module));
