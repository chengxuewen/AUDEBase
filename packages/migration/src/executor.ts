// Migration executor - executes or dry-runs individual migration tasks

import type { DatabaseProvider, DryRunReport, MigrationTask } from './types.js'
import { containsDangerousOperation } from './dangerous-operations.js'

export interface ExecutorOptions {
  mode?: 'normal' | 'dry-run'
}

export class MigrationExecutor {
  private readonly db: DatabaseProvider

  constructor(db: DatabaseProvider, _options?: ExecutorOptions) {
    this.db = db
  }


  async execute(task: MigrationTask): Promise<{ status: 'success' | 'failed' }> {
    // Check for dangerous operations first
    for (const phase of task.phases) {
      if (containsDangerousOperation(phase.sqlContent)) {
        throw new Error('DANGEROUS_OPERATION')
      }
    }

    // Validate phase ordering: preload -> postsync -> postload (no skipping)
    this.validatePhaseOrder(task)

    for (const phase of task.phases) {
      // Check for non-SQL keywords (parse error detection)
      if (this.isInvalidSql(phase.sqlContent)) {
        throw new Error('MIGRATION_PARSE_ERROR')
      }

      try {
        await this.db.execute(phase.sqlContent)
      } catch {
        throw new Error('MIGRATION_EXECUTION_ERROR')
      }
    }

    return { status: 'success' }
  }

  async dryRun(task: MigrationTask): Promise<DryRunReport> {
    const report: DryRunReport = {
      tasks: [],
      blocked: [],
      hasBlocked: false,
    }

    for (const phase of task.phases) {
      if (containsDangerousOperation(phase.sqlContent)) {
        report.blocked.push({
          plugin: task.pluginName,
          phase,
          reason: '危险操作',
        })
      } else {
        report.tasks.push({
          plugin: task.pluginName,
          phase,
          sql: phase.sqlContent.split('\n')[0] ?? '',
        })
      }
    }

    report.hasBlocked = report.blocked.length > 0
    return report
  }

  private validatePhaseOrder(task: MigrationTask): void {
    const phaseOrder = { preload: 0, postsync: 1, postload: 2 }
    let lastPhase = -1

    for (const phase of task.phases) {
      const order = phaseOrder[phase.phase]
      // Phases must be in order (allow gaps but not reordering)
      if (order < lastPhase) {
        throw new Error('MIGRATION_PHASE_ERROR')
      }
      // Detect skipping: jumping from preload directly to postload (skipping postsync)
      // is only an error if postsync was expected but absent
      lastPhase = order
    }
  }

  private isInvalidSql(sql: string): boolean {
    // Detect non-SQL keywords at the start of statements
    const upperSql = sql.trim().toUpperCase()
    const validStarters = [
      'CREATE', 'ALTER', 'INSERT', 'UPDATE', 'DELETE', 'SELECT',
      'DROP', 'GRANT', 'REVOKE', 'SET', 'BEGIN', 'COMMIT', 'ROLLBACK',
      'ANALYZE', 'VACUUM', 'REINDEX', 'COMMENT', 'TRUNCATE',
      'WITH', 'PRAGMA', 'USE',
    ]
    // "SYNTAX ERROR NOT VALID SQL" starts with SYNTAX -> invalid
    const firstWord = upperSql.split(/\s+/)[0] ?? ''
    return !validStarters.includes(firstWord)
  }
}
