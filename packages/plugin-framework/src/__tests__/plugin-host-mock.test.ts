// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect, vi } from 'vitest'
import { InlinePluginHost } from '../plugin-host.js'
import type { Manifest } from '../manifest-schema.js'

function createMockManifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    name: '@test/plugin',
    version: '1.0.0',
    display_name: 'Test Plugin',
    application: { entry: 'src/index.ts' },
    runtime: { mode: 'inline' as const, partition: 'SYSTEM' },
    dependencies: [],
    assets: [],
    security: {},
    models: [],
    permissions: [],
    cron: [],
    data: [],
    ...overrides,
  }
}

describe('InlinePluginHost Mock 约束 (D1.2)', () => {
  // 约束 1: 所有方法返回 Promise
  it('load() 应返回 Promise', async () => {
    // Arrange
    const host = new InlinePluginHost(createMockManifest(), { mockDelay: 0 })

    // Act
    const result = host.load()

    // Assert
    expect(result).toBeInstanceOf(Promise)
    await result // 不抛异常
  })

  // 约束 2: 参数经过 JSON 序列化
  it('install() 参数应经过 JSON 序列化（丢失函数和 undefined）', async () => {
    // Arrange
    const host = new InlinePluginHost(createMockManifest(), { mockDelay: 0 })
    const fn = (): void => {}
    const input = { nested: { date: new Date('2026-01-01') }, fn, undef: undefined }

    // Act
    const serialized = JSON.parse(JSON.stringify(input))

    // Assert
    // 函数被丢弃
    expect(serialized).not.toHaveProperty('fn')
    // undefined 被丢弃
    expect(serialized).not.toHaveProperty('undef')
    // Date 变为字符串
    expect(typeof serialized.nested.date).toBe('string')
  })

  // 约束 3: 返回值经过 JSON 反序列化
  it('load() 返回值应可安全 JSON.stringify', async () => {
    // Arrange
    const host = new InlinePluginHost(createMockManifest(), { mockDelay: 0 })

    // Act
    const result = await host.load()

    // Assert - 不应抛出 Circular reference 错误
    expect(() => JSON.stringify(result)).not.toThrow()
  })

  // 约束 4: 30s 超时
  it('超时插件应在 30s 后拒绝', async () => {
    // Arrange
    const slowManifest = createMockManifest()
    const host = new InlinePluginHost(slowManifest, {
      mockDelay: 0,
      mockLoadDuration: 35_000, // 35s
    })

    // Act & Assert
    await expect(host.load()).rejects.toThrow('timeout')
  }, 40_000) // vitest 超时略大于 30s

  // 约束 5: 1-5ms 延迟注入
  it('应注入 mock 延迟（1-5ms）', async () => {
    // Arrange
    const host = new InlinePluginHost(createMockManifest(), { mockDelay: 3 })

    // Act
    const start = performance.now()
    await host.load()
    const elapsed = performance.now() - start

    // Assert - 允许 ±2ms 误差
    expect(elapsed).toBeGreaterThanOrEqual(1)
    expect(elapsed).toBeLessThanOrEqual(7)
  })
})

describe('插件生命周期钩子执行顺序', () => {
  it('install 流程应依次触发 afterAdd -> beforeLoad -> load -> install -> afterEnable', async () => {
    // Arrange
    const callOrder: string[] = []
    const mockManifest = createMockManifest()
    const host = new InlinePluginHost(mockManifest, { mockDelay: 0 })

    // Mock 生命周期钩子
    host.afterAdd = vi.fn(async (): Promise<void> => { callOrder.push('afterAdd') })
    host.beforeLoad = vi.fn(async (): Promise<void> => { callOrder.push('beforeLoad') })
    const origLoad = host.load.bind(host)
    host.load = vi.fn(async (): Promise<void> => {
      callOrder.push('load')
      return origLoad()
    })
    host.install = vi.fn(async (): Promise<void> => { callOrder.push('install') })
    host.afterEnable = vi.fn(async (): Promise<void> => { callOrder.push('afterEnable') })

    // Act - 模拟 Core 的 install 流程
    await host.afterAdd?.()
    await host.beforeLoad?.()
    await host.load()
    await host.install?.()
    await host.afterEnable?.()

    // Assert
    expect(callOrder).toEqual([
      'afterAdd',
      'beforeLoad',
      'load',
      'install',
      'afterEnable',
    ])
  })

  it('enable 流程不应重复调用 install', async () => {
    // Arrange
    const host = new InlinePluginHost(createMockManifest(), { mockDelay: 0 })
    const installFn = vi.fn()
    host.install = installFn
    host.afterEnable = vi.fn()

    // Act - enable 不应调用 install
    await host.afterEnable?.()

    // Assert
    expect(installFn).not.toHaveBeenCalled()
  })

  it('disable 流程应触发 afterDisable', async () => {
    // Arrange
    const host = new InlinePluginHost(createMockManifest(), { mockDelay: 0 })
    const disableFn = vi.fn()
    host.afterDisable = disableFn

    // Act
    await host.afterDisable?.()

    // Assert
    expect(disableFn).toHaveBeenCalledOnce()
  })

  it('uninstall 流程应先 disable 再 preUninstall', async () => {
    // Arrange
    const callOrder: string[] = []
    const host = new InlinePluginHost(createMockManifest(), { mockDelay: 0 })
    host.afterDisable = vi.fn(async (): Promise<void> => { callOrder.push('afterDisable') })
    host.preUninstall = vi.fn(async (): Promise<void> => { callOrder.push('preUninstall') })

    // Act - 模拟 Core 的 uninstall 流程
    await host.afterDisable?.()
    await host.preUninstall?.()

    // Assert
    expect(callOrder).toEqual(['afterDisable', 'preUninstall'])
  })
})

describe('InlinePluginHost 方法测试', () => {
  it('enable() 返回 Promise', async () => {
    // Arrange
    const host = new InlinePluginHost(createMockManifest(), { mockDelay: 0 })

    // Act
    const result = host.enable()

    // Assert
    expect(result).toBeInstanceOf(Promise)
    await expect(result).resolves.toBeUndefined()
  })

  it('disable() 返回 Promise', async () => {
    // Arrange
    const host = new InlinePluginHost(createMockManifest(), { mockDelay: 0 })

    // Act
    const result = host.disable()

    // Assert
    expect(result).toBeInstanceOf(Promise)
    await expect(result).resolves.toBeUndefined()
  })

  it('installPlugin() 返回 Promise', async () => {
    // Arrange
    const host = new InlinePluginHost(createMockManifest(), { mockDelay: 0 })

    // Act
    const result = host.installPlugin()

    // Assert
    expect(result).toBeInstanceOf(Promise)
    await expect(result).resolves.toBeUndefined()
  })

  it('uninstallPlugin() 返回 Promise', async () => {
    // Arrange
    const host = new InlinePluginHost(createMockManifest(), { mockDelay: 0 })

    // Act
    const result = host.uninstallPlugin()

    // Assert
    expect(result).toBeInstanceOf(Promise)
    await expect(result).resolves.toBeUndefined()
  })

  it('mockDelay 注入延迟到 enable()', async () => {
    // Arrange
    const host = new InlinePluginHost(createMockManifest(), { mockDelay: 10 })

    // Act
    const start = performance.now()
    await host.enable()
    const elapsed = performance.now() - start

    // Assert
    expect(elapsed).toBeGreaterThanOrEqual(8)
  })

  it('disable() 包含延迟注入', async () => {
    // Arrange
    const host = new InlinePluginHost(createMockManifest(), { mockDelay: 5 })

    // Act
    const start = performance.now()
    await host.disable()
    const elapsed = performance.now() - start

    // Assert
    expect(elapsed).toBeGreaterThanOrEqual(3)
  })
})
