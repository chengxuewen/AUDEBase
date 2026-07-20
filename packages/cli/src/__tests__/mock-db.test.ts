import { describe, it, expect } from 'vitest'
import { createMockDb, type MockDatabaseProvider } from '../mock-db.js'

describe('createMockDb', () => {
  let db: MockDatabaseProvider

  function createDb(): MockDatabaseProvider {
    return createMockDb()
  }

  // --- creation ---

  it('creates a MockDatabaseProvider', () => {
    // Arrange & Act
    const db = createDb()

    // Assert
    expect(db).toBeDefined()
    expect(db.query).toBeDefined()
    expect(db.query.modules).toBeDefined()
    expect(db.query.migration_history).toBeDefined()
  })

  // --- execute ---

  it('execute returns undefined', async () => {
    // Arrange
    const db = createDb()

    // Act
    const result = await db.execute('SELECT 1')

    // Assert
    expect(result).toBeUndefined()
  })

  // --- insert ---

  it('insert returns undefined', async () => {
    const db = createDb()
    const result = await db.insert('modules', { name: 'test' })
    expect(result).toBeUndefined()
  })

  // --- query.modules.findFirst ---

  it('findFirst finds seeded module by name', async () => {
    // Arrange
    const db = createDb()

    // Act
    const mod = await db.query.modules.findFirst({
      where: { name: '@audebase/plugin-core' },
    })

    // Assert
    expect(mod).toBeDefined()
    expect(mod!.name).toBe('@audebase/plugin-core')
    expect(mod!.state).toBe('loaded')
    expect(mod!.display_name).toBe('Core')
  })

  it('findFirst returns undefined for unknown module', async () => {
    const db = createDb()
    const mod = await db.query.modules.findFirst({
      where: { name: '@audebase/plugin-unknown' },
    })
    expect(mod).toBeUndefined()
  })

  // --- query.modules.findMany ---

  it('findMany returns all seeded modules', async () => {
    // Arrange
    const db = createDb()

    // Act
    const modules = await db.query.modules.findMany()

    // Assert
    expect(modules.length).toBe(3)
    expect(modules[0].name).toBe('@audebase/plugin-core')
    expect(modules[1].name).toBe('@audebase/plugin-rbac')
    expect(modules[2].name).toBe('@audebase/plugin-audit')
  })

  it('findMany filters by name', async () => {
    const db = createDb()
    const modules = await db.query.modules.findMany({
      where: { name: '@audebase/plugin-audit' },
    })

    expect(modules).toHaveLength(1)
    expect(modules[0].state).toBe('disabled')
  })

  it('findMany filters by tenant_id null', async () => {
    const db = createDb()
    const modules = await db.query.modules.findMany({
      where: { tenant_id: null },
    })

    expect(modules.length).toBe(3)
    for (const m of modules) {
      expect(m.tenant_id).toBeNull()
    }
  })

  // --- query.migration_history.findMany ---

  it('migration_history.findMany returns empty array', async () => {
    // Arrange
    const db = createDb()

    // Act
    const migrations = await db.query.migration_history.findMany()

    // Assert
    expect(migrations).toEqual([])
  })

  // --- update ---

  it('update on modules table modifies seeded data', async () => {
    // Arrange
    const db = createDb()

    // Act
    const result = await db.update('modules').set({ state: 'disabled' }).where({ name: '@audebase/plugin-core' })

    // Assert
    expect(result).toHaveLength(1)
    expect(result[0].state).toBe('disabled')
    expect(result[0].name).toBe('@audebase/plugin-core')
  })

  it('update on unknown table returns empty array', async () => {
    const db = createDb()
    const result = await db.update('unknown_table').set({ x: 1 }).where({ y: 2 })
    expect(result).toEqual([])
  })

  it('update preserves other fields on the matched row', async () => {
    const db = createDb()

    // Get original module
    const before = await db.query.modules.findFirst({
      where: { name: '@audebase/plugin-rbac' },
    })

    // Act: update state
    const result = await db.update('modules').set({ state: 'loaded' }).where({ name: '@audebase/plugin-rbac' })

    // Assert: state updated, other fields preserved
    expect(result[0].state).toBe('loaded')
    expect(result[0].display_name).toBe(before!.display_name)
    expect(result[0].category).toBe(before!.category)
    expect(result[0].version).toBe(before!.version)
  })

  it('update where no rows match returns empty', async () => {
    const db = createDb()
    const result = await db.update('modules').set({ state: 'loaded' }).where({ name: 'nonexistent' })
    expect(result).toEqual([])
  })

  it('multiple updates modify seeded data in place', async () => {
    const db = createDb()

    // First update
    await db.update('modules').set({ state: 'loaded' }).where({ name: '@audebase/plugin-audit' })

    // Verify it persisted
    const mod = await db.query.modules.findFirst({
      where: { name: '@audebase/plugin-audit' },
    })
    expect(mod!.state).toBe('loaded')
  })

  // --- seed data integrity ---

  it('seeded plugin-core has correct runtime settings', async () => {
    const db = createDb()
    const mod = await db.query.modules.findFirst({
      where: { name: '@audebase/plugin-core' },
    })

    expect(mod!.runtime_mode).toBe('inline')
    expect(mod!.runtime_partition).toBe('SYSTEM')
    expect(mod!.auto_install).toBe(true)
    expect(mod!.tenant_id).toBeNull()
  })

  it('seeded plugin-audit is disabled by default', async () => {
    const db = createDb()
    const mod = await db.query.modules.findFirst({
      where: { name: '@audebase/plugin-audit' },
    })

    expect(mod!.state).toBe('disabled')
    expect(mod!.auto_install).toBe(false)
  })

  it('each createDb call produces independent state', async () => {
    const db1 = createDb()
    const db2 = createDb()

    // Mutate db1
    await db1.update('modules').set({ state: 'disabled' }).where({ name: '@audebase/plugin-core' })

    // db2 unaffected
    const mod = await db2.query.modules.findFirst({
      where: { name: '@audebase/plugin-core' },
    })
    expect(mod!.state).toBe('loaded')
  })
})
