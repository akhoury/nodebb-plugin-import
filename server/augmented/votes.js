
(function (module) {
  const Data = require('../helpers/data');

  const Votes = {};

  Votes.import = function () {
    throw new Error('not implemented');
  };

  Votes.batchImport = function (array, options, progressCallback, batchCallback) {
    let index = 0;
    options = extend(true, {}, options);

    async.eachSeries(
      array,
      (record, next) => {
        Votes.import(record, options, (err, data) => {
          progressCallback(err, { data, index: ++index });
          // ignore errors:
          // let progressCallback throw an error or log a warning if it wants to.
          next();
        });
      },
      (err) => {
        batchCallback(err);
      },
    );
  };

  Votes.setImported = function (_vid, vid, vote, callback) {
    return Data.setImported('_imported:_votes', '_imported_vote:', _vid, vid, vote, callback);
  };

  Votes.getImported = function (_vid, callback) {
    return Data.getImported('_imported:_votes', '_imported_vote:', _vid, callback);
  };

  Votes.deleteImported = function (_vid, callback) {
    return Data.deleteImported('_imported:_votes', '_imported_vote:', _vid, callback);
  };

  Votes.deleteEachImported = function (onProgress, callback) {
    return Data.deleteEachImported('_imported:_votes', '_imported_vote:', onProgress, callback);
  };

  Votes.isImported = function (_vid, callback) {
    return Data.isImported('_imported:_votes', _vid, callback);
  };

  Votes.eachImported = function (iterator, options, callback) {
    return Data.each('_imported:_votes', '_imported_vote:', iterator, options, callback);
  };

  Votes.countImported = function (callback) {
    Data.count('_imported:_votes', callback);
  };

  module.exports = Votes;
}(module));
