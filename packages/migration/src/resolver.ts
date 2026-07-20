// Migration resolver - determines which migrations need to run

import type { DatabaseProvider, MigrationTask, MigrationVersion, MigrationPhase } from './types.js'

export class MigrationResolver {
  private readonly history: DatabaseProvider['query']['migration_history']

  constructor(history: DatabaseProvider['query']['migration_history']) {
    this.history = history
  }

  async resolve(migrations: Map<string, MigrationVersion[]>): Promise<MigrationTask[]> {
    // Get executed versions from history
    const historyRecords = await this.history.findMany()
    const executed = new Map<string, Set<string>>()
    for (const record of historyRecords) {
      let set = executed.get(record.moduleId)
      if (!set) {
        set = new Set()
        executed.set(record.moduleId, set)
      }
      set.add(record.version)
    }

    const tasks: MigrationTask[] = []

    // Sort plugin names alphabetically (plugin-core before plugin-rbac)
    const sortedPlugins = [...migrations.keys()].sort()

    for (const pluginName of sortedPlugins) {
      const versions = migrations.get(pluginName)!
      for (const version of versions) {
        // Skip already-executed versions
        const executedVersions = executed.get(pluginName)
        if (executedVersions?.has(version.version)) continue

        const phases = this.buildPhases(version)
        if (phases.length > 0) {
          tasks.push({
            pluginName,
            version: version.version,
            phases,
          })
        }
      }
    }

    return tasks
  }

  private buildPhases(version: MigrationVersion): MigrationPhase[] {
    const phases: MigrationPhase[] = []
    const phaseOrder: Array<{ key: 'preload' | 'postsync' | 'postload'; phase: 'preload' | 'postsync' | 'postload' }> = [
      { key: 'preload', phase: 'preload' },
      { key: 'postsync', phase: 'postsync' },
      { key: 'postload', phase: 'postload' },
    ]

    for (const { key, phase } of phaseOrder) {
      const filePath = version.files[key]
      if (filePath) {
        phases.push({ phase, sqlFile: filePath, sqlContent: '' })
      }
    }

    return phases
  }
}
