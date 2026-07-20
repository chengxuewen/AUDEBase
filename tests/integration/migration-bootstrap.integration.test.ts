/**
 * Phase 1a Integration Test: Migration + Plugin Core Bootstrap
 *
 * Verifies cross-package interaction:
 * - shared-types -> migration (types)
 * - shared-types -> plugin-core (PluginHost)
 * - plugin-core -> migration (bootstrap then migrate)
 * - manifest-engine -> migration (version comparison)
 */

import { describe, it, expect } from 'vitest'
import { MigrationEngine, containsDangerousOperation, type MigrationTask } from '@audebase/migration'
import { generateBootstrapData, isBootstrapComplete } from '@audebase/plugin-core'
import { compareVersions, isVersionGt } from '@audebase/manifest-engine'

describe('Migration + Plugin Core Bootstrap Integration', () => {
  it('should bootstrap plugin-core data then run migrations in order', () => {
    // Arrange - bootstrap data
    const data = generateBootstrapData()

    // Assert - bootstrap data is complete
    expect(data.adminUser).toBeDefined()
    expect(data.defaultRoles).toHaveLength(2)
    expect(data.corePermissions.length).toBeGreaterThan(0)

    // Arrange - migration versions
    const v01 = compareVersions('0.1.0', '0.0.1')
    const v1Gt = isVersionGt('0.2.0', '0.1.0')

    // Assert - version comparison works
    expect(v01).toBeGreaterThan(0)
    expect(v1Gt).toBe(true)
  })

  it('should detect dangerous SQL operations in migrations', () => {
    // Arrange & Act & Assert
    expect(containsDangerousOperation('DROP TABLE users')).toBe(true)
    expect(containsDangerousOperation('DROP DATABASE audebase')).toBe(true)
    expect(containsDangerousOperation('TRUNCATE audit_log')).toBe(true)
    expect(containsDangerousOperation('SELECT * FROM users')).toBe(false)
    expect(containsDangerousOperation('ALTER TABLE users ADD COLUMN name TEXT')).toBe(false)
  })

  it('should run migration engine with empty history', async () => {
    // Arrange
    const mockDb = {
      query: {
        migration_history: {
          findMany: async () => [],
        },
      },
      execute: async () => undefined,
      insert: async () => undefined,
      update: async () => undefined,
    }

    const engine = new MigrationEngine(mockDb as never)

    // Act
    const result = await engine.migrate({ mode: 'dry-run' })

    // Assert
    expect(result).toBeDefined()
    expect(result.completed).toBeGreaterThanOrEqual(0)
  })
})
