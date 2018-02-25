
(function(module) {
  var Data = require('../helpers/data.js');

  var Votes = {};

  Votes.setImported = function (_vid, vid, vote, callback) {
    return Data.setImported('_imported:_votes', '_imported_vote:', _vid, vid, vote, callback);
  };

  Votes.getImported = function (_vid, callback) {
    return Data.getImported('_imported:_votes', '_imported_vote:', _vid, callback);
  };

  Votes.deleteImported = function (_vid, callback) {
    return Data.deleteImported('_imported:_votes', '_imported_vote:', _vid, callback);
  };

  Votes.deleteEachImported = function(onProgress, callback) {
    return Data.deleteEachImported('_imported:_votes', '_imported_vote:', onProgress, callback);
  };

  Votes.isImported = function (_vid, callback) {
    return Data.isImported('_imported:_votes', _vid, callback);
  };

  Votes.eachImported = function (iterator, options, callback) {
    return Data.each('_imported:_votes', '_imported_vote:', iterator, options, callback);
  };

  Votes.countImported = function(callback) {
    Data.count('_imported:_votes', callback);
  };

  module.exports = Votes;

}(module));
