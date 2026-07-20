/**
 * Server entry point.
 *
 * @audebase/core
 */

import 'dotenv/config'
import { loadConfig } from './config.js'
import { CoreApp } from './app.js'

async function main(): Promise<void> {
  const config = loadConfig(process.env)

  const app = new CoreApp(config)

  let shuttingDown = false

  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    try {
      await app.stop()
    } catch (err) {
      app.logger.error({ err }, 'Error during shutdown')
    }
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  try {
    await app.start()
  } catch (err) {
    app.logger.error({ err }, 'Failed to start server')
    process.exit(1)
  }
}

main().catch((err: unknown) => {
  // ponytail: logger not available yet, use stderr
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
