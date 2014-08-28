nodebb-plugin-import
=========
Import your old forum data to nodebb | a one time use plugin

### Works with NodeBB v0.5.0-3
```
# If you want a higher revision, import to this one then just checkout master (or another stable higher 0.x.x+ release)
# and use the lovely ./nodebb upgrade
./nodebb upgrade

```

## Screenshots

![Imgur](http://i.imgur.com/aPbBTza.png)
![Imgur](http://i.imgur.com/SzHVU2Z.png)
![Imgur](http://i.imgur.com/uHzPvgd.png)
![Imgur](http://i.imgur.com/soRHXM3.png)

## Usage

Install it from the NodeBB Admin Panel, or
```
npm install nodebb-plugin-import
```
then run nodebb
```
./nodebb start
```
Activate it, then visit
[http://localhost:4567/admin/plugins/import](http://localhost:4567/admin/plugins/import)
(or whatever URL your instance lives on)

### Source forums support:

Keep in mind that some Exporters may not be compatible or updated will all versions. File an issue when it's not.

* UBB: https://github.com/akhoury/nodebb-plugin-import-ubb [WORKS]
* PhpBB: https://github.com/psychobunny/nodebb-plugin-import-phpbb [NEEDS-UPDATE] [issue](https://github.com/psychobunny/nodebb-plugin-import-phpbb/issues/1), I need a DB Dump
* PunBB: https://github.com/patricksebastien/nodebb-plugin-import-punbb [NEEDS-UPDATE] [issue](https://github.com/patricksebastien/nodebb-plugin-import-punbb/issues/1), I need a DB Dump
* vBulletin: https://github.com/MakerStudios/nodebb-plugin-vbexporter [NEEDS-UPDATE] [issue](https://github.com/MakerStudios/nodebb-plugin-vbexporter/issues/2), I need a DB Dump
* IP.Board: next in line, I got DB Dump! [issue](https://github.com/akhoury/nodebb-plugin-import/issues/34)
* MyBB: after IP.Board, I need a DB Dump [issue](https://github.com/akhoury/nodebb-plugin-import/issues/35)
* SMF: soon! Got a Dump! [issue](https://github.com/akhoury/nodebb-plugin-import/issues/33)

### Can't find the exporter you need?
File an issue, request it. We usually would want a DB Dump and some time to write one out.

Or even better, write your own, see [write-my-own-exporter](./write-my-own-exporter.md)

### Future versions support
I will try to keep supporting future NodeBB versions, since it's still very young and I'm a fan,
but you need to submit an issue with all the details (NodeBB version, issue etc..), and I will help as fast as I can, or a pull request if you find an issue or a missing feature

### Redis Note
__you may not need to do that__: I didn't when I migrated over 350k records, I had a decent machine. (Ubuntu 12.04, 8GB Memory, 4 Cores, 80GB SSD Disk)

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

### Mongo Note

see [Redis Note](https://github.com/akhoury/nodebb-plugin-import#redis-note), and try to mimic that in Mongo settings, I am not familiar with Mongo, so I wouldn't take my word for it.

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

* "EMFILE too many open files" error, try disabling the server logs, there is an option for that
* "Segmentation fault" error, along with disabling server logs, try changing the "convert" option to "Don't convert", that's most likely it, then file an issue, I'll help you through it.
* "Error: MISCONF Redis is configured to save RDB snapshots, but is currently not able to persist on disk." see [the redis note](https://github.com/akhoury/nodebb-plugin-import#redis-note), it might help

### Test

pfffffft
