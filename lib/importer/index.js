const nbbRequire = require('nodebb-plugin-require')
const path = require('path')
const _ = require('lodash')
const extend = require('extend')
const async = require('async')
const moment = require('moment')
const fs = require('fs-extra')

const nconf = nbbRequire('nconf')
const Meta = nbbRequire('src/meta')

const db = require('../database')
const Groups = require('../database/groups')
const Categories = require('../database/categories')
const User = require('../database/users')
const File = require('../database/file')
const Rooms = require('../database/rooms')
const Messaging = require('../database/messaging')
const Topics = require('../database/topics')
const Posts = require('../database/posts')
const Votes = require('../database/votes')
const Bookmarks = require('../database/bookmarks')
const privileges = require('../database/privileges')

const utils = require('../../static/lib/utils')
const helpers = require('../helpers')

const defaults = require('../config/defaults').importer

const EACH_LIMIT_BATCH_SIZE = 10

// todo use the real one
const LOGGEDIN_UID = 1

const logPrefix = '\n[nodebb-plugin-import]'
const noop = function () {}

const Importer = {}

Importer.setup = (exporter, config = {}) => {
    Importer.exporter = exporter
    Importer._config = extend(true, {}, defaults, config?.importer ?? config)
}

Importer.config = (config, val) => {
    if (config != null) {
        if (typeof config === 'object') {
            console.trace('Importer.config setting config', config)

            Importer._config = config
        } else if (typeof config === 'string') {
            if (val != null) {
                Importer._config = Importer._config || {}
                Importer._config[config] = val
            }
            return Importer._config[config]
        }
    }
    return Importer._config
}

Importer.backupAndSetTmpConfig = async () => {
    const backedConfig = await db.getObject('backedConfig')
    if (backedConfig) {
        return
    }

    // back up config
    const data = await db.getObject('config')
    // data.maximumChatMessageLength = 1000
    await db.setObject('backedConfig', Importer.config('backedConfig', data || {}))

    // set tmp config
    const config = extend(true, {}, Importer.config().backedConfig, Importer.config().nbbTmpConfig)

    if (Importer.config().autoConfirmEmails) {
        config.requireEmailConfirmation = 0
    }

    await db.setObject('config', config)
    await Meta.configs.init()
}

Importer.restoreConfig = async () => {
    const backedConfig = await db.getObject('backedConfig')
    if (!backedConfig) {
        console.warn('Could not restore NodeBB tmp configs')
        return
    }
    // backedConfig = Importer.config().backedConfig

    try {
        await db.setObject('config', backedConfig)
    } catch (err) {
        console.warn('Something went wrong while restoring your nbb configs')
        console.warn('here are your backed-up configs, you do it manually')
        console.warn(JSON.stringify(backedConfig))
        return
    }
    console.log('Config restored: ', backedConfig)
    await Promise.all([
        db.delete('backedConfig'),
        Meta.configs.init()
    ])
}

Importer.overrideCoreFunctions = () => {
    if (!Importer.originalNotifyUsersInRoom) {
        Importer.originalNotifyUsersInRoom = Messaging.notifyUsersInRoom
        Messaging.notifyUsersInRoom = noop
    }
    if (!Importer.sendWelcomeNotification) {
        Importer.sendWelcomeNotification = User.notifications.sendWelcomeNotification
        User.notifications.sendWelcomeNotification = noop
    }
}

Importer.restoreCoreFunctions = () => {
    Messaging.notifyUsersInRoom = Importer.originalNotifyUsersInRoom || Messaging.notifyUsersInRoom
    delete Importer.originalNotifyUsersInRoom

    User.notifications.sendWelcomeNotification = Importer.sendWelcomeNotification || User.notifications.sendWelcomeNotification
    delete Importer.sendWelcomeNotification
}

Importer.flushData = async () => {
    const progress = await Importer.getProgress()

    if (!Importer._config.flush) {
        return
    }

    let phases = [{
            name: 'groups',
            fn: Importer.flushGroups
        },
        {
            name: 'categories',
            fn: Importer.flushCategories
        },
        {
            name: 'users',
            fn: Importer.flushUsers
        },
        {
            name: 'rooms',
            fn: Importer.flushRooms
        },
        {
            name: 'messages',
            fn: Importer.flushMessages
        },
    ]

    if (progress && /^flushData/.test(progress.phase)) {
        const {
            phase,
            count,
            total
        } = progress
        const phasePart = phase.split(':').pop()
        phases = _.dropWhile(phases, (phase) => {
            return phase.name != phasePart
        })
        if (count == total) {
            phases.shift()
        }
    }

    phases = phases.map(phase => phase.fn)

    try {
        for await (const phase of phases) {
            await phase()
        }
    } catch (err) {
        console.error('An error has occured while importing data: ', err)
    }
}

Importer.flushGroups = async () => {
    const total = await Groups.count()
    console.log(`attempting to flush ${total} groups`)
    let count = 0
    await Groups.processSet(async (groups) => {
        const groupNames = Object.values(groups).filter(group => {
            count += 1
            if (!group) {
                return false
            }
            if (group.system && !group.__imported_original_data__) {
                console.log(`skipping group ${group.name}`)
                return false
            }
            return true
        }).map(group => group.name)
        await Groups.destroy(groupNames)
        await Importer.saveProgress({
            phase: 'flushData:groups',
            count,
            total
        })
    })
}

Importer.flushCategories = async () => {
    const total = await Categories.count()
    console.log(`attempting to flush ${total} catgories`)
    let count = 0
    await Categories.processCidsSet(async (ids) => {
        await async.eachLimit(ids, 10, async (id) => {
            count += 1
            // todo: importer progress
            await Categories.purge(id, LOGGEDIN_UID)
            await Importer.saveProgress({
                phase: 'flushData:categories',
                count,
                total
            })
        })
    }, {
        alwaysStartAt: 0
    })
}

Importer.flushUsers = async () => {
    const total = await User.count()
    console.log(`attempting to flush ${total} users`)
    let count = 0
    await User.processUidsSet(async (ids) => {
        await async.eachLimit(ids, 10, async (uid) => {
            count += 1
            if (uid != LOGGEDIN_UID) {
                await User.delete(LOGGEDIN_UID, uid)
            }
            await Importer.saveProgress({
                phase: 'flushData:categories',
                count,
                total
            })
        })
    })
}

Importer.flushRooms = async () => {
    const total = await Rooms.count()
    console.log(`attempting to flush ${total.length} rooms`)
    let count = 0
    await Rooms.each(async (room) => {
        if (!room) {
            return
        }
        const uids = await Messaging.getUidsInRoom(room.roomId, 0, -1)
        await Messaging.leaveRoom(uids, room.roomId)
        await db.delete(`chat:room:${room.roomId}`)
    })
}

Importer.flushMessages = async () => {
    const keys = await Messaging.count()
    console.log(`attempting to flush ${keys.length} messages`)
    await Messaging.each(async (message) => {
        await db.delete(`message:${message.mid}`)
    })
}

Importer.deleteTmpImportedSetsAndObjects = async () => {
    await Importer.saveProgress({
        phase: 'deleteTmpImportedSetsAndObjects'
    })
    console.log('Deleting imported sets and objects')
    await Groups.deleteEachImported()
    await Categories.deleteEachImported()
    await User.deleteEachImported()
    await Rooms.deleteEachImported()
    await Messaging.deleteEachImported()
    await Topics.deleteEachImported()
    await Posts.deleteEachImported()
    await Votes.deleteEachImported()
    await Bookmarks.deleteEachImported()
}

Importer.importGroups = async () => {
    const total = await Importer.exporter.countGroups()
    console.log(`Importing ${total} groups`)
    let count = 0
    await Importer.exporter.exportGroups(async (groups) => {
        for await (let [key, group] of Object.entries(groups)) {
            // console.log(`Importing group: ${group._name}`)
            if (!Groups.validateName(group._name)) {
                await Importer.saveProgress('importGroups', {
                    phase: 'importGroups',
                    count,
                    total
                })
                console.log(`Skipping ${group._name} (invalid name)`)
                continue
            }
            count += 1
            const {
                _gid
            } = group
            const _group = await Groups.getImported(_gid)
            if (_group && !Groups.validateName(_group.name)) {
                await Importer.saveProgress('importGroups', {
                    phase: 'importGroups',
                    count,
                    total
                })
                console.log(`Skipping ${group._name} (already exists)`)
                // todo: importer progress
                continue
            }

            const data = {
                name: (group._name || (`Group ${count + 1}`)).replace(/\//g, '-'),
                description: group._description || 'no description available',
                userTitle: group._userTitle,
                disableJoinRequests: group._disableJoinRequests,
                system: group._system || 0,
                private: group._private || 0,
                hidden: group._hidden || 0,
                timestamp: group._createtime || group._timestamp,
            }
            let importedGroup
            try {
                importedGroup = await Groups.create(data)
            } catch (e) {
                await Importer.saveProgress('importGroups', {
                    phase: 'importGroups',
                    count,
                    total
                })
                console.warn(`Failed to import group: ${group._name} ${group._id}`, e.message)
                continue
            }
            // todo: importer progress
            const fields = {
                __imported_original_data__: JSON.stringify(_.omit(group, [])),
                userTitleEnabled: utils.isNumber(group._userTitleEnabled) ? group._userTitleEnabled : 1,
                ...(group._fields || {}),
            }
            utils.deleteNullUndefined(fields)
            await db.setObject(`group:${importedGroup.name}`, fields)
            group.imported = true
            group = extend(true, {}, group, importedGroup, fields)
            groups[_gid] = group
            await Groups.setImported(_gid, 0, group)
            // console.log(`Done importing ${group._name}`)
            await Importer.saveProgress('importGroups', {
                phase: 'importGroups',
                count,
                total
            })
        }
    })
}

Importer.importCategories = async () => {
    const total = await Importer.exporter.countCategories()
    console.log(`Importing ${total} categories`)
    let count = 0
    let config = Importer.config()
    await Importer.exporter.exportCategories(async (categories) => {
        await async.eachSeries(categories, async (category) => {
            count += 1
            // console.log(`Importing category: ${category._name}:${category._cid}`)
            if (category.cid) {
                // todo: importer progress
                await Importer.saveProgress({
                    phase: 'importCategories',
                    count,
                    total
                })
                return await Categories.setImported(category._cid, category.cid, category)
            }

            const {
                _cid
            } = category
            const _category = await Categories.getImported(_cid)
            if (_category) {
                console.log(`Skipping ${_category._name}:${_category.cid} (already exists)`)
                await Importer.saveProgress({
                    phase: 'importCategories',
                    count,
                    total
                })
                // todo: importer progress
                return
            }
            const categoryData = {
                name: category._name || (`Category ${count + 1}`),
                description: category._description || 'no description available',
                backgroundImage: category._backgroundImage,
                // force all categories Parent to be 0, then after the import is done, we can iterate again and fix them.
                parentCid: 0,
                // same deal with disabled
                disabled: 0,
                // you can fix the order later, nbb/admin
                order: category._order || (count + 1),
                link: category._link || 0,
            }

            if (config?.categoriesIcons && config?.categoriesIcons.length) {
                categoryData.icon = category._icon || config.categoriesIcons[Math.floor(Math.random() * config.categoriesIcons.length)]
            }
            if (config?.categoriesBgColors && config?.categoriesBgColors.length) {
                categoryData.bgColor = category._bgColor || config.categoriesBgColors[Math.floor(Math.random() * config.categoriesBgColors.length)]
            }
            if (config?.categoriesTextColors && config?.categoriesTextColors.length) {
                categoryData.color = category._color || config.categoriesTextColors[Math.floor(Math.random() * config.categoriesTextColors.length)]
            }

            utils.deleteNullUndefined(categoryData)

            let categoryReturn

            try {
                categoryReturn = await Categories.create(categoryData)
            } catch (err) {
                console.warn(`skipping category:_cid: ${_cid} : ${err}`)
                return await Importer.saveProgress({
                    phase: 'importCategories',
                    count,
                    total
                })
            }

            const fields = {
                __imported_original_data__: JSON.stringify(_.omit(category, [])),
                // TODO: check if there' a better way to do this
                maxTags: Number.MAX_SAFE_INTEGER,
                minTags: 0,
                ...(category._fields || {}),
            }

            await db.setObject(`category:${categoryReturn.cid}`, fields)
            // todo: importer progress

            category.imported = true
            category = extend(true, {}, category, categoryReturn, fields)
            await Categories.setImported(_cid, categoryReturn.cid, category)
            // console.log(`Done importing ${category._name} new id ${category.cid}`)
            await Importer.saveProgress({
                phase: 'importCategories',
                count,
                total
            })
        })
    })
}

Importer.allowGuestsWriteOnAllCategories = () => {
    return Categories.each(async (category) => {
        await privileges.categories.allowGroupOnCategory('guests', category.cid)
    }, {
        async: true,
        eachLimit: 10
    })
}

Importer.importUsers = async () => {
    const total = await Importer.exporter.countUsers()
    let count = 0
    const picturesTmpPath = path.join(__dirname, 'tmp/pictures')
    const folder = '_imported_profiles'
    const picturesPublicPath = path.join(nconf.get('base_dir'), nconf.get('upload_path'), '_imported_profiles')
    const config = Importer.config()
    let oldOwnerNotFound = config.adminTakeOwnership.enable
    const startTime = +new Date()

    await fs.ensureDir(picturesTmpPath)
    await fs.ensureDir(picturesPublicPath)

    await Importer.exporter.exportUsers(async (users) => {
        await async.eachSeries(users, async (user) => {
            count += 1
            // console.log(user)
            if (user.uid) {
                console.warn(`Skipping user: ${user.username}`)
                await User.setImported(user._uid, user.uid, user)
                return await Importer.saveProgress({
                    phase: 'importUsers',
                    count,
                    total
                })
            }

            const {
                _uid
            } = user

            const _user = await User.getImported(_uid)
            if (_user) {
                console.warn(`Skipping imported user ${_user._username}`)
                return await Importer.saveProgress({
                    phase: 'importUsers',
                    count,
                    total
                })
            }

            const nbbValidUsername = helpers.makeValidNbbUsername(user._username || '', user._alternativeUsername || '')

            let password, generatedPassword

            if (config.passwordGen.enabled) {
                generatedPassword = helpers.genRandPwd(config.passwordGen.len, config.passwordGen.chars)
                password = generatedPassword
            } else {
                password = user._password
            }

            const userData = {
                username: nbbValidUsername.username,
                email: user._email,
                password,
            }

            if (!userData.username) {
                console.warn(`[process-count-at:${count}] skipping _username:${user._username}:_uid:${user._uid}, username is invalid.`)
                return await Importer.saveProgress({
                    phase: 'importUsers',
                    count,
                    total
                })
            }

            // console.log(`[process-count-at: ${count}] saving user:_uid: ${_uid}`)

            let uid

            if (oldOwnerNotFound &&
                parseInt(user._uid, 10) === parseInt(config.adminTakeOwnership._uid, 10) ||
                (user._username || '').toLowerCase() === config.adminTakeOwnership._username.toLowerCase()
            ) {
                console.warn(`[process-count-at:${count}] skipping user: ${user._username}:${user._uid}, it was revoked ownership by the LOGGED_IN_UID=${LOGGEDIN_UID}`)
                // cache the _uid for the next phases
                Importer.config('adminTakeOwnership', {
                    enable: true,
                    username: user._username,
                    // just an alias in this case
                    _username: user._username,
                    _uid: user._uid,
                })
                // no need to make it a mod or an admin, it already is
                user._level = null
                // set to false so we don't have to match all users
                oldOwnerNotFound = false
                // dont create, but set the fields
                uid = LOGGEDIN_UID
            } else {
                try {
                    uid = await User.create(userData)
                } catch (err) {
                    if (err.message === '[[error:email-taken]]' && (config.overrideDuplicateEmailDataWithOriginalData || true)) {
                        uid = await User.getUidByEmail(userData.email)
                    } else if (err.message === '[[error:email-taken]]' && config.importDuplicateEmails) {
                        userData.email = helpers.incrementEmail(userData.email)
                        uid = await User.create(userData)
                    } else {
                        console.warn(`[process-count-at: ${count}] skipping username: "${user._username}", error: `, err)
                        return await Importer.saveProgress({
                            phase: 'importUsers',
                            count,
                            total
                        })
                    }
                }
            }

            if ((`${user._level}`).toLowerCase() === 'moderator') {
                await Groups.joinAt('Global Moderators', uid, user._joindate || startTime)
                console.warn(`${userData.username} just became a Global Moderator`)
            } else if ((`${user._level}`).toLowerCase() === 'administrator') {
                await Groups.joinAt('administrators', uid, user._joindate || startTime)
                console.warn(`${userData.username} became an Administrator`)
            }

            if (user._groups && user._groups.length) {
                await async.eachSeries(user._groups, async (_gid) => {
                    const _group = await Groups.getImported(_gid)
                    if (_group && _group.name) {
                        try {
                            await Groups.joinAt(_group._name, uid, user._joindate || startTime)
                        } catch (err) {
                            console.warn(`Error joining group.name:${_group._name} for uid:${uid}`)
                        }
                    }
                })
            }

            const fields = {
                // preseve the signature, but Nodebb allows a max of 255 chars, so i truncate with an '...' at the end
                signature: user._signature || '',
                website: user._website || '',
                location: user._location || '',
                joindate: user._joindate || startTime,
                reputation: (user._reputation || 0) * config.userReputationMultiplier,
                profileviews: user._profileViews || 0,
                fullname: user._fullname || '',
                birthday: user._birthday || '',
                showemail: user._showemail ? 1 : 0,
                showfullname: user._showfullname ? 1 : 0,
                lastposttime: user._lastposttime || user._lastonline || 0,
                lastonline: user._lastonline || user._lastposttime || user._joindate,

                'email:confirmed': config.autoConfirmEmails ? 1 : 0,

                // this is a migration script, no one is online
                status: 'offline',

                // don't ban the users now, ban them later, if _imported_user:_uid._banned == 1
                banned: 0,
                ...(user._fields || {}),
                __imported_original_data__: JSON.stringify(_.omit(user, ['_pictureBlob', '_password', '_hashed_password', '_tmp_autogenerated_password'])),
            }

            utils.deleteNullUndefined(fields)

            let keptPicture = false

            if (user._pictureBlob) {
                const filename = user._pictureFilename ? `_${uid}_${user._pictureFilename}` : `${uid}.png`
                const tmpPath = path.join(picturesTmpPath, filename)

                try {
                    await helpers.writeBlob(tmpPath, user._pictureBlob)
                    try {
                        const ret = await File.saveFileToLocal(filename, folder, tmpPath)
                        fields.uploadedpicture = ret.url
                        fields.picture = ret.url
                        keptPicture = true
                    } catch (err) {
                        console.warn(filename, err)
                    }
                } catch (err) {
                    console.warn(tmpPath, err)
                }
            } else if (user._picture) {
                fields.uploadedpicture = user._picture
                fields.picture = user._picture
                keptPicture = true
            }

            await User.setUserFields(uid, fields)

            user.imported = true

            fields.uid = uid
            user = extend(true, {}, user, fields)
            user.keptPicture = keptPicture
            user.userslug = nbbValidUsername.userslug
            users[_uid] = user

            await User.setImported(_uid, uid, user)

            if (config.autoConfirmEmails && db.keys) {
                await Promise.all([
                    (async () => {
                        const keys = await db.keys('confirm:*')
                        await db.deleteAll(keys)
                    })(),
                    (async () => {
                        const keys = await db.keys('email:*:confirm')
                        await db.deleteAll(keys)
                    })(),
                ])
            }

            await Importer.saveProgress({
                phase: 'importUsers',
                count,
                total
            })
        })
    })

    await fs.remove(picturesTmpPath)
}

Importer.importRooms = async () => {
    const total = await Importer.exporter.countRooms()
    let count = 0
    console.log(`Importing ${total} rooms.`)
    await Importer.exporter.exportRooms(async (rooms) => {
        await async.eachSeries(rooms, async (room) => {
            count += 1
            const {
                _roomId
            } = room

            const _room = await Rooms.getImported(_roomId)
            if (_room) {
                return await Importer.saveProgress({
                    phase: 'importRooms',
                    count,
                    total
                })
            }

            let [fromUser, toUsers] = await Promise.all([
                User.getImported(room._uid),
                async.map(room._uids, async (id) => {
                    return await User.getImported(id)
                })
            ])

            toUsers = toUsers[1].filter(u => !!u)

            if (!fromUser || !toUsers.length) {
                console.warn(`[process-count-at: ${count}] skipping room:_roomId: ${_roomId} _uid:${room._uid}:imported: ${!!fromUser}, _uids:${room._uids}:imported: ${!!toUsers.length}`)
                return await Importer.saveProgress({
                    phase: 'importRooms',
                    count,
                    total
                })
            }

            let newRoom
            try {
                newRoom = await Messaging.newRoomWithNameAndTimestamp(fromUser.uid, toUsers.map(u => u.uid), room._roomName, room._timestamp)
            } catch (err) {
                console.warn(`[process-count-at: ${count}] skipping room:_roomId: ${_roomId} _uid:${room._uid}:imported: ${!!fromUser}, _uids:${room._uids}:imported: ${!!toUsers.length} err: ${err.message}`)
                return await Importer.saveProgress({
                    phase: 'importRooms',
                    count,
                    total
                })
            }
            room = extend(true, {}, room, newRoom)
            await Rooms.setImported(_roomId, newRoom.roomId, room)
            await Importer.saveProgress({
                phase: 'importRooms',
                count,
                total
            })
        })
    })
}

Importer.importMessages = async () => {
    const total = await Importer.exporter.countMessages()
    let count = 0
    console.log(`Importing ${total} messages.`)

    await Importer.exporter.exportMessages(async (messages) => {
        await async.eachSeries(messages, async (message) => {
            count += 1
            const {
                _mid
            } = message

            const _message = await Messaging.getImported(_mid)
            if (_message) {
                return await Importer.saveProgress({
                    phase: 'importMessages',
                    count,
                    total
                })
            }

            const [
                fromUser,
                toUser,
                toRoom
            ] = await Promise.all([
                User.getImported(message._fromuid),
                User.getImported(message._touid),
                Rooms.getImported(message._roomId)
            ])

            if (!fromUser) {
                console.warn(`[process-count-at: ${count}] skipping message:_mid: ${_mid} _fromuid:${message._fromuid}:imported: ${!!fromUser}, _roomId:${message._roomId}:imported: ${!!toRoom}, _touid:${message._touid}:imported: ${!!toUser}`)
                return await Importer.saveProgress({
                    phase: 'importMessages',
                    count,
                    total
                })
            }

            let room

            if (toUser) {
                const pairPrefix = '_imported_messages_pair:'
                const pairID = [parseInt(fromUser.uid, 10), parseInt(toUser.uid, 10)].sort().join(':')
                let pairData
                try {
                    pairData = await db.getObject(pairPrefix + pairID)
                    if (!pairData || !pairData.roomId) {
                        room = await Messaging.newRoomWithNameAndTimestamp(fromUser.uid, [toUser.uid], `Room:${fromUser.uid}:${toUser.uid}`, message._timestamp)
                        await db.setObject(pairPrefix + pairID, room)
                    } else {
                        room = {
                            roomId: pairData.roomId
                        }
                    }
                } catch (err) {
                    room = await Messaging.newRoomWithNameAndTimestamp(fromUser.uid, [toUser.uid], `Room:${fromUser.uid}:${toUser.uid}`, message._timestamp)
                    await db.setObject(pairPrefix + pairID, room)
                }
            }

            if (!room) {
                console.warn(`[process-count-at: ${count}] skipping message:_mid: ${_mid} _fromuid:${message._fromuid}:imported: ${!!fromUser}, _roomId:${message._roomId}:imported: ${!!toRoom}, _touid:${message._touid}:imported: ${!!toUser}`)
                return await Importer.saveProgress({
                    phase: 'importMessages',
                    count,
                    total
                })
            }

            // console.log(`[process-count-at: ${count}] saving message:_mid: ${_mid} _fromuid:${message._fromuid}, _roomId:${room.roomId}`)

            let messageReturn

            try {
                messageReturn = await Messaging.addMessage({
                    uid: fromUser.uid,
                    roomId: room.roomId,
                    content: message._content,
                    timestamp: message._timestamp,
                    ip: message._ip
                })
            } catch (err) {
                console.warn(`[process-count-at: ${count}] skipping message:_mid: ${_mid} _fromuid:${message._fromuid}:imported: ${!!fromUser}, _roomId:${message._roomId}:imported: ${!!toRoom}, _touid:${message._touid}:imported: ${!!toUser}${err ? ` err: ${err.message}` : ` messageReturn: ${!!messageReturn}`}`)
                return await Importer.saveProgress({
                    phase: 'importMessages',
                    count,
                    total
                })
            }

            if (!messageReturn) {
                console.warn(`[process-count-at: ${count}] skipping message:_mid: ${_mid} _fromuid:${message._fromuid}:imported: ${!!fromUser}, _roomId:${message._roomId}:imported: ${!!toRoom}, _touid:${message._touid}:imported: ${!!toUser}${err ? ` err: ${err.message}` : ` messageReturn: ${!!messageReturn}`}`)
                return await Importer.saveProgress({
                    phase: 'importMessages',
                    count,
                    total
                })
            }

            const {
                mid,
                roomId
            } = messageReturn
            delete messageReturn._key

            try {
                await Promise.all([
                    db.setObjectField(`message:${mid}`, '__imported_original_data__', JSON.stringify(message)),
                    (async () => {
                        const uids = await Messaging.getUidsInRoom(roomId, 0, -1)
                        await db.sortedSetsRemove(uids.map(uid => `uid:${uid}:chat:rooms:unread`), roomId)
                    })(),
                ])
            } catch (err) {
                console.warn(`[process-count-at: ${count}] message creation error message:_mid: ${_mid}:mid:${mid}`)
                return
            }

            message = extend(true, {}, message, messageReturn)
            await Messaging.setImported(_mid, mid, message)
            return await Importer.saveProgress({
                phase: 'importMessages',
                count,
                total
            })
        })
    })
}

Importer.importTopics = async () => {
    let count = 0
    const attachmentsTmpPath = path.join(__dirname, '/tmp/attachments')
    const folder = '_imported_attachments'
    const attachmentsPublicPath = path.join(nconf.get('base_dir'), nconf.get('upload_path'), '_imported_attachments')
    const config = Importer.config()

    await fs.ensureDir(attachmentsTmpPath)
    await fs.ensureDir(attachmentsPublicPath)

    const total = await Importer.exporter.countTopics()
    await Importer.exporter.exportTopics(async (topics) => {
        await async.eachSeries(topics, async (topic) => {
            count += 1

            if (topic.tid && parseInt(topic.tid, 10) === 1) {
                // todo: importer progress
                await Topics.setImported(topic._tid, topic.tid, topic)
                return await Importer.saveProgress({
                    phase: 'importTopics',
                    count,
                    total
                })
            }

            const {
                _tid
            } = topic

            const _topic = await Topics.getImported(_tid)
            if (_topic) {
                console.warn(`[process-count-at:${count}] topic:_tid:"${_tid}", already imported`)
                return await Importer.saveProgress({
                    phase: 'importTopics',
                    count,
                    total
                })
            }

            let [category, user] = await Promise.all([
                Categories.getImported(topic._cid),
                (async () => {
                    if (topic._uid) {
                        return await User.getImported(topic._uid)
                    } else if (topic._uemail) {
                        const uid = await User.getUidByEmail(topic._uemail)
                        return await User.getUserData(uid)
                    } else {
                        return null
                    }
                })()
            ])

            if (!category) {
                console.warn(`[process-count-at:${count}] topic:_tid:"${_tid}", has a category:_cid:"${topic._cid}" that was not imported`)
                return await Importer.saveProgress({
                    phase: 'importTopics',
                    count,
                    total
                })
            }

            if (!user) {
                console.warn(`[process-count-at:${count}] topic:_tid:"${_tid}", has a user:_uid:"${topic._uid}" that was not imported`)
                return await Importer.saveProgress({
                    phase: 'importTopics',
                    count,
                    total
                })
            }

            // console.log(`[process-count-at:${count}] saving topic:_tid: ${_tid}`)

            if (topic._attachmentsBlobs && topic._attachmentsBlobs.length) {
                let attachmentsIndex = 0

                topic._attachments = [].concat(topic._attachments || [])
                topic._images = [].concat(topic._images || [])

                await async.eachSeries(topic._attachmentsBlobs, async (_attachmentsBlob) => {
                    const filename = `attachment_t_${_tid}_${attachmentsIndex++}${_attachmentsBlob.filename ? `_${_attachmentsBlob.filename}` : _attachmentsBlob.extension}`
                    const tmpPath = path.join(attachmentsTmpPath, filename)

                    try {
                        let ret
                        const ftype = await helpers.writeBlob(tmpPath, _attachmentsBlob.blob)
                        try {
                            ret = await File.saveFileToLocal(filename, folder, tmpPath)
                            if (/image/.test(ftype.mime)) {
                                topic._images.push(ret.url)
                            } else {
                                topic._attachments.push(ret.url)
                            }
                        } catch (err) {
                            console.warn(filename, err)
                        }
                    } catch (err) {
                        console.warn(tmpPath, err)
                    }
                })
            }

            topic._content = topic._content || ''
            topic._title = helpers.slugify(topic._title) ? topic._title[0].toUpperCase() + topic._title.substr(1) : utils.truncate(topic._content, 100)

            topic._images = topic._images || []
            topic._images.forEach((_image) => {
                topic._content += helpers.generateImageTag(_image)
            })

            topic._attachments = topic._attachments || []
            topic._attachments.forEach((_attachment) => {
                topic._content += helpers.generateAnchorTag(_attachment)
            })

            if (topic._tags && !Array.isArray(topic._tags)) {
                topic._tags = (`${topic._tags}`).split(',')
            }

            const returnTopic = await Topics.post({
                uid: !config.adminTakeOwnership.enable ? user.uid : parseInt(config.adminTakeOwnership._uid, 10) === parseInt(topic._uid, 10) ? LOGGEDIN_UID : user.uid,
                title: topic._title,
                content: topic._content,
                timestamp: topic._timestamp,
                ip: topic._ip,
                handle: topic._handle || topic._guest,
                cid: category.cid,
                thumb: topic._thumb,
                tags: topic._tags
            })
            
            // await Topics.createTags(topic._tags, returnTopic.topicData.tid, Date.now())
            
            topic.imported = true

            const topicFields = {
                viewcount: topic._views || topic._viewcount || topic._viewscount || 0,

                // assume that this topic not locked for now, but will iterate back again at the end and lock it back after finishing the importPosts()
                // locked: normalizedTopic._locked ? 1 : 0,
                locked: 0,

                deleted: topic._deleted ? 1 : 0,

                // if pinned, we should set the db.sortedSetAdd('cid:' + cid + ':tids', Math.pow(2, 53), tid)
                pinned: topic._pinned ? 1 : 0,

                __imported_original_data__: JSON.stringify(_.omit(topic, ['_attachmentsBlobs'])),
                ...(topic._fields || {})
            }

            const postFields = {
                votes: topic._votes || 0,
                reputation: topic._reputation || 0,
                edited: topic._edited || 0,
            }

            utils.deleteNullUndefined(topicFields)
            utils.deleteNullUndefined(postFields)

            if (topic._pinned) {
                await Topics.tools.forcePin(returnTopic.topicData.tid)
            } else {
                await db.sortedSetAdd(`cid:${category.cid}:tids`, topic._timestamp, returnTopic.topicData.tid)
            }

            await db.setObject(`topic:${returnTopic.topicData.tid}`, topicFields)
            await Posts.setPostFields(returnTopic.postData.pid, postFields)
            topic = extend(true, {}, topic, topicFields, returnTopic.topicData)
            topics[_tid] = topic
            await Topics.setImported(_tid, returnTopic.topicData.tid, topic)
            await Importer.saveProgress({
                phase: 'importTopics',
                count,
                total
            })
        })

        await fs.remove(attachmentsTmpPath)
    })
}

Importer.importPosts = async () => {
    const startTime = +new Date()
    const attachmentsTmpPath = path.join(__dirname, '/tmp/attachments')
    const folder = '_imported_attachments'
    const attachmentsPublicPath = path.join(nconf.get('base_dir'), nconf.get('upload_path'), '_imported_attachments')
    const config = Importer.config()

    let count = 0
    const total = await Importer.exporter.countPosts()
    console.log(`Importing ${total} posts.`)

    await fs.ensureDir(attachmentsTmpPath)
    await fs.ensureDir(attachmentsPublicPath)

    await Importer.exporter.exportPosts(async (posts) => {
        await async.eachSeries(posts, async (post) => {
            count += 1

            const {
                _pid
            } = post

            const _post = await Posts.getImported(_pid)
            if (_post) {
                return await Importer.saveProgress({
                    phase: 'importPosts',
                    count,
                    total
                })
            }

            const [
                topic,
                user = {
                    uid: 0
                },
                toPost = {
                    pid: null
                }
            ] = await Promise.all([
                Topics.getImported(post._tid),
                (async () => {
                    if (post._uid) {
                        return await User.getImported(post._uid)
                    } else if (post._uemail) {
                        const uid = await User.getUidByEmail(post._uemail)
                        return await User.getUserData(uid)
                    }
                })(),
                (async () => {
                    if (!post._toPid) {
                        return undefined
                    }
                    return await Posts.getImported(post._toPid)
                })()
            ])

            if (!topic) {
                console.log(`[process-count-at: ${count}] skipping post:_pid: ${_pid} _tid:${post._tid}:uid:${user.uid}:_uid:${post._uid} imported: ${!!topic}`)
                return await Importer.saveProgress({
                    phase: 'importPosts',
                    count,
                    total
                })
            }

            if (post._attachmentsBlobs && post._attachmentsBlobs.length) {
                let attachmentsIndex = 0

                post._attachments = [].concat(post._attachments || [])
                post._images = [].concat(post._images || [])

                await async.eachSeries(post._attachmentsBlobs, async (_attachmentsBlob) => {
                    const filename = `attachment_p_${_pid}_${attachmentsIndex++}${_attachmentsBlob.filename ? `_${_attachmentsBlob.filename}` : _attachmentsBlob.extension}`
                    const tmpPath = path.join(attachmentsTmpPath, filename)
                    try {
                        const {
                            ftype,
                            ret
                        } = await File.writeBlobAndSaveFileToLocal(tmpPath, _attachmentsBlob.blob, filename, folder)
                        if (/image/.test(ftype.mime)) {
                            post._images.push(ret.url)
                        } else {
                            post._attachments.push(ret.url)
                        }
                    } catch (err) {
                        console.error('and error has occured while saving post attachments and images: ', err)
                    }
                })
            }

            post._content = post._content || ''
            if ((post._images && post._images.length) || (post._attachments && post._attachments.length)) {
                post._content += '\n<br>\n<br>'
            }
            post._images = post._images || []
            post._images.forEach((_image) => {
                post._content += helpers.generateImageTag(_image)
            })
            post._attachments = post._attachments || []
            post._attachments.forEach((_attachment) => {
                post._content += helpers.generateAnchorTag(_attachment)
            })

            if (post._tags && !Array.isArray(post._tags)) {
                post._tags = (`${post._tags}`).split(',')
            }

            const postReturn = await Posts.create({
                uid: !config.adminTakeOwnership.enable ? user.uid : config.adminTakeOwnership._uid === post._uid ? 1 : user.uid,
                tid: topic.tid,
                content: post._content,
                timestamp: post._timestamp || startTime,
                handle: post._handle || post._guest,
                ip: post._ip,
                toPid: toPost.pid,
            })

            const fields = {
                reputation: post._reputation || 0,
                votes: post._votes || 0,

                edited: post._edited || 0,
                deleted: post._deleted ? 1 : 0,

                __imported_original_data__: JSON.stringify(_.omit(post, ['_attachmentsBlobs'])),
                ...(post._fields || {})
            }

            utils.deleteNullUndefined(fields)

            post = extend(true, {}, post, fields, postReturn)
            post.imported = true

            await Promise.all([
                db.setObject(`post:${postReturn.pid}`, fields),
                Posts.setImported(_pid, post.pid, post),
                Importer.saveProgress({
                    phase: 'importPosts',
                    count,
                    total
                })
            ])
        })
    })
}

Importer.importVotes = async () => {
    let count = 0
    let selfVoted = 0
    const total = await Importer.exporter.countVotes()
    console.log(`Importing ${total} votes.`)
    await Importer.exporter.exportVotes(async (votes) => {
        await async.eachSeries(votes, async (vote) => {
            count += 1
            const {
                _vid
            } = vote

            const _vote = await Votes.getImported(_vid)
            if (_vote) {
                return await Importer.saveProgress({
                    phase: 'importVotes',
                    count,
                    total
                })
            }

            console.log(`[process-count-at:${count}] saving vote:_vid: ${_vid}`)

            const [post, topic, user] = await Promise.all([
                (async () => {
                    if (!vote._pid) {
                        return null
                    }
                    return await Posts.getImported(vote._pid)
                })(),
                (async () => {
                    if (!vote._tid) {
                        return null
                    }
                    return await Topics.getImported(vote._tid)
                })(),
                (async () => {
                    if (vote._uemail) {
                        const uid = await User.getUidByEmail(vote._uemail)
                        return await User.getUserData(uid)
                    } else {
                        return await User.getImported(vote._uid)
                    }
                })()
            ])

            const voterUid = (user || {}).uid
            const targetUid = (post || topic || {}).uid
            const targetPid = (post || {}).pid || (topic || {}).mainPid

            if (targetUid == voterUid) {
                selfVoted += 1
                return await Importer.saveProgress({
                    phase: 'importVotes',
                    count,
                    total
                })
            }

            if ((!post && !topic) || !user) {
                console.warn(`[process-count-at: ${count}] skipping vote:_vid: ${_vid
                }${vote._tid ? `, vote:_tid:${vote._tid}:imported:${!!topic}` : ''
                }${vote._pid ? `, vote:_pid:${vote._pid}:imported:${!!post}` : ''
                }, user:_uid:${vote._uid}:imported:${!!user}`)

                return await Importer.saveProgress({
                    phase: 'importVotes',
                    count,
                    total
                })
            }

            let voteReturn
            if (vote._action == -1) {
                voteReturn = await Posts.downvote(targetPid, voterUid)
            } else {
                voteReturn = await Posts.upvote(targetPid, voterUid)
            }

            vote.imported = true
            vote = extend(true, {}, vote, voteReturn)
            votes[_vid] = vote
            await Votes.setImported(_vid, +new Date(), vote)
            await Importer.saveProgress({
                phase: 'importVotes',
                count,
                total
            })
        })
    })
}

Importer.importBookmarks = async () => {
    let count = 0
    const total = await Importer.exporter.countBookmarks()
    console.log(`Importing ${total} bookmarks.`)
    await Importer.exporter.exportBookmarks(async (bookmarks) => {
        await async.eachSeries(bookmarks, async (bookmark) => {
            count += 1
            const {
                _bid
            } = bookmark

            const _bookmark = await Bookmarks.getImported(_bid)
            if (_bookmark) {
                return await Importer.saveProgress({
                    phase: 'importBookmarks',
                    count,
                    total
                })
            }

            console.log(`[process-count-at:${count}] saving bookmark:_bid: ${_bid}`)

            const [topic, user] = await Promise.all([
                Topics.getImported(bookmark._tid),
                User.getImported(bookmark._uid)
            ])

            if (!topic || !user) {
                console.warn(`[process-count-at: ${count}] skipping bookmark:_bid: ${
                _bid}, topic:_tid:${bookmark._tid}:imported:${!!topic}, user:_uid:${bookmark._uid}:imported:${!!user}`)
                return await Importer.saveProgress({
                    phase: 'importBookmarks',
                    count,
                    total
                })
            }

            const bookmarkReturn = await Topics.setUserBookmark(topic.tid, user.uid, bookmark._index)

            bookmark.imported = true
            bookmark = extend(true, {}, bookmark, bookmarkReturn)
            bookmarks[_bid] = bookmark

            await Bookmarks.setImported(_bid, +new Date(), bookmark)
            await Importer.saveProgress({
                phase: 'importBookmarks',
                count,
                total
            })
        })
    })
}

Importer.fixCategoriesParentsAndAbilities = async () => {
    const total = await Categories.count()
    let count = 0
    await Categories.each(async (category) => {
        count += 1
        if (!category) {
            return await Importer.saveProgress({
                phase: 'fixCategoriesParentsAndAbilities',
                count,
                total
            })
        }
        let disabled = 0
        let parentCategory = null
        const __imported_original_data__ = utils.jsonParseSafe((category || {}).__imported_original_data__, {})
        if (parseInt(__imported_original_data__._disabled, 10)) {
            disabled = 1
        }
        if (__imported_original_data__._parentCid) {
            parentCategory = await Categories.getImported(__imported_original_data__._parentCid)
        }
        const hash = {}
        if (disabled) {
            hash.disabled = 1
        }
        if (parentCategory && parentCategory.parentCid) {
            hash.parentCid = parentCid
        }
        hash.maxTags = null
        hash.minTags = null
        if (Object.keys(hash).length) {
            await Promise.all([
                db.setObject(`category:${category.cid}`, hash),
                ...((parentCategory && parentCategory.parentCid) ? [
                    db.sortedSetAdd(`cid:${parentCid}:children`, category.order || category.cid, category.cid),
                    db.sortedSetRemove('cid:0:children', category.cid)
                ] : [])
            ])
        }
        await Importer.saveProgress({
            phase: 'fixCategoriesParentsAndAbilities',
            count,
            total
        })
    }, {
        async: true,
        eachLimit: 10
    })
}

Importer.fixTopicsTeasers = async () => {
    let count = 0
    const total = await Topics.count()
    await Topics.each(async (topic) => {
        count += 1
        await Topics.updateTeaser(topic.tid)
        await Importer.saveProgress({
            phase: 'fixTopicsTeasers',
            count,
            total
        })
    }, {
        async: true,
        eachLimit: EACH_LIMIT_BATCH_SIZE
    })
}

Importer.rebanMarkReadAndFollowForUsers = async () => {
    let count = 0
    const total = await User.count()

    const banUser = async (user) => {
        if (!user || !parseInt(user.__imported_original_data__._banned, 10)) {
            return
        }
        await User.ban(user.uid)
        console.log(`[process-count-at: ${count}] banned user:${user.uid} back`)
    }

    const markTopicsAsRead = async (user = null) => {
        const __imported_original_data__ = utils.jsonParseSafe((user || {}).__imported_original_data__, {})
        let _tids = __imported_original_data__._readTids
        if (!_tids) {
            return
        }
        try {
            // value can come back as a double-stringed version of a JSON array
            while (typeof _tids === 'string') {
                _tids = JSON.parse(_tids)
            }
        } catch (e) {
            return
        }

        await async.eachLimit(_tids || [], 10, async (_tid) => {
            const topic = await Topics.getImported(_tid)
            if (!topic) {
                return
            }
            await Topics.markAsRead([topic.tid], user.uid)
        })
    }

    const markCategoriesAsRead = async (user = null) => {
        const __imported_original_data__ = utils.jsonParseSafe((user || {}).__imported_original_data__, {})
        let _cids = __imported_original_data__._readCids
        if (!_cids) {
            return
        }
        try {
            while (typeof _cids === 'string') {
                _cids = JSON.parse(_cids)
            }
        } catch (e) {
            return
        }
        await async.eachLimit(_cids || [], 10, async (_cid) => {
            const category = await Categories.getImported(_cid)
            if (!category) {
                console.warn(`Error: no topic for _cid ${_cid}`)
                return
            }
            await Categories.markAsRead([category.cid], user.uid)
        })
    }

    const followUsers = async (user = null) => {
        const __imported_original_data__ = utils.jsonParseSafe((user || {}).__imported_original_data__, {})
        let _uids = __imported_original_data__._followingUids
        if (!_uids) {
            return
        }
        try {
            while (typeof _uids === 'string') {
                _uids = JSON.parse(_uids)
            }
        } catch (e) {
            return
        }
        await async.eachLimit(_uids || [], 10, async (_uid) => {
            const [isFollowing, followUser] = await Promise.all([
                User.getImported(_uid),
                User.isFollowing(user.uid, _uid)
            ])
            if (isFollowing || !followUser) {
                return
            }
            await User.follow(user.uid, results.followUser.uid)
        })
    }

    const removeNotValidated = (user) => {
        if (!user || !Importer.config().autoConfirmEmails) {
            return
        }
        return db.sortedSetRemove('users:notvalidated', user.uid)
    }

    const addFriends = async (user) => {
        const __imported_original_data__ = utils.jsonParseSafe((user || {}).__imported_original_data__, {})
        let _uids = __imported_original_data__._friendsUids
        if (!_uids) {
            return
        }
        try {
            while (typeof _uids === 'string') {
                _uids = JSON.parse(_uids)
            }
        } catch (e) {
            return
        }
        await async.eachLimit(_uids || [], 10, async (_uid) => {
            const [friendUser, isFriends] = await Promise.all([
                User.getImported(_uid),
                User.isFriends(user.uid, _uid)
            ])
            if (!friendUser) {
                console.warn(`friendUser:_uid:${_uid} was not imported, skipping friending from user.uid:${user.uid}`)
                return
            }
            if (isFriends) {
                console.warn(`friendUser:uid:${friendUser.uid} is already a friend of user.uid:${+user.uid}, skipping friending from user.uid:${user.uid}`)
                return
            }
        })
    }

    await User.each(async (user) => {
        count += 1

        if (!user || !user.__imported_original_data__) {
            return
        }

        await Promise.all([
            banUser(user),
            markTopicsAsRead(user),
            markCategoriesAsRead(user),
            followUsers(user),
            removeNotValidated(user),
            addFriends(user)
        ])

        await Importer.saveProgress({
            phase: 'rebanMarkReadAndFollowForUsers',
            count,
            total
        })
    }, {
        async: true,
        eachLimit: EACH_LIMIT_BATCH_SIZE
    })
}

Importer.fixTopicTimestampsAndRelockLockedTopics = async () => {
    let count = 0
    const total = await Topics.count()
    const locking = (topic) => {
        const __imported_original_data__ = utils.jsonParseSafe((topic || {}).__imported_original_data__, {})
        if (!topic || !parseInt(__imported_original_data__._locked, 10)) {
            return
        }
        return Topics.tools.forceLock(topic.tid)
    }
    const timestamp = async (topic) => {
        if (!topic || !topic.tid || topic.pinned) {
            return
        }
        const pids = await db.getSortedSetRevRange(`tid:${topic.tid}:posts`, 0, 0)
        if (!Array.isArray(pids) || !pids.length) {
            return
        }
        const [cid, timestamp] = await Promise.all([
            db.getObjectField(`topic:${topic.tid}`, 'cid'),
            db.getObjectField(`post:${pids[0]}`, 'timestamp')
        ])
        await db.sortedSetAdd(`cid:${cid}:tids`, timestamp, topic.tid)
    }
    await Topics.each(async (topic) => {
        count += 1
        await Promise.all([
            locking(topic),
            timestamp(topic)
        ])
        await Importer.saveProgress({
            phase: 'fixTopicTimestampsAndRelockLockedTopics',
            count,
            total
        })
    }, {
        async: true,
        eachLimit: EACH_LIMIT_BATCH_SIZE
    })
}

Importer.disallowGuestsWriteOnAllCategories = () => {
    return Categories.each(async (category) => {
        await privileges.categories.disallowGroupOnCategory('guests', category.cid)
    }, {
        async: true,
        eachLimit: 10
    })
}

Importer.allowGuestsWriteOnAllCategories = () => {
    return Categories.each(async (category) => {
        await privileges.categories.allowGroupOnCategory('guests', category.cid)
    }, {
        async: true,
        eachLimit: 10
    })
}

Importer.allowGuestsReadOnAllCategories = () => {
    return Categories.each(async (category) => {
        await privileges.categories.give(['find', 'read', 'topics:read'], category.cid, 'guests')
    }, {
        async: true,
        eachLimit: 10
    })
}

Importer.fixGroupsOwnersAndRestrictCategories = async () => {
    const total = await Groups.count()
    let count = 0
    await Groups.each(async (group) => {
        if (!group || group.system) {
            return await Importer.saveProgress({
                phase: 'fixGroupsOwnersAndRestrictCategories',
                count,
                total
            })
        }

        const __imported_original_data__ = utils.jsonParseSafe((group || {}).__imported_original_data__, {})

        if (!__imported_original_data__._ownerUid) {
            console.warn(`group.name: ${group.name} does not have an ownerUid`)
            return await Importer.saveProgress({
                phase: 'fixGroupsOwnersAndRestrictCategories',
                count,
                total
            })
        }

        const _user = await User.getImported(__imported_original_data__._ownerUid)
        if (!_user) {
            console.warn(`group.name: ${group.name}'s owner with _ownerUid:${__imported_original_data__._ownerUid} not imported`)
        } else {
            console.warn(`group.name: ${group.name} granting ownership to uid:${_user.uid}`)
            await Groups.ownership.grant(_user.uid, group.name)
        }

        if (__imported_original_data__._cids) {
            let {
                _cids
            } = __imported_original_data__
            try {
                while (typeof _cids === 'string') {
                    _cids = JSON.parse(_cids)
                }
                if (_cids.length) {
                    await async.eachLimit(_cids || [], 10, async (_cid) => {
                        await Categories.eachImported(_cid, async (category) => {
                            await privileges.categories.disallowGroupOnCategory('guests', category.cid)
                            await privileges.categories.disallowGroupOnCategory('registered-users', category.cid)
                            await privileges.categories.allowGroupOnCategory(group.name, category.cid)
                        })
                    })
                }
            } catch (e) {
                console.error('Error while fixing categories: ', e)
            }
        }

        await Importer.saveProgress({
            phase: 'fixGroupsOwnersAndRestrictCategories',
            count,
            total
        })
    }, {
        async: true,
        eachLimit: EACH_LIMIT_BATCH_SIZE
    })
}

Importer.immediateProcessEachTypes = async () => {
    const options = {
        $refs: {
            utils,
            nconf,
            Meta,
            Categories,
            Groups,
            User,
            Messaging,
            Topics,
            Posts,
            File,
            db,
            privileges,
            Rooms,
            Votes,
            Bookmarks
        }
    }

    let models = [{
            model: 'user',
            object: User
        },
        {
            model: 'message',
            object: Messaging
        },
        {
            model: 'group',
            object: Groups
        },
        {
            model: 'category',
            object: Categories
        },
        {
            model: 'topic',
            object: Topics
        },
        {
            model: 'post',
            object: Posts
        },
        {
            model: 'bookmark',
            object: Bookmarks
        },
        {
            model: 'vote',
            object: Votes
        },
    ]

    const progress = await Importer.getProgress()

    if (progress && /^immediateProcessEachTypes/.test(progress.phase)) {
        const {
            phase,
            count,
            total
        } = progress
        const phasePart = phase.split(':').pop()
        models = _.dropWhile(models, (phase) => {
            return phase.name != phasePart
        })
        if (count == total) {
            models.shift()
        }
    }

    for await (const {
        model,
        object
    } of models) {
        if (Importer.exporter.supportsEachTypeImmediateProcess(model)) {
            const total = await object.count()
            let count = 0
            await object.each(async (obj) => {
                count += 1
                await Importer.exporter.eachTypeImmediateProcess(model, obj, options)
                await Importer.saveProgress({
                    phase: `immediateProcessEachTypes:${model}`,
                    count,
                    total
                })
            }, {
                async: true,
                eachLimit: EACH_LIMIT_BATCH_SIZE
            })
        }
    }
}

Importer.start = async () => {
    let phases = [{
            name: 'flushData',
            fn: Importer.flushData
        },
        {
            name: 'backupAndSetTmpConfig',
            fn: Importer.backupAndSetTmpConfig
        },
        {
            name: 'importGroups',
            fn: Importer.importGroups
        },
        {
            name: 'importCategories',
            fn: Importer.importCategories
        },
        {
            name: 'importUsers',
            fn: Importer.importUsers
        },
        {
            name: 'importRooms',
            fn: Importer.importRooms
        },
        {
            name: 'importMessages',
            fn: Importer.importMessages
        },
        {
            name: 'importTopics',
            fn: Importer.importTopics
        },
        {
            name: 'importPosts',
            fn: Importer.importPosts
        },
        {
            name: 'importVotes',
            fn: Importer.importVotes
        },
        {
            name: 'importBookmarks',
            fn: Importer.importBookmarks
        },
        {
            name: 'allowGuestsWriteOnAllCategories',
            fn: Importer.allowGuestsWriteOnAllCategories
        },
        {
            name: 'fixCategoriesParentsAndAbilities',
            fn: Importer.fixCategoriesParentsAndAbilities
        },
        {
            name: 'fixTopicsTeasers',
            fn: Importer.fixTopicsTeasers
        },
        {
            name: 'rebanMarkReadAndFollowForUsers',
            fn: Importer.rebanMarkReadAndFollowForUsers
        },
        {
            name: 'fixTopicTimestampsAndRelockLockedTopics',
            fn: Importer.fixTopicTimestampsAndRelockLockedTopics
        },
        {
            name: 'restoreConfig',
            fn: Importer.restoreConfig
        },
        {
            name: 'disallowGuestsWriteOnAllCategories',
            fn: Importer.disallowGuestsWriteOnAllCategories
        },
        {
            name: 'allowGuestsReadOnAllCategories',
            fn: Importer.allowGuestsReadOnAllCategories
        },
        {
            name: 'fixGroupsOwnersAndRestrictCategories',
            fn: Importer.fixGroupsOwnersAndRestrictCategories
        },
        {
            name: 'immediateProcessEachTypes',
            fn: Importer.immediateProcessEachTypes
        },
        // {
        //     name: 'deleteTmpImportedSetsAndObjects',
        //     fn: Importer.deleteTmpImportedSetsAndObjects
        // }
    ]

    const progress = await Importer.getProgress()

    if (progress) {
        const {
            phase,
            count,
            total
        } = progress
        const phasePart = phase.split(':').shift()
        phases = _.dropWhile(phases, (phase) => {
            return phase.name != phasePart
        })
        if (count == total) {
            phases.shift()
        }
    }

    phases = phases.map(phase => phase.fn)

    try {
        Importer.overrideCoreFunctions() 
        for await (const phase of phases) {
            await phase()
        }
        Importer.restoreCoreFunctions()
        await Importer.clearProgress()
    } catch (err) {
        console.error('An error has occured while importing data: ', err)
    }
}

Importer.saveProgress = (data = {}) => {
    const progress = (data.count / data.total) * 100
    helpers.printProgress(progress)
    data.timestamp = data.timestamp || moment().format()
    return db.setObject('import:progress', data)
}

Importer.getProgress = () => db.getObject('import:progress')

Importer.clearProgress = () => db.delete('import:progress')

module.exports = Importer