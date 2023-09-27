nodebb-plugin-import
=========
Import your old forum data to nodebb | a one time use plugin

# THIS PLUGIN ONLY SUPPORTS:
## [NodeBB v1.12.1](https://github.com/NodeBB/NodeBB/tree/v1.12.1)

but __you can upgrade__ after the import is done, make sure you follow the [upgrade docs](https://docs.nodebb.org/configuring/upgrade/)

```
git clone https://github.com/NodeBB/NodeBB.git
cd NodeBB
git checkout v1.12.1
npm install
node app --setup # i recommend using mongo over redis.
./nodebb start

# .. do the import...
# .. then when you're done and happy

git checkout v2.0.0
# or some other version higher than v1.12.1
./nodebb upgrade
```
If you want to import to an older nodebb version, you can, just checkout older versions of the plugin


## Screenshots
![screen shot 2015-12-09 at 8 50 35 pm](https://cloud.githubusercontent.com/assets/1398375/11704595/f66a8a00-9eb6-11e5-8592-5e0f2ca650ef.png)
![screen shot 2015-12-09 at 8 51 06 pm](https://cloud.githubusercontent.com/assets/1398375/11704593/f667be60-9eb6-11e5-856c-bdfacde800bf.png)
![screen shot 2015-12-09 at 8 51 27 pm](https://cloud.githubusercontent.com/assets/1398375/11704598/f66bcb36-9eb6-11e5-801a-081c516fc522.png)
![screen shot 2015-12-09 at 8 51 40 pm](https://cloud.githubusercontent.com/assets/1398375/11704597/f66bf37c-9eb6-11e5-9584-05f7c6a7ec37.png)
![screen shot 2015-12-09 at 8 53 02 pm](https://cloud.githubusercontent.com/assets/1398375/11704596/f66bf7c8-9eb6-11e5-89c6-03268dc3b4ed.png)
![screen shot 2015-12-09 at 8 53 12 pm](https://cloud.githubusercontent.com/assets/1398375/11704594/f6691350-9eb6-11e5-9713-5d2df1f3432a.png)


If you want a higher revision, import to the supported one, then just follow the upgrade procedure here https://docs.nodebb.org/en/latest/upgrading/index.html

## Usage

Install it and activate it from the NodeBB Admin Panel, or

```
npm install nodebb-plugin-import
```

then re-build nodebb

```
./nodebb build
```

then run nodebb

```
node app

# or
./nodebb start
```
__DISABLE ALL OTHER PLUGINS__ especially any DB indexer and Markdown

Activate it, then visit
[http://localhost:4567/admin/plugins/import](http://localhost:4567/admin/plugins/import)
(or whatever URL your instance lives on)

### Source forums support:

Keep in mind that some Exporters may not be compatible or updated will all versions. File an issue when it's not.

* [Works](https://github.com/akhoury/nodebb-plugin-import/blob/master/package.json#L55-L68)
* [In Progress, Needs testing or blocked (I need db dumps)](https://github.com/akhoury/nodebb-plugin-import/labels/Exporter)



### Can't find the exporter you need?
File an issue, request it. We usually would want a DB Dump and some time to write one out.

Or even better, write your own, see [write-my-own-exporter](./write-my-own-exporter.md)

### Future versions support
I will try to keep supporting future NodeBB versions, since it's still very young and I'm a fan,
but you need to submit an issue with all the details (NodeBB version, issue etc..), and I will help as fast as I can, or a pull request if you find an issue or a missing feature

### Imported, now what?

Once the importer is done, 4 Files will be available for you to download *(depending on your config, they may not be persisted for too long, so download them as soon as the import is done)*

* `redirect.map.json` Which is a map (which you would have configured beforhand  [snapshot](https://camo.githubusercontent.com/c9c4a2ffb0ae0e82a9367a3463f62bb12a7d8a0a/687474703a2f2f692e696d6775722e636f6d2f75487a507667642e706e67)) of all the old URLs and their corresponding new URLs if you want to redirect them correctly. This map is designed to work with [RedirectBB](https://github.com/akhoury/RedirectBB) which I wrote specifically for this purpose, but theoretically, you can write your own, or use an [nginx Map Module](http://wiki.nginx.org/HttpMapModule) or whatever else.
* `redirect.map.csv` same data as the json, but in csv, probably what you need for the nginx map module, (example [here](http://serverfault.com/a/441517), you probably need to find/replace all commas with a space and add a semi-colon at the end of each line, the latter you can just do when you setup the redirection template, just add the semicolon there, before downloading)

here's a sample **regexy** template setup that works with nginx, (still gotta replace commas with space(s))
![screen shot 2016-02-12 at 5 14 22 pm](https://cloud.githubusercontent.com/assets/1398375/13021971/27fd3ec8-d1ac-11e5-8d56-264707719ef4.png)

```
cp redirect.map.csv redirect.map
sed -i -e 's/,/    /g' redirect.map # replace each comma by 4 spaces
# you might also need to add a semi-colon ';' at the end of each line
# if you didn't do it when you setup the redirect templates
```
set up you nginx config
```
 map $request_uri $new {
       include /usr/share/nginx/html/redirect.map;
 }
```
Depending on how large your map file is, you might need to increase the limit
```
 server {
       # ....
      map_hash_max_size 123456789; # bytes
       # ....
 }
 ```
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

### Some common issues

* After converting your content, you should restart the server, NodeBB caches the content recently read in memory.
* `EMFILE too many open files` error, try disabling the server logs, there is an option for that
* `Segmentation fault` error, along with disabling server logs, try the Redis note, then file an issue, I'll help you through it.
* `Error: MISCONF Redis is configured to save RDB snapshots, but is currently not able to persist on disk.` see [the redis note](https://github.com/akhoury/nodebb-plugin-import#redis-note), it might help
* if NodeBB <= 0.5.1 hangs, similar [to this issue](https://github.com/akhoury/nodebb-plugin-import/issues/61), disable the Markdown plugin
* if you get an `uncaughtException: ER_WRONG_FIELD_WITH_GROUP: Expression #4 of SELECT list is not in GROUP BY clause and contains nonaggregated column 'somedatabase.somecolumn' which is not functionally dependent on columns in GROUP BY clause; this is incompatible with sql_mode=only_full_group_by` you will need to temporarily do this https://stackoverflow.com/a/35729681  

### Test

~~pfffffft~~
~~soon~~
....
