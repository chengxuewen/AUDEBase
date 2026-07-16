// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect, vi } from 'vitest'
import { MigrationExecutor } from '../index.js'
import type { MigrationTask } from '../index.js'

describe('MigrationExecutor.dryRun', () => {
  it('应报告正常迁移任务', async () => {
    // Arrange
    const executor = new MigrationExecutor({} as never, { mode: 'dry-run' })
    const task: MigrationTask = {
      pluginName: 'plugin-core',
      version: '1.1.0',
      phases: [
        { phase: 'preload', sqlFile: '/tmp/preload.sql', sqlContent: 'CREATE TABLE test (id UUID PRIMARY KEY);' },
      ],
    }

    // Act
    const report = await executor.dryRun(task)

    // Assert
    expect(report.tasks).toHaveLength(1)
    expect(report.blocked).toHaveLength(0)
  })

  it('应拦截危险操作', async () => {
    // Arrange
    const executor = new MigrationExecutor({} as never, { mode: 'dry-run' })
    const task: MigrationTask = {
      pluginName: 'plugin-core',
      version: '1.1.0',
      phases: [
        { phase: 'preload', sqlFile: '/tmp/preload.sql', sqlContent: 'DROP TABLE users;' },
      ],
    }

    // Act
    const report = await executor.dryRun(task)

    // Assert
    expect(report.blocked).toHaveLength(1)
    expect(report.blocked[0].reason).toBe('危险操作')
    expect(report.tasks).toHaveLength(0)
  })

  it('DryRun 不应执行 SQL（无 DB 操作）', async () => {
    // Arrange
    const mockDb = {
      execute: vi.fn(),
    }
    const executor = new MigrationExecutor(mockDb as never, { mode: 'dry-run' })
    const task: MigrationTask = {
      pluginName: 'plugin-core',
      version: '1.1.0',
      phases: [
        { phase: 'preload', sqlFile: '/tmp/preload.sql', sqlContent: 'CREATE TABLE test (id UUID);' },
      ],
    }

    // Act
    await executor.dryRun(task)

    // Assert - dryRun 不应调用 db.execute
    expect(mockDb.execute).not.toHaveBeenCalled()
  })

  it('应返回 hasBlocked=true 当有 blocked 操作', async () => {
    // Arrange
    const executor = new MigrationExecutor({} as never, { mode: 'dry-run' })
    const task: MigrationTask = {
      pluginName: 'plugin-core',
      version: '1.1.0',
      phases: [
        { phase: 'preload', sqlFile: '/tmp/preload.sql', sqlContent: 'TRUNCATE users;' },
      ],
    }

    // Act
    const report = await executor.dryRun(task)

    // Assert
    expect(report.hasBlocked).toBe(true)
  })
})
