nodebb-plugin-import
=========
Import your structured set of forum data to nodebb.

a refactor of: [nodebb-plugin-ubbmigrator](https://github.com/akhoury/nodebb-plugin-ubbmigrator)
into this general nodebb-plugin-import and [nodebb-plugin-import-ubb](https://github.com/akhoury/nodebb-plugin-import-ubb)

#### works, but still under-development, stay tuned.
<br />

### General Note
This is a not a normal NodeBB Plugin, at the moment there is no way to run it from the NodeBB/admin panel, so it doesn't really matter if it's activated or not, as long as you find this readme somehow.
you must install it in NodeBB/node_modules/nodebb-plugin-import, then you run it from the command line, for the time being, keep reading to find out how

### Requirements:
* NodeJS 
* NodeBB
* Pre-generated data, see [Source Files Structure]() below, you can generate them however you want, as long as you meet the end resutls.
I, for example, am writing this [nodebb-plugin-import-ubb](https://github.com/akhoury/nodebb-plugin-import-ubb) that exports [UBB Threads](http://www.ubbcentral.com/) data,
take a look at it to get an idea on how to generate them.


## Example usage
```
cd NodeBB
npm install nodebb-plugin-import
cd node_module/nodebb-plugin-import/bin
node import.js --storage="../storage" --config="../import.config.json" --log="debug" --flush
```

### Terminology
This section is almost at the top because it's very important for you to read it. let's make few things clear before we go on
* 'NodeBB' == 'NBB' == 'nbb' == 'Nbb'(you get the gist)
* when you see the term __OLD__ it refers to your source forum or bulletin-board
* when you the term __NEW__ it refers to NodeBB
* __ALL__ of the __OLD__ __variables__, must start with an __underscore__ character: `_`
* `_cid` --> old category id, some forum softwares use different for categories (such as 'forums')
* `_uid` --> old user id
* `_tid` --> old topic id
* `_pid` --> old post id
* `cid` --> new category id
* `uid` --> new user id
* `tid` --> new topic id
* `pid` --> new post id

## Source Files Structure
in order for the importer to consume your data, it must be saved in defined strcuture. For my [test storage](https://github.com/akhoury/nodebb-plugin-import/tree/master/test/storage), the storage directory looks like this:
```
$ ls ./storage/
_cids.json    _uids.json	p.10		p.7		t.1		t.4		u.1
_pids.json	c.1		p.11		p.8		t.2		t.5		u.2
_tids.json	c.2		p.12		p.9		t.3		t.6		u.3
```

### 4 Arrays of _ids
You must generate 4 arrays and save them in the following format

* `_cids.json` must contain an array of ALL of the _cids aka old category ids, if they're called 'forums' in your old software,  save them as 'categories', you're making a big a big change, start with this one. Here's a tiny example:
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

### The single files
The rest of the data must be in the following format:

#### category: c.[_id] file sample: 
every category data must be in have a seperate file, the file name must start with `c.[_cid]` i.e. `c.1`
```javascript
{
    "normalized": {
        // notice how all the old vairables start with an _
        // if any of the required variables fails, the category and all of its topics/posts will be skipped 
        "_cid": 1, // REQUIRED
        
        "_name": "Category 1", // REQUIRED
        
        "_description": "it's about category 1", // REQUIRED
        
        "_order": 1 // optional, defauls to _cids.json array order,
        
        "_skip": 0, // optional, if you want to intetionally skip that record
    },
    
    // either leave these two as null or remove them, but the 'normalized' key must exist in this structure
    "imported": null,
    "skipped": null
}
```
#### user: u.[_id] file sample: 
every user data must be a seperate file, the file name must start with `u.[_uid]` i.e `u.45`
```javascript
{
    "normalized": {
       // notice how all the old vairables start with an _
      // if any of the required variables fails, the user and all of its topics/posts will be skipped 

        "_uid": 45, // REQUIRED
        
        "_email": "u45@example.com", // REQUIRED
        
        "_username": "user45", // REQUIRED

        "_joindate": 1386475817370, // [UNIT: Milliseconds], optional, default to current, but what's the point of migrating if you dont preserve dates

        "_alternativeUsername": "u45alt", // optional, defaults to '', some forums provide UserDisplayName, we could leverage that if the _username validation fails 
        
        "_password": '', // optional, if you have them, or you want o generate them on your own, great, if not, one will be generated for each user
        // the passwords with the usernames, emails and some more stuff will be spit out in the logs
        // look for the [user-csv] OR [user-json] tags to grep for a list of them
        
        "_signature": "u45 signature", // optional, defaults to '', over 150 chars will be truncated with an '...' at the end
        "_website": "u45.com", // optional, defaults to ''
        
        "_banned": 0, // optional, defaults to 0 
        
        "_location": "u45 city", // optional, defaults to ''

        "_reputation": 1, // optional, defaults to 0, (there is a config for multiplying these with a number)
        
        "_profileviews": 1, // optional, defaults to 0
        
        "_birthday": "01/01/1977", // [FORMAT: mm/dd/yyyy] optional, defaults to ''
        "_showemail": 0, // optional, defaults to 0
        
        "_level": "administrator", // [OPTIONS: 'administrator' or 'moderator'] optional, defaults to '', also not that a moderator will become a Moderator on ALL categories at the moment.
       
        "_skip": 0, // optional, if you want to intetionally skip that record
    },
    
    // either leave these two as null or remove them, but the 'normalized' key must exist in this structure
    "imported": null,
    "skipped": null
}
```
#### topic: t.[_id] file sample: 
every topic data must be in have a seperate file, the file name must start with `t.[_tid]` i.e. `t.123`
##### Important Note On Topics and Posts: 
Most forums, in their database, when creating a topic, a post will be created immediately, which will containt that topic's content, usually this first post of each topic will have some sort of flag, such as `is_parent = 1` or `parent = 0` or something to differentiate between a __post-reply-post__ and a __topic-content-post__ (aka ParentPost), you may have to do some tables `join` to get each Topic's record, BUT remember to omit these ParentPosts from your posts query so they don't get imported twice.  
```javascript
{
    "normalized": {
       // notice how all the old vairables start with an _
      // if any of the required variables fails, the topic and all of its posts will be skipped 
      
        "_tid": 1, // REQUIRED
        
        "_uid": 1, // REQUIRED, THE OLD USER ID
        
        "_cid": 1, // REQUIRED, THE OLD CATEGORY ID
        
        "_title": "this is topic 1 Title", // optional, defaults to "Untitled :id"
        
        "_content": "This is the first content in this topic 1", // REQUIRED
        
        "_timestamp": 1386475817370, // [UNIT: Milliseconds] optional, defaults to current, but what's the point of migrating if you dont preserve dates
        
        "_viewcount": 10, // optional, defaults to 0
         
        "_locked": 0, // optional, defaults to 0
        
        "_deleted": 0, // optional, defaults to 0
        
        "_pinned": 1, // optional, defaults to 0
        
        "_skip": 0 // optional, if you want to intetionally skip that record
	},
    
    // either leave these two as null or remove them, but the 'normalized' key must exist in this structure
	"imported": null,
	"skipped": null
}
```

#### post: p.[_id] file sample: 
every post data must be a seperate file, the file name must start with `p.[_pid]` i.e. `p.6738213`
```javascript
{
    "normalized": {
      // notice how all the old vairables start with an _
      // if any of the required variables fails, the post will be skipped 
      
    	"_pid": 8, // REQUIRED, OLD POST ID
        
        "_tid": 1, // REQUIRED, OLD TOPIC ID
        
        "_uid": 2, // REQUIRED, OLD USER ID
        
        "_content": "Post content ba dum tss", // REQUIRED
        
        "_timestamp": 1386475829970 // [UNIT: Milliseconds] optional, defaults to current, but what's the point of migrating if you dont preserve dates. 
	},
    
    // either leave these two as null or remove them, but the 'normalized' key must exist in this structure
	"imported": null,
	"skipped": null
}
```

### Your config are required
These are the defaults
```javascript
    			log: 'info,warn,error,debug',
				// generate passwords for the users, yea, if none is provided
				passwordGen: {
					// chars selection menu
					chars: '{}.-_=+qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM1234567890',
					// password length
					len: 13
				},
                // SET all of the 'oldPath' templates based on your forum's paths
                // You can use any variable in the 'normalized' structure
                // BUT don't change the 'newPath' one since these are the NodeBB way
                // unless of course, you know what you're doing, like you want to add a Prefix or a query string
                // these will spit out in the logs with a [redirect] tag
                // save the logs!
				redirectTemplatesStrings: {
					// uses the underscore's templating engine
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
					// but if you're old-forums doesn't, feel free to edit that config
					// by default this is null to disable it and increase performance
					posts: null
					/*
					 posts: {
					 // here's an example on how ubb's post paths are:
					 oldPath: "/topics/<%= _tid %>/*#Post<%= _pid %>",
					 // even nbb does that too, it's easier to let javascript handle the "scroll" to a post this way
					 newPath: null // "/topic/<%= tid %>/#<%= pid %>"
					 }
					 */
				},
                // where are the storage files generated?
				storageDir: path.join(__dirname,  '../storage'),

				nbb: {
					setup: {
                        // this WILL FLUSH YOU DATABASE and attempt to run:
                        // node app --setup={...}
                        // with a merge of the values below and if you have NodeBB/config.json there too
						runFlush: true,
					
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
					categoriesTextColors: ['#FFFFFF'],
					categoriesBgColors: ['#ab1290','#004c66','#0059b2'],
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
  - NodeBB 0.1.x-edge (I am almost, updating daily, from nodebb/master during development but I will stablize at the NodeBB's 0.2.0 release)

### Future versions support

* Will keep supporting future NodeBB versions, since it's still very young and I'm a fan, but you need to submit an issue with all the details (NodeBB version, issue etc..), and I will help as fast as I can.

### Markdown Note
NodeBB 'prefers' Markdown as its main 'content' language, and it enables [nodebb-plugin-markdown](https://github.com/julianlam/nodebb-plugin-markdown) by default, which also aggressively sanitize all HTML from the content. Now, I know a lot for forum sofrware allow HTML content, and to be honest, converting from HTML to Markdown was such a memory hog, so I took it out of the importer. Here are your options:
* If you can, convert your HTML content to markdown
* If you can't, leave it as HTML, then, DISABLE html sanitization by __nodebb-plugin-markdown__, but don't stop there, this is a high security risk on you and your users, so you must sanitize UNSAFE html somehow, to do that you can install this plugin [nodebb-plugin-sanitizehtml](https://github.com/akhoury/nodebb-plugin-sanitizehtml) which will sanitize all the `<script>` tags, the `<a href='javascript:evil();'>` tags, by default, even if you still want to allow safe `<a>` tags, and the rest of the content will look just fine.
* Strip all html tags out, and make everything as clear text

### Redis Note

see [redis.conf](redis.conf), I would leave the default redis untouched, just add those to the bottom of your redis.conf file.
then after the migration is complete, you must, __before__ you kill your redis server, ```redis-cli bgsave``` to actually write the data to disk, then remove these extra configs and restart your redis server.
If you're an redis guru, you don't need my help, but take a look at it anyway and let me know where I went wrong :)

### Storage results

After the import is done, you can open the storage files and see that the `imported` or `skipped` objects has be set appropriately. The `imported` ones have some extra data such as, `_redirect: { oldPath: '/users/123', newPath: '/user/elvis'}`, which you can use to create redirect rules. Also, in the users files, `u._uid`, their is `keptPicture` which means that the user had his/her own picture and NodeBB used it. 

### Limitations
* UNIX only (Linux, Mac) but no Windows support yet, it's one a time use, I probably won't support Windows soon.
* If you're migrating very large forum, I'm talking about 200k records and up, expect to wait hours, depending on your machine, but, you might need to hack and disable some things in NodeBB, temporarily. Can't figure out what yet, since NodeBB is highly active and unstable at the moment, but give me a buzz, I'll help you out. once the next stable version comes out, I will stabilize this importer better.

### Todo, some are for you to do.
* todo-you go through all users who has user._keptPicture == true, and test each image url if 200 or not and filter the ones pointing to my old forum avatar dir.
* todo-you create a nodebb-theme that works with the site
* todo-you send emails to all users with temp passwords see
* todo-both maybe implement a nbb plugin that enforces the 1 time use of temp passwords.
* todo-both TEST


    
