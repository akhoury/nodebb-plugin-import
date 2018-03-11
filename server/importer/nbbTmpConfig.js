
var nbbRequire = require('nodebb-plugin-require');
var nbbDefaults = nbbRequire('install/data/defaults.json');
var extend = require('extend');
var MAX_INT = Number.MAX_SAFE_INTEGER;

module.exports = extend(true, {}, nbbDefaults, {
  "maintenanceMode": 1,
  "showSiteTitle": 1,
  "postDelay": 0,
  "initialPostDelay": 0,
  "newbiePostDelay": 0,
  "newbiePostDelayThreshold": 0,
  "minimumPostLength": 0,
  "maximumPostLength": MAX_INT,
  "minimumTagsPerTopic": 0,
  "maximumTagsPerTopic": MAX_INT,
  "minimumTagLength": 0,
  "maximumTagLength": MAX_INT,
  "allowGuestSearching": 1,
  "allowTopicsThumbnail": 1,
  "allowLocalLogin": 1,
  "allowAccountDelete": 1,
  "allowFileUploads": 1,
  "allowedFileExtensions": "", // empty string here seems to allow everything
  "allowUserHomePage": 1,
  "maximumFileSize": MAX_INT,
  "minimumTitleLength": 0,
  "maximumTitleLength": MAX_INT,
  "minimumUsernameLength": 0,
  "maximumUsernameLength": MAX_INT,
  "minimumPasswordLength": 0,
  "maximumSignatureLength": MAX_INT,
  "maximumAboutMeLength": MAX_INT,
  "maximumProfileImageSize": MAX_INT,
  "maximumCoverImageSize": MAX_INT,
  "minimumChatMessageLength": 0,
  "maximumChatMessageLength": MAX_INT,
  "allowProfileImageUploads": 1,
  "teaserPost": "last-reply",
  "allowPrivateGroups": 1,
  "unreadCutoff": 2,
  "bookmarkThreshold": 5,
  "topicsPerList": 20,
  "autoDetectLang": 1,
  "min:rep:flag": 0,
  "trackIpPerPost": 0
});
