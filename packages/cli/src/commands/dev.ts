/**
 * aude dev - Start development server
 *
 * Loads .env, validates config, bootstraps CoreApp, and handles
 * SIGTERM/SIGINT for graceful shutdown.
 */

import 'dotenv/config'
import { CoreApp, loadConfig } from '@audebase/core'
import type { DevCommandOptions } from '../types.js'

export async function runDev(options: DevCommandOptions): Promise<void> {
  const env = { ...process.env }
  if (options.port) {
    env.PORT = options.port
  }

  const config = loadConfig(env)
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
