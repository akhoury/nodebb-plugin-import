const fs = require('fs-extra')
const {
	promisify
} = require('util')
const {
	fromBuffer: fileType
} = require('file-type-cjs')
const utils = require('../../static/lib/utils')

const helpers = {
	promiseWhile(condition, execute) {
		/* eslint-disable no-async-promise-executor */
		return new Promise(async (resolve, reject) => {
			const iterate = async function () {
				if (condition()) {
					try {
						await execute()
						await iterate()
					} catch (e) {
						reject(e)
					}
				}
				return resolve()
			}
			await execute()
			return iterate()
		})
	},

	// http://dense13.com/blog/2009/05/03/converting-string-to-slug-javascript
	slugify(str) {
		str = str.replace(/^\s+|\s+$/g, '')
		str = str.toLowerCase()
		if (/^[\w]+$/.test(str)) {
			str = str.replace(/[^\w\s\d\-_]/g, '-')
		}
		str = str.replace(/\s+/g, '-')
		str = str.replace(/-+/g, '-')
		str = str.replace(/-$/g, '')
		str = str.replace(/^-/g, '')
		str = str.replace(/,/g, '')
		str = str.replace(/\./g, '')
		str = str.replace(/:/g, '')
		str = str.replace(/(\\|\/)/g, '-')
		return str
	},

	cleanUsername(str) {
		return str.replace(/[^a-zA-Z0-9 ]/g, '')
	},

	makeValidNbbUsername(_username, _alternativeUsername) {
		const _userslug = helpers.slugify(_username || '')

		// while(!utils.isUserNameValid(_username)) {


		// 	if (utils.isUserNameValid(_username) && _userslug) {
		// 		return {
		// 			username: _username,
		// 			userslug: _userslug
		// 		}
		// 	}
		// }

		if (utils.isUserNameValid(_username) && _userslug) {
			return {
				username: _username,
				userslug: _userslug
			}
		}
		const username = helpers.cleanUsername(_username)
		const userslug = helpers.slugify(username)

		if (utils.isUserNameValid(username) && userslug) {
			return {
				username,
				userslug
			}
		}
		if (_alternativeUsername) {
			const _alternativeUsernameSlug = helpers.slugify(_alternativeUsername)

			if (utils.isUserNameValid(_alternativeUsername) && _alternativeUsernameSlug) {
				return {
					username: _alternativeUsername,
					userslug: _alternativeUsernameSlug
				}
			}

			const alternativeUsername = helpers.cleanUsername(_alternativeUsername)
			const alternativeUsernameSlug = helpers.slugify(alternativeUsername)

			if (utils.isUserNameValid(alternativeUsername) && alternativeUsernameSlug) {
				return {
					username: alternativeUsername,
					userslug: alternativeUsernameSlug
				}
			}
			return {
				username: null,
				userslug: null
			}
		}
		return {
			username: null,
			userslug: null
		}
	},

	genRandPwd(len, chars) {
		const index = (Math.random() * (chars.length - 1)).toFixed(0)
		return len > 0 ? chars[index] + helpers.genRandPwd(len - 1, chars) : ''
	},

	incrementEmail(email) {
		const parts = email.split('@')
		const parts2 = parts[0].split('+')

		const first = parts2.shift()
		const added = parts2.pop()

		let nb = 1
		if (added) {
			const match = added.match(/__imported_duplicate_email__(\d+)/)
			if (match && match[1]) {
				nb = parseInt(match[1], 10) + 1
			} else {
				parts2.push(added)
			}
		}
		parts2.push(`__imported_duplicate_email__${nb}`)
		parts2.unshift(first)
		parts[0] = parts2.join('+')

		return parts.join('@')
	},

	async writeBlob(filepath, blob) {
		let buffer
		let ftype = {
			mime: 'unknown/unkown',
			extension: ''
		}

		if (!blob) {
			throw {
				message: 'blob is null'
			}
		}

		if (blob instanceof Buffer) {
			buffer = blob
		} else {
			buffer = Buffer.from(blob, 'binary')
		}
		ftype = (await fileType(buffer)) || ftype
		ftype.filepath = filepath

		await fs.writeFile(filepath, buffer.toString('binary'), 'binary')

		return ftype
	},

	generateImageTag(url) {
		const href = url.url || url.src || url
		const filename = url.filename || href.split('/').pop()
		return `\n<img class="imported-image-tag" style="display:block" src="${href}" alt="${filename}" />`
	},

	generateAnchorTag(url) {
		const href = url.url || url.src || url || ''
		const filename = url.filename || href.split('/').pop()
		return `\n<a download="${filename}" class="imported-anchor-tag" href="${href}" target="_blank">${filename}</a>`
	},

	buildFn(js) {
		try {
			return Function.apply(global, ['content, encoding, url', `${js || ''}\nreturn content`])
		} catch (e) {
			console.warn(`${js}\nhas invalid javascript, ignoring... `, e)
			return s => s
		}
	},

	buildPromise(js) {
		return promisify(helpers.buildFn(js))
	},

	isPromise(p) {
		return typeof p === 'object' && typeof p.then === 'function'
	},

	printProgress(progress) {
		process.stdout.clearLine()
		process.stdout.cursorTo(0)
		process.stdout.write(progress + '%')
	},
}

module.exports = helpers
