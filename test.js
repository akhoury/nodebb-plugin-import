const db = require('./lib/database/')
// const config = require('./lib/config')
// const Exporter = require('./lib/exporter')
// const Importer = require('./lib/importer')
// const privileges = require('./lib/database/privileges')
const controller = require('./lib/controllers')
const cli = require('./lib/cli')

;(async () => {
    await db.init()

    // await Exporter.init(config)
    // await Exporter.setup()

    // Importer.setup(Exporter, config)
    // await privileges.init()
    // await Importer.deleteTmpImportedSetsAndObjects()
    // await Importer.clearProgress()
    // await Importer.start()
    // await controller.setupConvert()
    // await controller.convertAll()
    // await controller.deleteExtraFields()
    await cli.init()

    process.exit(0)
})()
