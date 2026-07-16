// aude db:migrate - Run database migrations

import type { MigrateCommandOptions } from '../types.js'

export async function runMigrate(options: MigrateCommandOptions): Promise<void> {
  const { MigrationEngine } = await import('@audebase/migration')
  const { createMockDb } = await import('../mock-db.js')

  const db = createMockDb()
  const engine = new MigrationEngine(db)

  if (options.dryRun === true) {
    console.log('Running migrations in dry-run mode...')
    const report = await engine.dryRun()

    if (report.tasks.length === 0) {
      console.log('No pending migrations found.')
      return
    }

    for (const task of report.tasks) {
      console.log(`  [${task.plugin}] ${task.phase.phase}: ${task.phase.sqlFile}`)
    }

    if (report.hasBlocked) {
      console.error(`\nError: ${report.blocked.length} migration(s) blocked:`)
      for (const blocked of report.blocked) {
        console.error(`  [${blocked.plugin}] ${blocked.phase.phase}: ${blocked.reason}`)
      }
      process.exit(1)
    }

    console.log(`\nDry-run complete: ${report.tasks.length} task(s) would execute.`)
    return
  }

  console.log('Running migrations...')
  const mode = options.plugin !== undefined ? 'normal' : 'normal'
  const result = await engine.migrate({ mode })

  if (result.failed > 0) {
    console.error(`\nError: ${result.failed} migration(s) failed.`)
    for (const log of result.executionLog) {
      if (log.status === 'failed') {
        console.error(`  [${log.pluginName}@${log.version}] ${log.phase}: ${log.error ?? 'Unknown error'}`)
      }
    }
    process.exit(1)
  }

  console.log(`\nMigrations complete: ${result.completed} task(s) executed.`)
}
