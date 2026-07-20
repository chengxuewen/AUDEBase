// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect, vi, beforeEach } from 'vitest'
import PluginCore from '../index.js'
import type { PluginHost } from '@audebase/shared-types'

// 创建 mock PluginHost（提供 db, t(), logger, config）
function createMockHost(overrides: Partial<PluginHost> = {}): PluginHost {
  const mockDb = {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({ id: 'mock-id' }),
        }),
        onConflictDoNothing: vi.fn().mockReturnThis(),
      }),
    }),
    query: {
      users: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      roles: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      tenants: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    },
  }

  return {
    name: '@audebase/plugin-core',
    status: 'installed',
    manifest: {
      name: '@audebase/plugin-core',
      version: '1.0.0',
      display_name: '内核插件',
      application: { entry: 'src/index.ts' },
      runtime: { mode: 'inline' as const, partition: 'SYSTEM' },
      dependencies: [],
      assets: [],
      security: {},
      models: [],
      permissions: [],
      cron: [],
      data: [],
    },
    db: mockDb as unknown as PluginHost['db'],
    t: (key: string): string => key,
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as unknown as PluginHost['logger'],
    config: { get: vi.fn() } as unknown as PluginHost['config'],
    ...overrides,
  }
}

describe('PluginCore', () => {
  let plugin: InstanceType<typeof PluginCore>

  beforeEach(() => {
    plugin = new PluginCore()
  })

  it('应继承 PluginHost 接口', () => {
    // Assert - PluginCore 应实现 PluginHost 的所有必需方法
    expect(plugin.name).toBeDefined()
    expect(plugin.status).toBeDefined()
    expect(plugin.manifest).toBeDefined()
    expect(plugin.db).toBeDefined()
    expect(typeof plugin.t).toBe('function')
    expect(plugin.logger).toBeDefined()
  })

  it('install() 应创建系统租户', async () => {
    // Arrange
    const host = createMockHost()
    plugin.injectHost(host)

    // Act
    await plugin.install?.()

    // Assert
    expect(host.db.insert).toHaveBeenCalled()
  })

  it('dependencies 应为空数组（零依赖）', () => {
    // Arrange & Act & Assert
    // D1.6: plugin-core 零依赖
    expect(plugin.manifest.dependencies).toEqual([])
  })

  it('auto_install 应为 true（不可卸载）', () => {
    // Arrange & Act & Assert
    // D1.6: plugin-core 不可卸载
    expect(plugin.manifest.auto_install).toBe(true)
  })

  it('name 应为 @audebase/plugin-core', () => {
    // Arrange & Act & Assert
    expect(plugin.name).toBe('@audebase/plugin-core')
  })

  it('runtime mode 应为 inline', () => {
    // Arrange & Act & Assert
    expect(plugin.manifest.runtime.mode).toBe('inline')
  })

  it('runtime partition 应为 SYSTEM', () => {
    // Arrange & Act & Assert
    expect(plugin.manifest.runtime.partition).toBe('SYSTEM')
  })

  it('version 应为 SemVer 格式', () => {
    // Arrange & Act & Assert
    expect(plugin.manifest.version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('getBootstrapData() 应返回预期数据结构', () => {
    // Arrange & Act
    const data = plugin.getBootstrapData()

    // Assert
    expect(data).toBeDefined()
    expect(data.systemTenant).toBeDefined()
    expect(data.defaultRoles).toBeDefined()
    expect(data.corePermissions).toBeDefined()
    expect(data.adminUser).toBeDefined()
  })
})
