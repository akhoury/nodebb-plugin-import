
var db = module.parent.require('../../../src/database.js'),
    async = require('async'),

    Meta = require('../../../src/meta.js'),
    User = require('../../../src/user.js'),
    Topics = require('../../../src/topics.js'),
    Posts = require('../../../src/posts.js'),
    Categories = require('../../../src/categories.js');

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

        var batch = options.batch || 5000;
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
                    if (!ids.length) {
                        done = true;
                        return next();
                    }
                    process(err, ids, function(err) {
                        if (err) {
                            return next(err);
                        }
                        start += batch + 1;
                        end = start + batch;
                        next();
                    });
                })
            },
            callback
        );
    };

    Data.processUsersSet = function(process, options, callback) {
        return Data.processSet('user:uid', 'user:', process, options, callback);
    };

    Data.processCategoriesSet = function(process, options, callback) {
        return Data.processSet('category:cid', 'category:', process, options, callback);
    };

    Data.processTopicsSet = function(process, options, callback) {
        return Data.processSet('topic:tid', 'topic:', process, options, callback);
    };

    Data.processPostsSet = function(process, options, callback) {
        return Data.processSet('post:pid', 'post:', process, options, callback);
    };

    Data.processUsersUidsSet = function(process, options, callback) {
        return Data.processIdsSet('user:uid', process, options, callback);
    };

    Data.processCategoriesCidsSet = function(process, options, callback) {
        return Data.processIdsSet('category:cid', process, options, callback);
    };

    Data.processTopicsTidsSet = function(process, options, callback) {
        return Data.processIdsSet('topic:tid', process, options, callback);
    };

    Data.processPostsPidsSet = function(process, options, callback) {
        return Data.processIdsSet('post:pid', process, options, callback);
    };

})(module.exports);