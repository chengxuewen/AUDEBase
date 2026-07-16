// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect } from 'vitest'
import { MigrationResolver } from '../index.js'
import type { MigrationVersion } from '../index.js'

// 模拟 migration_history 查询结果
function createMockHistory(records: Array<{ plugin: string; version: string }>) {
  return {
    findMany: async () => records.map(r => ({ moduleId: r.plugin, version: r.version })),
  }
}

describe('MigrationResolver', () => {
  it('无迁移历史时应返回全部版本', async () => {
    // Arrange
    const migrations = new Map<string, MigrationVersion[]>([
      ['plugin-core', [
        { version: '1.0.0', path: '/tmp/1.0.0', files: { preload: 'preload.sql' } },
        { version: '1.1.0', path: '/tmp/1.1.0', files: { preload: 'preload.sql' } },
      ]],
    ])
    const history = createMockHistory([])
    const resolver = new MigrationResolver(history as never)

    // Act
    const tasks = await resolver.resolve(migrations)

    // Assert
    expect(tasks).toHaveLength(2)
    expect(tasks[0].version).toBe('1.0.0')
    expect(tasks[1].version).toBe('1.1.0')
  })

  it('已执行版本应跳过', async () => {
    // Arrange
    const migrations = new Map<string, MigrationVersion[]>([
      ['plugin-core', [
        { version: '1.0.0', path: '/tmp/1.0.0', files: { preload: 'preload.sql' } },
        { version: '1.1.0', path: '/tmp/1.1.0', files: { preload: 'preload.sql' } },
        { version: '1.2.0', path: '/tmp/1.2.0', files: { preload: 'preload.sql' } },
      ]],
    ])
    // 1.0.0 已执行
    const history = createMockHistory([
      { plugin: 'plugin-core', version: '1.0.0' },
    ])
    const resolver = new MigrationResolver(history as never)

    // Act
    const tasks = await resolver.resolve(migrations)

    // Assert
    expect(tasks).toHaveLength(2)
    expect(tasks[0].version).toBe('1.1.0')
    expect(tasks[1].version).toBe('1.2.0')
  })

  it('version_gated: 仅执行 version > 已记录版本', async () => {
    // Arrange - manifest 中 version 为 1.2.0，已执行到 1.1.0
    // 仅 1.2.0 待执行
    const migrations = new Map<string, MigrationVersion[]>([
      ['plugin-core', [
        { version: '1.0.0', path: '/tmp/1.0.0', files: { preload: 'preload.sql' } },
        { version: '1.1.0', path: '/tmp/1.1.0', files: { preload: 'preload.sql' } },
        { version: '1.2.0', path: '/tmp/1.2.0', files: { preload: 'preload.sql' } },
      ]],
    ])
    const history = createMockHistory([
      { plugin: 'plugin-core', version: '1.0.0' },
      { plugin: 'plugin-core', version: '1.1.0' },
    ])
    const resolver = new MigrationResolver(history as never)

    // Act
    const tasks = await resolver.resolve(migrations)

    // Assert
    expect(tasks).toHaveLength(1)
    expect(tasks[0].version).toBe('1.2.0')
  })

  it('多插件应按插件名排序', async () => {
    // Arrange - plugin-core 的迁移应先于 plugin-rbac
    const migrations = new Map<string, MigrationVersion[]>([
      ['plugin-rbac', [
        { version: '1.0.0', path: '/tmp/rbac-1.0.0', files: { preload: 'preload.sql' } },
      ]],
      ['plugin-core', [
        { version: '1.1.0', path: '/tmp/core-1.1.0', files: { preload: 'preload.sql' } },
      ]],
    ])
    const history = createMockHistory([])
    const resolver = new MigrationResolver(history as never)

    // Act
    const tasks = await resolver.resolve(migrations)

    // Assert - plugin-core 在前
    expect(tasks[0].pluginName).toBe('plugin-core')
    expect(tasks[1].pluginName).toBe('plugin-rbac')
  })
})
