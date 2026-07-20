// Migration engine types

export interface MigrationVersion {
  version: string
  path: string
  files: {
    preload?: string
    postsync?: string
    postload?: string
  }
}

export interface MigrationPhase {
  phase: 'preload' | 'postsync' | 'postload'
  sqlFile: string
  sqlContent: string
}

export interface MigrationTask {
  pluginName: string
  version: string
  phases: MigrationPhase[]
}

export interface MigrationResult {
  completed: number
  failed: number
  executionLog: Array<{
    pluginName: string
    version: string
    phase: string
    status: 'success' | 'failed'
    error?: string
  }>
}

export interface DryRunReport {
  tasks: Array<{ plugin: string; phase: MigrationPhase; sql: string }>
  blocked: Array<{ plugin: string; phase: MigrationPhase; reason: string }>
  hasBlocked: boolean
}

export interface MigrateOptions {
  mode: 'normal' | 'dry-run'
  pluginName?: string
  targetVersion?: string
}

export interface DatabaseProvider {
  execute(sql: string): Promise<unknown>
  insert(table: string, data: Record<string, unknown>): Promise<unknown>
  query: {
    migration_history: {
      findMany(): Promise<Array<{ moduleId: string; version: string }>>
    }
  }
}
