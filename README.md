nodebb-plugin-import
=========
Import your old forum data to nodebb | a one time use plugin

## Screenshots

![Imgur](http://i.imgur.com/rx1Ub5M.png)
![Imgur](http://i.imgur.com/bng3KFp.png)
![Imgur](http://i.imgur.com/aaWLORi.png)
![Imgur](http://i.imgur.com/01FUw0z.png)

### Works with NodeBB stable [v0.8.2](https://github.com/NodeBB/NodeBB/tree/v0.8.2)
```
git clone https://github.com/NodeBB/NodeBB.git
cd NodeBB
git checkout v0.8.2
npm install
```

If you want a higher revision, import to the supported one, then just follow the upgrade procedure here https://docs.nodebb.org/en/latest/upgrading/index.html

## Usage

Install it from the NodeBB Admin Panel, or
```
npm install nodebb-plugin-import
```
then run nodebb
```
./nodebb start
```
__DISABLE ALL OTHER PLUGINS__ especially any DB indexer and Markdown

Activate it, then visit
[http://localhost:4567/admin/plugins/import](http://localhost:4567/admin/plugins/import)
(or whatever URL your instance lives on)

### Source forums support:

Keep in mind that some Exporters may not be compatible or updated will all versions. File an issue when it's not.

* [Works](https://github.com/akhoury/nodebb-plugin-import/blob/master/package.json#L52-L65)
* [In Progress, Needs testing or blocked (I need db dumps)](https://github.com/akhoury/nodebb-plugin-import/labels/Exporter)



### Can't find the exporter you need?
File an issue, request it. We usually would want a DB Dump and some time to write one out.

Or even better, write your own, see [write-my-own-exporter](./write-my-own-exporter.md)

### Future versions support
I will try to keep supporting future NodeBB versions, since it's still very young and I'm a fan,
but you need to submit an issue with all the details (NodeBB version, issue etc..), and I will help as fast as I can, or a pull request if you find an issue or a missing feature

### Imported, now what?

Once the importer is done, 3 Files will be available for you to download *(depending on your config, they may not be persisted for too long, so download them as soon as the import is done)*

* `redirect.map.json` Which is a map (which you would have configured beforhand  [snapshot](https://camo.githubusercontent.com/c9c4a2ffb0ae0e82a9367a3463f62bb12a7d8a0a/687474703a2f2f692e696d6775722e636f6d2f75487a507667642e706e67)) of all the old URLs and their corresponding new URLs if you want to redirect them correctly. This map is designed to work with [RedirectBB](https://github.com/akhoury/RedirectBB) which I wrote specifically for this purpose, but theoretically, you can write your own, or use an [nginx Map Module](http://wiki.nginx.org/HttpMapModule) or whatever else.
* `users.csv`, which is just list of of all of the imported users, emails, oldId, newId, joindateTimeStamp, and most importantly, their new passwords (if you have configured the importer to generate passwords for you - i highly recommend against that, let them reset their passwords). Anyways, you can use this CSV file with this tool to blast an email to all of your users telling them what happened. http://akhoury.github.io/pages/mandrill-blast
* `users.json` same data as the csv, but in a json format.

### Redis Note
__you may not need to do that__: I didn't when I migrated over 350k records, I had a decent machine. (Ubuntu 12.04, 8GB Memory, 4 Cores, 80GB SSD Disk)

Since the importer will be hitting the database constantely, with almost 0 interval, I would add these config to the bottom of your redis.conf file, to disable some stuff and make redis more responsive, but less safe, then after the migration is complete, you must, __before__ you kill your redis server, ```redis-cli save``` to synchronously write the data to disk, then remove these extra configs and restart your redis server.
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

### Mongo Note

You should not need to do the same thing for redis, since Mongo immediately persists to disk.

### Markdown Note

NodeBB prefers using Markdown as the *content language format*, and since most Web 1.0 forums use either straight out __HTML__ or __BB Code__, there is a config option called `"convert"` which you can set to either `"html-to-md"` or `"bbcode-to-md"` and  while importing, the importer will convert the following:

- Users signatures
- Topics Content
- Topics Title
- Categories Names
- Categories Descriptions
- Posts Content

*If you are importing already 'markdownified' content, just don't set the `convert` option, or select "Don't convert" to skip the conversion, also if you are importing some other format, feel free to submit a pull request or open an issue, if there is a Node Module to it, or if there is some pre-built JS "function" to convert the content, I'll add it*

### Some common issues</h4>

* `EMFILE too many open files` error, try disabling the server logs, there is an option for that
* `Segmentation fault` error, along with disabling server logs, try the Redis note, then file an issue, I'll help you through it.
* `Error: MISCONF Redis is configured to save RDB snapshots, but is currently not able to persist on disk.` see [the redis note](https://github.com/akhoury/nodebb-plugin-import#redis-note), it might help
* if NodeBB <= 0.5.1 hangs, similar [to this issue](https://github.com/akhoury/nodebb-plugin-import/issues/61), disable the Markdown plugin

### Test

pfffffft
