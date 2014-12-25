## Examples to fork:
* https://github.com/akhoury/nodebb-plugin-import-ubb
* https://github.com/akhoury/nodebb-plugin-import-vbulletin
* https://github.com/a5mith/nodebb-plugin-import-smf
* https://github.com/psychobunny/nodebb-plugin-import-phpbb
* https://github.com/akhoury/nodebb-plugin-import-ipboard
* https://github.com/akhoury/nodebb-plugin-import-punbb


## Terminology
This section is up here because it's very important for you to read it, so let's make few things clear before we go on.

* 'NodeBB' == 'NBB' == 'nbb' == 'Nbb'
* when you see the term __OLD__ it refers to your source forum or bulletin-board
* when you see the term __NEW__ it refers to NodeBB
* __ALL__ of the __OLD__ __variables__, must start with an __underscore__ character: `_`
* `_cid` --> old category id, some forum software use different terms for categories, such as __forums__
* `_uid` --> old user id
* `_tid` --> old topic id, some forum software use different terms for topics, such as __threads__
* `_pid` --> old post id
* `cid` --> new category id
* `uid` --> new user id
* `tid` --> new topic id
* `pid` --> new post id

## Required
You need a node module that has the following interface.

## During development

Don't forget to check the "Skip the module install" checkbox in the "Select an Exporter" section, so the -import plugin won't delete your changes.

### YourModule.setup(config, callback)
* `config`: a JS object that will be passed to `setup()` and it contains the following:
```javascript
{
    dbhost: '127.0.0.1', // a string, db host entered by the user on the UI
    dbuser: 'admin', // a string, db username entered by the user on the UI
    dbpass: '123456', // a string, db password entered by the user on the UI
    dbport: 3306, // a number, db port entered by the user on the UI
    dbname: 'my_schema', // db schema, or name, entered by the user on the UI
    tablePrefix: 'bb_', // db table prefix, entered by the user on the UI, ignore it if not applicable

    // these values are not defaults, these are just examples
}
```
* `callback(err, config)`: a function that send 2 arguments
```
  - err: if truthy the export process will throw the error and stop
  - config: just return the configs that were setup on the exporter, in case they were modified
```

### YourModule.getUsers(callback) [deprecated]

### YourModule.getPaginatedUsers(start, limit, callback)
* `start` of the query row
* `limit` of the query results
* `callback`  Query the users, filter them at will, then call the `callback(err, map)` wih the following arguments

```
  - err: if truthy the export process will throw the error and stop
  - map: a hashmap of all the users ready to import
```
In the `map`, the `keys` are the users `_uid` (or the old userId).

Each record should look like this:
```javascript
{
       // notice how all the old variables start with an _
      // if any of the required variables fails, the user will be skipped

        "_uid": 45, // REQUIRED

        "_email": "u45@example.com", // REQUIRED

        "_username": "user45", // REQUIRED

        "_joindate": 1386475817370, // OPTIONAL, [UNIT: MILLISECONDS], defaults to current, but what's the point of migrating if you don't preserve dates

        "_alternativeUsername": "u45alt", // OPTIONAL, defaults to '', some forums provide UserDisplayName, we could leverage that if the _username validation fails

        "_password": '', // OPTIONAL, if you have them, or you want to generate them on your own, great, if not, all passwords will be blank

        // if you would like to generate random passwords, you will need to set the config.passwordGen.enabled = true, note that this will impact performance pretty hard
        // the new passwords with the usernames, emails and some more stuff will be spit out in the logs
        // look for the [user-csv] OR [user-json] tags to grep for a list of them
        // save dem logs

        "_signature": "u45 signature", // OPTIONAL, defaults to '', over 150 chars will be truncated with an '...' at the end

        "_picture": "http://images.com/derp.png", // OPTIONAL, defaults to ''. Note that, if there is an '_piçture' on the 'normalized' object, the 'imported' objected will be augmented with a key imported.keptPicture = true, so you can iterate later and check if the images 200 or 404s

        "_pictureBlob": "...BINARY BLOB...", // OPTIONAL, defaults to null
        "_pictureFilename": "123.png", // OPTIONAL, only applicable if using _pictureBlob, defaults to ''

        "_path": "/myoldforum/user/123", // OPTIONAL, the old path to reach this user's page, defaults to ''

        "_slug": "old-user-slug", // OPTIONAL

        "_website": "u45.com", // OPTIONAL, defaults to ''

        "_fullname": "this is dawg", // OPTIONAL, defaults to ''

        "_banned": 0, // OPTIONAL, defaults to 0

        "_location": "u45 city", // OPTIONAL, defaults to ''

        "_reputation": 1, // OPTIONAL, defaults to 0, (there is a config for multiplying these with a number for moAr karma)

        "_profileviews": 1, // OPTIONAL, defaults to 0

        "_birthday": "01/01/1977", // OPTIONAL, [FORMAT: mm/dd/yyyy], defaults to ''

        "_showemail": 0, // OPTIONAL, defaults to 0

        "_lastposttime": 1386475817370, // OPTIONAL, [UNIT: MILLISECONDS], defaults to current

        "_level": "administrator" // OPTIONAL, [OPTIONS: 'administrator' or 'moderator'], defaults to '', also note that a moderator will become a NodeBB Moderator on ALL categories at the moment.

}
```

### YourModule.getMessages(callback) [deprecated]

### YourModule.getPaginatedMessages(start, limit, callback)
* `start` of the query row
* `limit` of the query results
* `callback`  Query the users, filter them at will, then call the `callback(err, map)` wih the following arguments

```
  - err: if truthy the export process will throw the error and stop
  - map: a hashmap of all the users ready to import
```
In the `map`, the `keys` are the users `_mid` (or the old message Id).

Each record should look like this:
```javascript
{
       // notice how all the old variables start with an _
      // if any of the required variables fails, the user will be skipped

        "_mid": 45, // REQUIRED

        "_fromuid": 10, // REQUIRED

        "_touid": 20, // REQUIRED

        "_content": "Hello there!", // REQUIRED

        "_timestamp": 1386475817370 // OPTIONAL, [UNIT: MILLISECONDS], defaults to current
}
```

### YourModule.getCategories(callback) [deprecated]

### YourModule.getPaginatedCategories(start, limit, callback)
* `start` of the query row
* `limit` of the query results
* `callback`  Query the categories, filter them at will, then call the `callback(err, map)` wih the following arguments

Note: Categories are sometimes known as __forums__ in some forums software

```
  - err: if truthy the export process will throw the error and stop
  - map: a hashmap of all the categories ready to import
```
In the `map`, the `keys` are the categories `_cid` (or the old categorieId).

Each record should look like this:
```javascript
{
        // notice how all the old variables start with an _
        // if any of the required variables fails, the category and all of its topics/posts will be skipped
        "_cid": 2, // REQUIRED

        "_name": "Category 1", // REQUIRED

        "_description": "it's about category 1", // OPTIONAL

        "_order": 1 // OPTIONAL, defauls to its index + 1

        "_path": "/myoldforum/category/123", // OPTIONAL, the old path to reach this category's page, defaults to ''

        "_slug": "old-category-slug", // OPTIONAL defaults to ''

        "_parentCid": 1, // OPTIONAL, parent category _cid defaults to null

        "_skip": 0, // OPTIONAL, if you want to intentionally skip that record
}
```



### YourModule.getTopics(callback) [deprecated]

### YourModule.getPaginatedTopics(start, limit, callback)
* `start` of the query row
* `limit` of the query results
* `callback`  Query the topics, filter them at will, then call the `callback(err, map)` wih the following arguments

Note: Topics are sometimes known as __threads__ in some forums software

```
  - err: if truthy the export process will throw the error and stop
  - map: a hashmap of all the topics ready to import
```
In the `map`, the `keys` are the topics `_tid` (or the old topicId).

Each record should look like this:
```javascript
{
       // notice how all the old variables start with an _
      // if any of the required variables fails, the topic and all of its posts will be skipped

        "_tid": 1, // REQUIRED, THE OLD TOPIC ID

        "_uid": 1, // OPTIONAL, THE OLD USER ID, Nodebb will create the topics for user 'Guest' if not provided

        "_guest": "Some dude" // OPTIONAL, if you dont have _uid, you can pass a guest name to be used in future features, defaults to null

        "_cid": 1, // REQUIRED, THE OLD CATEGORY ID

        "_ip": "123.456.789.012", // OPTIONAL, not currently used in NodeBB core, but it might be in the future, defaults to null

        "_title": "this is topic 1 Title", // OPTIONAL, defaults to "Untitled :id"

        "_content": "This is the first content in this topic 1", // REQUIRED

        "_thumb": "http://foo.bar/picture.png", // OPTIONAL, a thumbnail for the topic if you have one, note that the importer will NOT validate the URL

        "_timestamp": 1386475817370, // OPTIONAL, [UNIT: Milliseconds], defaults to current, but what's the point of migrating if you dont preserve dates

        "_viewcount": 10, // OPTIONAL, defaults to 0

        "_locked": 0, // OPTIONAL, defaults to 0, during migration, ALL topics will be unlocked then locked back up at the end

        "_tags": ["tag1", "tag2", "tag3"], // OPTIONAL, an array of tags, or a comma separated string would work too, defaults to null

        "_deleted": 0, // OPTIONAL, defaults to 0

        "_pinned": 1 // OPTIONAL, defaults to 0

        "_path": "/myoldforum/topic/123", // OPTIONAL, the old path to reach this topic's page, defaults to ''

        "_slug": "old-topic-slug" // OPTIONAL, defaults to ''
}
```


### YourModule.getPosts(callback) [deprecated]

### YourModule.getPaginatedPosts(start, limit, callback)
* `start` of the query row
* `limit` of the query results
* `callback`  Query the topics, filter them at will, then call the `callback(err, map)` wih the following arguments

```
  - err: if truthy the export process will throw the error and stop
  - map: a hashmap of all the posts ready to import
```
In the `map`, the `keys` are the posts `_pid` (or the old postId).

Each record should look like this:
```javascript
{
      // notice how all the old variables start with an _
      // if any of the required variables fails, the post will be skipped

    	"_pid": 65487, // REQUIRED, OLD POST ID

        "_tid": 1234, // REQUIRED, OLD TOPIC ID

        "_uid": 202, // OPTIONAL, OLD USER ID, NodeBB will create under the "Guest" username

        "_guest": "Some dude" // OPTIONAL, if you don't have _uid, you can pass a guest name to be used in future features, defaults to null

        "_ip": "123.456.789.012", // OPTIONAL, not currently used in NodeBB core, but it might be in the future, defaults to null
        "_content": "Post content ba dum tss", // REQUIRED

        "_reputation": 0, // OPTIONAL, defaults to 0

        "_votes": 0, // OPTIONAL, defaults to 0, can be negative

        "_timestamp": 1386475829970 // OPTIONAL, [UNIT: Milliseconds], defaults to current, but what's the point of migrating if you dont preserve dates.

        "_path": "/myoldforum/topic/123#post56789", // OPTIONAL, the old path to reach this post's page and maybe deep link, defaults to ''

        "_slug": "old-post-slug" // OPTIONAL, defaults to ''

}
```

### YourModule.teardown(callback)

If you need to do something before the export is done, like closing a connection or something, then call the `callback`

## Optionals

### 4 more functions:

#### Logger functions
* `YourModule.log([args])`
* `YourModule.warn([args])`
* `YourModule.error([args])`

In these 3 functions, you can basically do whatever you want, such as printing something on the console based on its level, or logging to a file. However, the arguments that each call passes in will be picked up, and emitted in corresponding events, and shown to the user. The event emitted are:
* `exporter.log`
* `exporter.warn`
* `exporter.error`

You do not have to do anything extra to emit the events, just implement these functions at will and use them appropriately. see [this](https://github.com/akhoury/nodebb-plugin-import-ubb/blob/master/index.js#L366) for example.

#### a testrun function
* `YouModule.testrun(config, callback)`

just a function for you to be able to test your module independently from __nodebb-plugin-import__

```javascript
// for example
YourModule.testrun = function(config, callback) {
        async.series([
            function(next) {
                YourModule.setup(config, next);
            },
            function(next) {
                YourModule.getUsers(next);
            },
            function(next) {
                YourModule.getCategories(next);
            },
            function(next) {
                YourModule.getTopics(next);
            },
            function(next) {
                YourModule.getPosts(next);
            },
            function(next) {
                YourModule.teardown(next);
            }
        ], function(err, results) {
            if(err) throw err;

            // or whatever else
            fs.writeFile('./tmp.json', JSON.stringify(results, undefined, 2), callback);
        });
    };
```
## Important Note On Topics and Posts:
* Most forums, when creating a topic, a post will be created immediately along with it, this last post will be the __main-post__ or __parent-post__ or __topic_content_post__ or whatever other term it's known with, and it's usually saved in the same __table__ with the other posts, known as the "__reply-posts__". Usually this  __parent-post__ have some sort of flag to differentiate it, such as `is_parent = 1` or `parent = 0` or something close.
* Most likely, you may have to do some tables `join`ing to get each Topic's record along with its __parent-post__'s content, then save it the `_content` on each `topicsMap.[_tid]` object.
* You should discard all of the other data on that __parent-post__ as in NodeBB, it will be the Topic's content.
* Remember to filter these __parent-posts__ from your __reply-posts__ query so they don't get imported twice.

## Convention
In order for your exporter to be automatically by the [nodebb-plugin-import](https://github.com/akhoury/nodebb-plugin-import) plugin as a compatible exporter,
its name needs to start with `nodebb-plugin-import-`, i.e. `nodebb-plugin-import-ubb`

You don't have to do that for it to work, you can type it in manually and it works fine.

#### Why is it does it have an __import__ word in it when it's an exporter?
Because it would only works with the __nodebb-plugin-import__ plugin, and I wanted to namespace it somehow. I don't care anymore, call it whatever you want.

