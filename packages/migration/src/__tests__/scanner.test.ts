// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MigrationScanner } from '../index'
import * as fs from 'node:fs/promises'

// mock 文件系统
vi.mock('node:fs/promises')

describe('MigrationScanner', () => {
  let scanner: MigrationScanner

  beforeEach(() => {
    scanner = new MigrationScanner(['/test/packages'])
    vi.clearAllMocks()
  })

  it('空目录应返回空 Map', async () => {
    // Arrange
    vi.mocked(fs.readdir).mockResolvedValue([] as never)

    // Act
    const result = await scanner.discoverMigrations()

    // Assert
    expect(result.size).toBe(0)
  })

  it('应发现单个插件的迁移版本', async () => {
    // Arrange - 模拟文件系统结构:
    // packages/plugin-core/migrations/1.0.0/preload.sql
    // packages/plugin-core/migrations/1.0.0/postsync.sql
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce(['plugin-core'] as never)
      .mockResolvedValueOnce(['migrations'] as never)
      .mockResolvedValueOnce(['1.0.0'] as never)
      .mockResolvedValueOnce(['preload.sql', 'postsync.sql'] as never)

    vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as never)

    // Act
    const result = await scanner.discoverMigrations()

    // Assert
    expect(result.has('@audebase/plugin-core')).toBe(true)
    const versions = result.get('@audebase/plugin-core')!
    expect(versions).toHaveLength(1)
    expect(versions[0].version).toBe('1.0.0')
    expect(versions[0].files.preload).toBeDefined()
    expect(versions[0].files.postsync).toBeDefined()
    expect(versions[0].files.postload).toBeUndefined()
  })

  it('应发现多插件多版本迁移', async () => {
    // Arrange - plugin-core: 1.0.0, 1.1.0; plugin-rbac: 1.0.0
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce(['plugin-core', 'plugin-rbac'] as never)
      // plugin-core
      .mockResolvedValueOnce(['migrations'] as never)
      .mockResolvedValueOnce(['1.0.0', '1.1.0'] as never)
      .mockResolvedValueOnce(['preload.sql'] as never)
      .mockResolvedValueOnce(['preload.sql', 'postsync.sql'] as never)
      // plugin-rbac
      .mockResolvedValueOnce(['migrations'] as never)
      .mockResolvedValueOnce(['1.0.0'] as never)
      .mockResolvedValueOnce(['preload.sql', 'postsync.sql', 'postload.sql'] as never)

    vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as never)

    // Act
    const result = await scanner.discoverMigrations()

    // Assert
    expect(result.size).toBe(2)
    expect(result.get('@audebase/plugin-core')).toHaveLength(2)
    expect(result.get('@audebase/plugin-rbac')).toHaveLength(1)
  })

  it('应忽略非 SemVer 版本目录', async () => {
    // Arrange - 存在 'latest' 和 'v1' 等无效版本目录
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce(['plugin-core'] as never)
      .mockResolvedValueOnce(['migrations'] as never)
      .mockResolvedValueOnce(['1.0.0', 'latest', 'v1.0', 'bad-version'] as never)
      .mockResolvedValueOnce(['preload.sql'] as never)

    vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as never)

    // Act
    const result = await scanner.discoverMigrations()

    // Assert
    const versions = result.get('@audebase/plugin-core')!
    expect(versions).toHaveLength(1)
    expect(versions[0].version).toBe('1.0.0')
  })

  it('版本目录应升序排序', async () => {
    // Arrange - 版本 2.0.0, 1.0.0, 1.5.0, 1.0.1
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce(['plugin-core'] as never)
      .mockResolvedValueOnce(['migrations'] as never)
      .mockResolvedValueOnce(['2.0.0', '1.0.0', '1.5.0', '1.0.1'] as never)
      .mockResolvedValue(['preload.sql'] as never)

    vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as never)

    // Act
    const result = await scanner.discoverMigrations()

    // Assert
    const versions = result.get('@audebase/plugin-core')!
    const versionNumbers = versions.map(v => v.version)
    expect(versionNumbers).toEqual(['1.0.0', '1.0.1', '1.5.0', '2.0.0'])
  })
})
