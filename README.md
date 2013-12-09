nodebb-plugin-import
=========
Import your structured forum data to nodebb | a one time use plugin

a refactor of: [nodebb-plugin-ubbmigrator](https://github.com/akhoury/nodebb-plugin-ubbmigrator)
into this general __nodebb-plugin-import_ and [nodebb-plugin-import-ubb](https://github.com/akhoury/nodebb-plugin-import-ubb)

__works, but still young__
<br />

### General Note
This is not a normal NodeBB Plugin, at the moment there is no way to run it from the NodeBB/admin panel, so it doesn't really matter if it's activated or not, as long as you find this readme somehow.
you must install it in ```NodeBB/node_modules/nodebb-plugin-import```, then you run it from the command line for the time being; keep reading to find out how

### Requirements:
* [NodeJS](http://nodejs.org/)
* [NodeBB](http://www.nodebb.org/)
* Pre-generated data, see [Source Files Structure](https://github.com/akhoury/nodebb-plugin-import/blob/master/README.md#source-files-structure) below, you can generate them however you want, as long as you meet the end resutls.
I, for example, am writing this [nodebb-plugin-import-ubb](https://github.com/akhoury/nodebb-plugin-import-ubb) which exports [UBB Threads](http://www.ubbcentral.com/) data into files that this importer can understand,
take a look at it to get an idea on how to generate them (also still in development)
* a tiny bit of terminal knowledge


## Example usage
```
cd NodeBB
npm install nodebb-plugin-import
cd node_module/nodebb-plugin-import
npm install
cd bin
node import.js --storage="../storage" --config="../import.config.json" --flsuh --log="debug" | tee import.log
```

### Terminology
This section is up here because it's very important for you to read it, so let's make few things clear before we go on.

* 'NodeBB' == 'NBB' == 'nbb' == 'Nbb'
* when you see the term __OLD__ it refers to your source forum or bulletin-board
* when you see the term __NEW__ it refers to NodeBB
* __ALL__ of the __OLD__ __variables__, must start with an __underscore__ character: `_`
* `_cid` --> old category id, some forum softwares use different terms for categories, such as __forums__
* `_uid` --> old user id
* `_tid` --> old topic id
* `_pid` --> old post id
* `cid` --> new category id
* `uid` --> new user id
* `tid` --> new topic id
* `pid` --> new post id

## Source Files Structure
in order for the importer to consume your data, it must be saved in a defined structure. For example, the [test storage](https://github.com/akhoury/nodebb-plugin-import/tree/master/test/storage)'s directory looks like this:
```
$ ls ./storage/
_cids.json    _uids.json	p.10		p.7		t.1		t.4		u.1
_pids.json	c.1		p.11		p.8		t.2		t.5		u.2
_tids.json	c.2		p.12		p.9		t.3		t.6		u.3
```

### You need 4 Arrays of _ids
You must generate 4 arrays and save them in the following format, these are basically all of the old ids of all of the records. 

* `_cids.json` must contain an array of ALL of the _cids aka old category ids, if they're called 'forums' in your old software, you still have to save them as 'categories', you're making a big change, start with this one. Here's a tiny example:
```
[1, 2]
```
* `_uids.json` must contain an array of ALL of the _uids, aka old users ids, tiny example:
```
[1, 2, 3]
```
* `_tids.json` must contain an arra of ALL of the _tids, aka old topics ids, tiny example: 
```
[1, 2, 3, 4]
```
* `_pids.json` contains an array of ALL _pids, aka the old post ids, tiny example:
```
[7,8,9,10,11,12]
```

### You need a single file for each record.

The rest of the data must be in the following format:

#### category: c.[_cid] file sample: 
Every category data must be in a seperate file, each file name must start with `c.` for `category` and then appended with its old category id `_cid`, i.e. `c.1`

```javascript
{
    "normalized": {
        // notice how all the old variables start with an _
        // if any of the required variables fails, the category and all of its topics/posts will be skipped 
        "_cid": 1, // REQUIRED
        
        "_name": "Category 1", // REQUIRED
        
        "_description": "it's about category 1", // REQUIRED
        
        "_order": 1 // OPTIONAL, defauls to its index + 1 in the _cids.json array
        
        "_skip": 0, // OPTIONAL, if you want to intetionally skip that record
    },
    
    // either leave these two as null or remove them, but the 'normalized' key must exist in this structure
    "imported": null,
    "skipped": null
}
```

#### user: u.[_uid] file sample: 
Every user data must be a seperate file, each file name must start with `u.` for `user` and then appended with its old user id `_uid`, i.e `u.45`

```javascript
{
    "normalized": {
       // notice how all the old variables start with an _
      // if any of the required variables fails, the user and all of its topics/posts will be skipped 

        "_uid": 45, // REQUIRED
        
        "_email": "u45@example.com", // REQUIRED
        
        "_username": "user45", // REQUIRED

        "_joindate": 1386475817370, // OPTIONAL, [UNIT: MILLISECONDS], defaults to current, but what's the point of migrating if you don't preserve dates

        "_alternativeUsername": "u45alt", // OPTIONAL, defaults to '', some forums provide UserDisplayName, we could leverage that if the _username validation fails 
        
        "_password": '', // OPTIONAL, if you have them, or you want to generate them on your own, great, if not, one will be generated for each user
        // the passwords with the usernames, emails and some more stuff will be spit out in the logs
        // look for the [user-csv] OR [user-json] tags to grep for a list of them
        // save dem logs
        
        "_signature": "u45 signature", // OPTIONAL, defaults to '', over 150 chars will be truncated with an '...' at the end
        
        "_picture": "http://images.com/derp.png", // OPTIONAL, defaults to ''. Note that if there is an '_pciture' on the 'normalized' object, the 'imported' objected will be augmented with a key imported.keptPicture = true, so you can iterate later and check if the images 200 or 404s
        
        "_website": "u45.com", // OPTIONAL, defaults to ''
        
        "_banned": 0, // OPTIONAL, defaults to 0 
        
        "_location": "u45 city", // OPTIONAL, defaults to ''

        "_reputation": 1, // OPTIONAL, defaults to 0, (there is a config for multiplying these with a number for moAr karma)
        
        "_profileviews": 1, // OPTIONAL, defaults to 0
        
        "_birthday": "01/01/1977", // OPTIONAL, [FORMAT: mm/dd/yyyy], defaults to ''
        "_showemail": 0, // OPTIONAL, defaults to 0
        
        "_level": "administrator", // OPTIONAL, [OPTIONS: 'administrator' or 'moderator'], defaults to '', also note that a moderator will become a NodeBB Moderator on ALL categories at the moment.
       
        "_skip": 0, // optional, if you want to intentionally skip that record
    },
    
    // either leave these two as null or remove them, but the 'normalized' key must exist in this structure
    "imported": null,
    "skipped": null
}
```
#### topic: t.[_id] file sample: 
every topic data must be in have a seperate file, each file name must start with `t.` for topic, then appended with its old topic id `_tid`, i.e. `t.123`


#### Important Note On Topics and Posts: 
* Most forums, when creating a topic, a post will be created immediately along with it, this last post will be the __main-post__ or __parent-post__ or __topic_content_post__ or whatever other term it's known with, and it's usually saved in the same __table__ with the other posts, known as the "__reply-posts__". Usually this  __parent-post__ have some sort of flag to differentiate it, such as `is_parent = 1` or `parent = 0` or something close.
* Most likely, you may have to do some tables `join`ing to get each Topic's record along with its __parent-post__'s content, then save it the `_content` on the `t.[_tid]` JSON.
* You should discard all of the other data on that __parent-post__ as in NodeBB, it will be the Topic's content.
* Remember to fliter these __parent-posts__ from your __reply-posts__ query so they don't get imported twice.  


```javascript
{
    "normalized": {
       // notice how all the old variables start with an _
      // if any of the required variables fails, the topic and all of its posts will be skipped 
      
        "_tid": 1, // REQUIRED
        
        "_uid": 1, // REQUIRED, THE OLD USER ID
        
        "_cid": 1, // REQUIRED, THE OLD CATEGORY ID
        
        "_title": "this is topic 1 Title", // OPTIONAL, defaults to "Untitled :id"
        
        "_content": "This is the first content in this topic 1", // REQUIRED
        
        "_timestamp": 1386475817370, // OPTIONAL, [UNIT: Milliseconds], defaults to current, but what's the point of migrating if you dont preserve dates
        
        "_viewcount": 10, // OPTIONAL, defaults to 0
         
        "_locked": 0, // OPTIONAL, defaults to 0
        
        "_deleted": 0, // OPTIONAL, defaults to 0
        
        "_pinned": 1, // OPTIONAL, defaults to 0
        
        "_skip": 0 // OPTIONAL, if you want to intentionally skip that record
	},
    
    // either leave these two as null or remove them, but the 'normalized' key must exist in this structure
	"imported": null,
	"skipped": null
}
```

#### post: p.[_id] file sample: 
every post data must be in a seperate file, each file name must start with `p.` for post, then appended with its old post id `_pid`, i.e. `p.65487`
```javascript
{
    "normalized": {
      // notice how all the old variables start with an _
      // if any of the required variables fails, the post will be skipped 
      
    	"_pid": 65487, // REQUIRED, OLD POST ID
        
        "_tid": 1234, // REQUIRED, OLD TOPIC ID
        
        "_uid": 202, // REQUIRED, OLD USER ID
        
        "_content": "Post content ba dum tss", // REQUIRED
        
        "_timestamp": 1386475829970, // OPTIONAL, [UNIT: Milliseconds], defaults to current, but what's the point of migrating if you dont preserve dates.
        
        "_skip": 0 // OPTIONAL, if you intentionally want to skip that record 
        
	},
    
    // either leave these two as null or remove them, but the 'normalized' key must exist in this structure
	"imported": null,
	"skipped": null
}
```

### Your config are required
These are the defaults, the defaults are good too.

```javascript
    log: 'debug',
	
	// generate passwords for the users, if no password is provided
	passwordGen: {
		// chars selection menu
		chars: '{}.-_=+qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM1234567890',
		// password length
		len: 13
	},
	
	// SET all of the 'oldPath' templates based on your forum's paths
	// You can use any variable in the 'normalized' structure
	// BUT don't change the 'newPath' ones since these are the NodeBB way
	// unless of course, you know what you're doing, like you want to add a Prefix or a query string
	// these will spit out in the logs with a [redirect] tag
	// save the logs!
	redirectTemplatesStrings: {
		// uses the underscore templating engine
		// all variables that start an an '_' are the old variables
		users: {
			// this is an example (the ubb way)
			oldPath: '/users/<%= _uid %>',
			// this is the nbb way
			newPath: '/user/<%= userslug %>'
		},
		categories: {
			// this is an example (the ubb way)
			oldPath: '/forums/<%= _cid %>',
			// this is the nbb way
			newPath: '/category/<%= cid %>'
		},
		topics: {
			// this is an example (the ubb way)
			oldPath: '/topics/<%= _tid %>',
			// this is the nbb way
			newPath: '/topic/<%= tid %>'
		},
		// most Forums uses the # to add the post id to the path, this cannot be easily redirected
		// without some client side JS 'Redirector' that grabs that # value and add to the query string or something
		// but if your old-forums doesn't do that, feel free to edit that config
		// by default this is null to disable it and increase performance,
		// it is a little but of CPU hog since, usually the post are the highest number of records
		// and this require string processing, so if 
		// you're okay with redirecting oldTopcPaths and oldPostsPaths to the newTopciPaths without scrolling to the right post in the topic, leave this null.
		posts: null
		/*
		 posts: {
		 // here's an example on how ubb's posts paths are:
		 oldPath: "/topics/<%= _tid %>/*#Post<%= _pid %>",
		 // even nbb does that too, it's easier to let javascript handle the "scroll" to a post this way
		 newPath: null // "/topic/<%= tid %>/#<%= pid %>"
		 }
		 */
	},
	
	// where are the storage files generated?
	// can be overwritten with the --storage flag
	storageDir: '../storage',

	nbb: {
		setup: {
			// this WILL FLUSH YOU DATABASE and attempt to run:
			// node app --setup={...}
			// with a merge of the setupVal values below and, if you have NodeBB/config.json in its place too
			runFlush: false,
		
			setupVal:  {
				'admin:username': 'admin',
				'admin:password': 'password',
				'admin:password:confirm': 'password',
				'admin:email': 'you@example.com',
				'base_url': 'http://localhost',
				'port': '4567',
				'use_port': 'y',
				'bind_address': '0.0.0.0',
				'secret': '',

				// default is 'redis', change to 'mongo' if needed, but then fill out the 'mongo:*' config
				'database': 'redis',

				// redisdb
				'redis:host': '127.0.0.1',
				'redis:port': 6379,
				'redis:password': '',
				'redis:database': 0,

				// mongodb
				'mongo:host': '127.0.0.1',
				'mongo:port': 27017,
				'mongo:user': '',
				'mongo:password': '',
				'mongo:database': 0
			}
		},

		// to be randomly selected
		// you can change all that in the NodeBB/admin panel
		
		// feel free to add more colors
		categoriesTextColors: ['#FFFFFF'],
		categoriesBgColors: ['#ab1290','#004c66','#0059b2'],
		// here's a list, http://fontawesome.io/icons/ 
		// feel free to add to this array
		categoriesIcons: ['fa-comment'],

		// this will set the nodebb 'email:*:confirm' records to true
		// and will del all the 'confirm:*KEYS*:emails' too
		// if you want to auto confirm the user's accounts..
		autoConfirmEmails: true,

		// if you want to boost the Karma
		userReputationMultiplier: 1,
	}

}
```

### Versions tested on:
NodeBB 0.1.x-edge (I am almost updating and testing daily, from nodebb/master at the moment,but I will stablize right after the the NodeBB's 0.2.0 release)

### Future versions support
I will keep supporting future NodeBB versions, since it's still very young and I'm a fan, but you need to submit an issue with all the details (NodeBB version, issue etc..), and I will help as fast as I can, or a pull request if you find an issue or you want to add a feature

### Markdown Note
NodeBB 'prefers' Markdown as its main 'content' language, so it enables [nodebb-plugin-markdown](https://github.com/julianlam/nodebb-plugin-markdown) by default, which aggressively sanitize all HTML from the content. Now, I know a lot for forum sofrware allow and have a lot of HTML content, but to be honest, converting from HTML to Markdown was such a memory hog, so I took it out of the importer. Here are your options:
* If you can, convert your HTML content to markdown on your own, I was using [html-md](https://github.com/neocotic/html.md) 
* If you can't, leave it as HTML, then, DISABLE html sanitization in the __nodebb-plugin-markdown__ sttings page, but don't stop there, this is a high security risk on you and your users, so you must sanitize the UNSAFE html somehow, to do that you can install this plugin [nodebb-plugin-sanitizehtml](https://github.com/akhoury/nodebb-plugin-sanitizehtml) which will sanitize all the `<script>` tags, the `<a href='javascript:evil();'>` tags, etc. by default, even if you still want to allow safe `<a>` tags you still safely can, and all of your html content will look just fine. (`<img>` is not enabled by default, but you can just add it in the settings page)
* Strip all html tags out, and make everything as clear text

### Redis Note

Since the importer will be hitting the database constantely, with almost 0 interval, I would add these config to the bottom of your redis.conf file, to disable some stuff and make redis more responsive, but less safe, then after the migration is complete, you must, __before__ you kill your redis server, ```redis-cli bgsave``` to actually write the data to disk, then remove these extra configs and restart your redis server.
If you're a redis guru, you don't need my help, but take a look at it anyway and let me know where I went wrong :)
```
# NODEBB-PLUGIN-IMPORT TEMPORARY SETTINGS

# disabling saving !!!!
# then manually run 'redis-cli bgsave' after migration is done
save ""

stop-writes-on-bgsave-error no
rdbcompression no
rdbchecksum no
appendonly no
appendfsync no
no-appendfsync-on-rewrite yes
hz 100
aof-rewrite-incremental-fsync yes
```

### Storage results

After the import is done, you can open the storage files and see that the `imported` or `skipped` objects has been set appropriately. The `imported` ones have some extra data such as, `_redirect: { oldPath: '/users/123', newPath: '/user/elvis'}`, which you can use to create redirect rules. 

Also, in the users files, `u._uid`, there is a property `keptPicture`, which will be true if the user account had his/her own picture and NodeBB used it, this way you can iterate if you want and check which images 404s and remove them, but I'll let you do that.

### Limitations
* UNIX only (Linux, Mac) but no Windows support yet, it's one a time use, I probably won't support Windows soon.
* If you're migrating a very large forum, I'm talking about 300k records and up, expect to wait few hours, depending on your machine, but, you might need to hack and disable some things in NodeBB, temporarily. I can't figure out what yet, since NodeBB is highly active and unstable at the moment, but give me a buzz, I'll help you out. Also, once the next stable version comes out, I will stabilize this importer better, and find out how I can disable few NodeBB features just during the migration, to increase performance.

### Todo, some are for you to do.
* todo go through all users who has user.keptPicture == true, and test each image url if 200 or not and filter the ones pointing to my old forum avatar dir.
* todo create a nodebb-theme that works with the site
* todo send emails to all users with temp passwords, see the user u._uid example JSON and read the comments to find how to get the passwords 
* todo maybe implement a nbb plugin that enforces the 1 time use of temp passwords.
* todo TEST


    
