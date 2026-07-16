// Migration engine - orchestrates scanner, resolver, executor

import type { DatabaseProvider, MigrateOptions, MigrationResult, DryRunReport } from './types.js'
import { MigrationScanner } from './scanner.js'
import { MigrationResolver } from './resolver.js'
import { MigrationExecutor } from './executor.js'

export class MigrationEngine {
  private readonly db: DatabaseProvider
  private readonly scanner: MigrationScanner

  constructor(db: DatabaseProvider, searchPaths?: string[]) {
    this.db = db
    this.scanner = new MigrationScanner(searchPaths ?? ['./packages'])
  }

  async migrate(options?: MigrateOptions): Promise<MigrationResult> {
    const mode = options?.mode ?? 'normal'

    // 1. Scan for migrations
    const migrations = await this.scanner.discoverMigrations()

    // 2. Resolve which need to run
    const history = this.db?.query?.migration_history ?? { findMany: async () => [] }
    const resolver = new MigrationResolver(history)
    const tasks = await resolver.resolve(migrations)

    // 3. Execute in three-phase order: all preloads -> all postsyncs -> all postloads
    const executor = new MigrationExecutor(this.db, { mode })
    const result: MigrationResult = {
      completed: 0,
      failed: 0,
      executionLog: [],
    }

    // Group phases across all tasks for cross-plugin ordering
    const phaseGroups: Array<'preload' | 'postsync' | 'postload'> = ['preload', 'postsync', 'postload']

    for (const phaseGroup of phaseGroups) {
      for (const task of tasks) {
        const phasesForGroup = task.phases.filter(p => p.phase === phaseGroup)
        if (phasesForGroup.length === 0) continue

        try {
          const subTask = {
            pluginName: task.pluginName,
            version: task.version,
            phases: phasesForGroup,
          }
          await executor.execute(subTask)
          result.completed++
          result.executionLog.push({
            pluginName: task.pluginName,
            version: task.version,
            phase: phaseGroup,
            status: 'success',
          })
        } catch (error) {
          result.failed++
          result.executionLog.push({
            pluginName: task.pluginName,
            version: task.version,
            phase: phaseGroup,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
          })
          // Don't block other plugins - continue to next task
        }
      }
    }

    return result
  }

  async dryRun(): Promise<DryRunReport> {
    // 1. Scan for migrations
    const migrations = await this.scanner.discoverMigrations()

    // 2. Resolve which need to run
    const history = this.db?.query?.migration_history ?? { findMany: async () => [] }
    const resolver = new MigrationResolver(history)
    const tasks = await resolver.resolve(migrations)

    // 3. Dry-run each task
    const executor = new MigrationExecutor(this.db, { mode: 'dry-run' })
    const combined: DryRunReport = {
      tasks: [],
      blocked: [],
      hasBlocked: false,
    }

    for (const task of tasks) {
      const report = await executor.dryRun(task)
      combined.tasks.push(...report.tasks)
      combined.blocked.push(...report.blocked)
    }

    combined.hasBlocked = combined.blocked.length > 0
    return combined
  }
}
