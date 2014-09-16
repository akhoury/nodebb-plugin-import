
var db = module.parent.require('../../../src/database.js'),
    async = require('async'),

    utils = require('../public/js/utils.js'),
    Meta = require('../../../src/meta.js'),
    User = require('../../../src/user.js'),
    Topics = require('../../../src/topics.js'),
    Posts = require('../../../src/posts.js'),
    Categories = require('../../../src/categories.js'),
    
    DEFAULT_BATCH_SIZE = 100;


(function(Data) {

    Data.countUsers = function(callback) {
        db.sortedSetCard('users:joindate', callback);
    };

    Data.countCategories = function(callback) {
        db.sortedSetCard('categories:cid', callback);
    };

    Data.countTopics = function(callback) {
        db.sortedSetCard('topics:tid', callback);
    };

    Data.countPosts = function(callback) {
        db.sortedSetCard('posts:pid', callback);
    };

    Data.eachUser = function(iterator, options, callback) {
        return Data.each('users:joindate', 'user:', iterator, options, callback);
    };

    Data.eachCategory = function(iterator, options, callback) {
        return Data.each('categories:cid', 'category:', iterator, options, callback);
    };

    Data.eachTopic = function(iterator, options, callback) {
        return Data.each('topics:tid', 'topic:', iterator, options, callback);
    };

    Data.eachPost = function(iterator, options, callback) {
        return Data.each('posts:pid', 'post:', iterator, options, callback);
    };

    Data.each = function(setKey, prefixEachId, iterator, options, callback) {
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }
        return Data.processSet(
            setKey,
            prefixEachId,
            function(err, records, nextBatch) {
                if (err) {
                    return nextBatch(err);
                }
                if (options.async) {
                    if (options.eachLimit) {
                        async.eachLimit(records, options.eachLimit, iterator, nextBatch);
                    } else {
                        async.each(records, iterator, nextBatch);
                    }
                } else {
                    records.forEach(iterator);
                    nextBatch();
                }
            },
            options,
            callback
        );
    };

    Data.processSet = function(setKey, prefixEachId, process, options, callback) {
        return Data.processIdsSet(
            setKey,
            function(err, ids, next) {
                var keys = ids.map(function(id) {
                    return prefixEachId + id;
                });
                db.getObjects(keys, function(err, objects) {
                    process(err, objects, function(err) {
                        if (err) {
                            return next(err);
                        }
                        next();
                    });
                });
            },
            options,
            callback);
    };

    Data.processIdsSet = function(setKey, process, options, callback) {
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }

        callback = typeof callback === 'function' ? callback : function(){};
        options = options || {};

        if (typeof process !== 'function') {
            throw new Error(process + ' is not a function');
        }

        // custom done condition
        options.doneIf = typeof options.doneIf === 'function' ? options.doneIf : function(){};

        // always start at, useful when deleting all records
        // options.alwaysStartAt

        var batch = options.batch || DEFAULT_BATCH_SIZE;
        var start = 0;
        var end = batch;
        var done = false;

        async.whilst(
            function(err) {
                if (err) {
                    return true;
                }
                return !done;
            },
            function(next) {
                db.getSortedSetRange(setKey, start, end, function(err, ids) {
                    if (err) {
                        return next(err);
                    }
                    if (!ids.length || options.doneIf(start, end, ids)) {
                        done = true;
                        return next();
                    }
                    process(err, ids, function(err) {
                        if (err) {
                            return next(err);
                        }
                        start += utils.isNumber(options.alwaysStartAt) ? options.alwaysStartAt : batch + 1;
                        end = start + batch;
                        next();
                    });
                })
            },
            callback
        );
    };

    Data.processUsersSet = function(process, options, callback) {
        return Data.processSet('users:joindate', 'user:', process, options, callback);
    };

    Data.processCategoriesSet = function(process, options, callback) {
        return Data.processSet('categories:cid', 'category:', process, options, callback);
    };

    Data.processTopicsSet = function(process, options, callback) {
        return Data.processSet('topics:tid', 'topic:', process, options, callback);
    };

    Data.processPostsSet = function(process, options, callback) {
        return Data.processSet('posts:pid', 'post:', process, options, callback);
    };

    Data.processUsersUidsSet = function(process, options, callback) {
        return Data.processIdsSet('users:joindate', process, options, callback);
    };

    Data.processCategoriesCidsSet = function(process, options, callback) {
        return Data.processIdsSet('categories:cid', process, options, callback);
    };

    Data.processTopicsTidsSet = function(process, options, callback) {
        return Data.processIdsSet('topics:tid', process, options, callback);
    };

    Data.processPostsPidsSet = function(process, options, callback) {
        return Data.processIdsSet('posts:pid', process, options, callback);
    };

})(module.exports);