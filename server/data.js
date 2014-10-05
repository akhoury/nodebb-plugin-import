
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

    Data.count = function(setKey, callback) {
        db.sortedSetCard(setKey, callback);
    };

    Data.countUsers = function(callback) {
        Data.count('users:joindate', callback);
    };

    Data.countCategories = function(callback) {
        Data.count('categories:cid', callback);
    };

    Data.countTopics = function(callback) {
        Data.count('topics:tid', callback);
    };

    Data.countPosts = function(callback) {
        Data.count('posts:pid', callback);
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

    Data.isImported = function(setKey, _id, callback) {
        return db.isSortedSetMember(setKey, _id, function(err, result) {
            callback(err, result);
        });
    };

    Data.getImported = function(setKey, objPrefix, _id, callback) {
        Data.isImported(setKey, _id, function(err, result) {
            if (err || !result) {
                return callback(null, null);
            }
            db.getObject(objPrefix + _id, function(err, obj) {
                if (err) {
                    return callback(null, null);
                }
                callback(null, obj);
            });
        });

    };

    Data.getImportedUser = function(_uid, callback) {
        return Data.getImported('_imported:_users', '_imported_user:', _uid, callback);
    };

    Data.getImportedCategory = function(_cid, callback) {
        return Data.getImported('_imported:_categories', '_imported_category:', _cid, callback);
    };

    Data.getImportedTopic = function(_tid, callback) {
        return Data.getImported('_imported:_topics', '_imported_topic:', _tid, callback);
    };

    Data.getImportedPost = function(_pid, callback) {
        return Data.getImported('_imported:_posts', '_imported_post:', _pid, callback);
    };

    Data.setImported = function(setKey, objPrefix, _id, id, data, callback) {
        delete data._typeCast;
        delete data.parse;
        return db.setObject(objPrefix + _id, data, function(err) {
            if (err) {
                return callback(err);
            }
            db.sortedSetAdd(setKey, id, _id, callback);
        });
    };

    Data.setUserImported = function(_uid, uid, user, callback) {
        return Data.setImported('_imported:_users', '_imported_user:', _uid, uid, user, callback);
    };

    Data.setCategoryImported = function(_cid, cid, category, callback) {
        return Data.setImported('_imported:_categories', '_imported_category:', _cid, cid, category, callback);
    };

    Data.setTopicImported = function(_tid, tid, topic, callback) {
        return Data.setImported('_imported:_topics', '_imported_topic:', _tid, tid, topic, callback);
    };

    Data.setPostImported = function(_pid, pid, post, callback) {
        return Data.setImported('_imported:_posts', '_imported_post:', _pid, pid, post, callback);
    };

    Data.isUserImported = function(_uid, callback) {
        return Data.isImported('_imported:_users', _uid, callback);
    };

    Data.isCategoryImported = function(_cid, callback) {
        return Data.isImported('_imported:_categories', _cid, callback);
    };

    Data.isTopicImported = function(_tid, callback) {
        return Data.isImported('_imported:_topics', _tid, callback);
    };

    Data.isPostImported = function(_pid, callback) {
        return Data.isImported('_imported:_posts', _pid, callback);
    };

    Data.countImportedUsers = function(callback) {
        Data.count('_imported:_users', callback);
    };

    Data.countImportedCategories = function(callback) {
        Data.count('_imported:_categories', callback);
    };

    Data.countImportedTopics = function(callback) {
        Data.count('_imported:_topics', callback);
    };

    Data.countImportedPosts = function(callback) {
        Data.count('_imported:_posts', callback);
    };

    Data.eachImportedUser = function(iterator, options, callback) {
        return Data.each('_imported:_users', '_imported_user:', iterator, options, callback);
    };

    Data.eachImportedCategory = function(iterator, options, callback) {
        return Data.each('_imported:_categories', '_imported_category:', iterator, options, callback);
    };

    Data.eachImportedTopic = function(iterator, options, callback) {
        return Data.each('_imported:_topics', '_imported_topic:', iterator, options, callback);
    };

    Data.eachImportedPost = function(iterator, options, callback) {
        return Data.each('_imported:_posts', '_imported_post:', iterator, options, callback);
    };

})(module.exports);