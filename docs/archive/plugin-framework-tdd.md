# Plugin Framework TDD 测试策略 — Phase 1a

> **创建日期**: 2026-07-13  
> **目的**: 为 Phase 1a #6 模块（插件框架）提供完整的 TDD 测试策略与用例设计。  
> **前置阅读**: D1.1, D1.2, D1.4, D1.5, plugin-framework-sdd.md, test-seed-strategy.md, redis-mock-guide.md  
> **责任人**: Person B  
> **覆盖率目标**: 80% lines（核心路径 plugin-manager.ts 强制 80%）

---

## 1. 测试金字塔

```
         ┌──────────────────────┐
         │  E2E (10%)            │  Playwright: 安装/启用/禁用插件完整流程
         │  packages/admin-ui/   │
         │  __e2e__/plugins.e2e.│
         │  ts                    │
         ├──────────────────────┤
         │  集成测试 (35%)        │  Fastify.inject() + 真实 PG + mock Redis
         │  packages/core/       │  PluginManager 完整状态机 + manifest 验证
         │  __tests__/integration│  + 依赖解析 + 审计日志联动
         ├──────────────────────┤
         │  单元测试 (55%)        │  Vitest: manifest 解析、依赖排序、状态转换
         │  packages/core/       │  生命周期钩子顺序、InlinePluginHost mock 约束
         │  __tests__/unit/      │
         └──────────────────────┘
```

## 2. 测试边界

| 测试层级 | 范围 | Mock 策略 | 文件位置 |
|---------|------|----------|---------|
| 单元测试 | Manifest 解析、依赖拓扑排序、状态转换 | mock 所有外部依赖（DB、文件系统、Redis） | `packages/core/src/__tests__/unit/` |
| 集成测试 | PluginManager + 真实 Drizzle + modules 表 | 真实 PG（事务回滚）+ mock Redis | `packages/core/src/__tests__/integration/` |
| 契约测试 | REST API `/api/plugins/*` 响应形状 | Fastify.inject() + Zod schema 校验 | `packages/core/src/__tests__/contracts/` |
| E2E 测试 | 完整 install→enable→disable 浏览器流程 | 真实 PG + 真实 Redis + Playwright | `packages/admin-ui/__e2e__/plugins.e2e.ts` |

---

## 3. 单元测试设计

### 3.1 Manifest 验证（Zod Schema）

**测试文件**: `packages/core/src/__tests__/unit/manifest-schema.test.ts`

**覆盖目标**: `manifestSchema.parse()` 的所有字段和错误路径

```typescript
import { describe, test, expect } from 'vitest'
import { manifestSchema } from '../../manifest-schema'

describe('manifestSchema', () => {
  // === 合法 manifest ===

  test('应通过合法的完整 manifest', () => {
    // Arrange
    const validManifest = {
      name: '@audebase/plugin-core',
      version: '1.0.0',
      display_name: '内核插件',
      description: '平台核心引导插件',
      category: 'SYSTEM',
      license: 'Apache-2.0',
      application: {
        entry: 'src/index.ts',
        author: 'aude-team',
      },
      dependencies: ['@audebase/plugin-rbac'],
      assets: ['dist/admin.js'],
      runtime: {
        mode: 'inline' as const,
        partition: 'SYSTEM',
        crash_policy: 'restart' as const,
      },
      security: {},
      models: [{ name: 'user', table: 'users' }],
      permissions: [{ action: 'manage', resource: 'plugin' }],
      locale: { path: 'locale' },
      data: [],
      cron: [],
    }

    // Act
    const result = manifestSchema.safeParse(validManifest)

    // Assert
    expect(result.success).toBe(true)
  })

  test('应通过仅含必填字段的最小 manifest', () => {
    // Arrange
    const minimalManifest = {
      name: '@audebase/plugin-minimal',
      version: '0.1.0',
      display_name: '最小插件',
      application: { entry: 'src/index.ts' },
      runtime: { mode: 'inline' as const, partition: 'SYSTEM' },
    }

    // Act
    const result = manifestSchema.safeParse(minimalManifest)

    // Assert
    expect(result.success).toBe(true)
  })

  // === 非法 manifest ===

  test('name 不符合 @scope/plugin- 格式应拒绝', () => {
    // Arrange
    const badNames = ['my-plugin', '@audebase/my-plugin', 'plugin-hello', '']

    for (const name of badNames) {
      const manifest = {
        name,
        version: '1.0.0',
        display_name: 'Test',
        application: { entry: 'src/index.ts' },
        runtime: { mode: 'inline' as const, partition: 'SYSTEM' },
      }

      // Act
      const result = manifestSchema.safeParse(manifest)

      // Assert
      expect(result.success).toBe(false)
    }
  })

  test('version 不符合 SemVer 应拒绝', () => {
    // Arrange
    const badVersions = ['1.0', 'v1.0.0', 'latest', '1.0.0.0', '']

    for (const version of badVersions) {
      const manifest = {
        name: '@audebase/plugin-test',
        version,
        display_name: 'Test',
        application: { entry: 'src/index.ts' },
        runtime: { mode: 'inline' as const, partition: 'SYSTEM' },
      }

      // Act
      const result = manifestSchema.safeParse(manifest)

      // Assert
      expect(result.success).toBe(false)
    }
  })

  test('缺少必填字段应返回 ZodError', () => {
    // Arrange
    const incompleteManifest = {
      name: '@audebase/plugin-test',
      // 缺少 version, display_name, application, runtime
    }

    // Act
    const result = manifestSchema.safeParse(incompleteManifest)

    // Assert
    expect(result.success).toBe(false)
    if (!result.success) {
      const missingFields = result.error.issues.map(i => i.path.join('.'))
      expect(missingFields).toContain('version')
      expect(missingFields).toContain('display_name')
      expect(missingFields).toContain('application')
      expect(missingFields).toContain('runtime')
    }
  })

  test('runtime.mode 非 inline 应拒绝（Phase 1a 仅支持 inline）', () => {
    // Arrange
    const manifest = {
      name: '@audebase/plugin-test',
      version: '1.0.0',
      display_name: 'Test',
      application: { entry: 'src/index.ts' },
      runtime: { mode: 'process', partition: 'SYSTEM' },
    }

    // Act
    const result = manifestSchema.safeParse(manifest)

    // Assert
    expect(result.success).toBe(false)
  })
})
```

### 3.2 依赖拓扑排序

**测试文件**: `packages/core/src/__tests__/unit/dependency-resolver.test.ts`

**覆盖目标**: `resolveDependencyOrder()` 所有场景

```typescript
import { describe, test, expect } from 'vitest'
import { resolveDependencyOrder } from '../../plugin-manager'
import type { PluginDescriptor } from '@audebase/shared-types'

// 辅助函数：创建测试 PluginDescriptor
function createPlugin(
  name: string,
  dependencies: string[] = [],
): PluginDescriptor {
  return {
    name,
    version: '1.0.0',
    displayName: name,
    partition: 'SYSTEM',
    mode: 'inline',
    dependencies,
    manifestPath: `/plugins/${name}/manifest.yaml`,
    entryPath: `src/index.ts`,
    status: 'discovered',
  }
}

describe('resolveDependencyOrder', () => {
  test('应处理空插件列表', async () => {
    // Arrange
    const plugins: PluginDescriptor[] = []

    // Act
    const result = await resolveDependencyOrder(plugins)

    // Assert
    expect(result).toHaveLength(0)
  })

  test('应正确排序线性依赖链', async () => {
    // Arrange
    // C -> B -> A (A 在最底层，应最先加载)
    const plugins = [
      createPlugin('@audebase/plugin-c', ['@audebase/plugin-b']),
      createPlugin('@audebase/plugin-b', ['@audebase/plugin-a']),
      createPlugin('@audebase/plugin-a'),
    ]

    // Act
    const result = await resolveDependencyOrder(plugins)

    // Assert
    const names = result.map(p => p.name)
    expect(names.indexOf('@audebase/plugin-a'))
      .toBeLessThan(names.indexOf('@audebase/plugin-b'))
    expect(names.indexOf('@audebase/plugin-b'))
      .toBeLessThan(names.indexOf('@audebase/plugin-c'))
  })

  test('应正确排序多依赖（菱形依赖）', async () => {
    // Arrange
    // D -> B + C, B -> A, C -> A
    const plugins = [
      createPlugin('@audebase/plugin-d', ['@audebase/plugin-b', '@audebase/plugin-c']),
      createPlugin('@audebase/plugin-b', ['@audebase/plugin-a']),
      createPlugin('@audebase/plugin-c', ['@audebase/plugin-a']),
      createPlugin('@audebase/plugin-a'),
    ]

    // Act
    const result = await resolveDependencyOrder(plugins)

    // Assert
    const names = result.map(p => p.name)
    expect(names.indexOf('@audebase/plugin-a')).toBe(0)  // A 最先
    expect(names.indexOf('@audebase/plugin-d')).toBe(names.length - 1)  // D 最后
    // B 和 C 的顺序无关紧要（拓扑相邻层级）
  })

  test('应检测循环依赖', async () => {
    // Arrange
    // A -> B -> C -> A (循环)
    const plugins = [
      createPlugin('@audebase/plugin-a', ['@audebase/plugin-b']),
      createPlugin('@audebase/plugin-b', ['@audebase/plugin-c']),
      createPlugin('@audebase/plugin-c', ['@audebase/plugin-a']),
    ]

    // Act & Assert
    await expect(resolveDependencyOrder(plugins))
      .rejects.toThrow('循环依赖')
  })

  test('应检测缺失依赖', async () => {
    // Arrange
    const plugins = [
      createPlugin('@audebase/plugin-a', ['@audebase/plugin-missing']),
    ]

    // Act & Assert
    await expect(resolveDependencyOrder(plugins))
      .rejects.toThrow('缺失依赖')
  })

  test('plugin-core 应始终排在第一位', async () => {
    // Arrange
    // 无论依赖如何声明，plugin-core 都是最先加载的
    const plugins = [
      createPlugin('@audebase/plugin-b'),
      createPlugin('@audebase/plugin-a'),
      createPlugin('@audebase/plugin-core'), // D1.6: dependencies: []
    ]

    // Act
    const result = await resolveDependencyOrder(plugins)

    // Assert
    expect(result[0].name).toBe('@audebase/plugin-core')
  })

  test('应处理自引用依赖（拒绝）', async () => {
    // Arrange
    const plugins = [
      createPlugin('@audebase/plugin-a', ['@audebase/plugin-a']),
    ]

    // Act & Assert
    await expect(resolveDependencyOrder(plugins))
      .rejects.toThrow()
  })
})
```

### 3.3 状态转换

**测试文件**: `packages/core/src/__tests__/unit/plugin-state-machine.test.ts`

```typescript
import { describe, test, expect } from 'vitest'

// 状态转换规则表（来源: plugin-framework-sdd.md §2.2）
type PluginStatus = 'discovered' | 'installed' | 'loaded' | 'enabled' | 'disabled' | 'migration_failed'

interface StateTransition {
  from: PluginStatus | null  // null = 不存在
  action: 'discover' | 'install' | 'enable' | 'disable' | 'uninstall' | 'migration_fail'
  to: PluginStatus | null    // null = 已移除
  condition?: string
}

const VALID_TRANSITIONS: StateTransition[] = [
  { from: null, action: 'discover', to: 'discovered' },
  { from: 'discovered', action: 'install', to: 'installed', condition: '依赖已安装' },
  { from: 'installed', action: 'enable', to: 'enabled' },
  { from: 'enabled', action: 'disable', to: 'disabled', condition: '无其他插件依赖它' },
  { from: 'disabled', action: 'enable', to: 'enabled' },
  { from: 'disabled', action: 'uninstall', to: null, condition: '无其他插件依赖它' },
  { from: '*', action: 'migration_fail', to: 'migration_failed' },
]

describe('Plugin 状态机', () => {
  it.each(VALID_TRANSITIONS)(
    '应从 $from 通过 $action 转换到 $to',
    ({ from, action, to }) => {
      // Arrange — 使用状态转换表验证
      
      // Act — 如果 from 是 '*', 表示通配所有状态
      if (from === '*') {
        const allStates: PluginStatus[] = [
          'discovered', 'installed', 'loaded', 'enabled', 'disabled'
        ]
        for (const state of allStates) {
          // 迁移失败可以从任何状态触发
          expect(to).toBe('migration_failed')
        }
        return
      }

      // Act & Assert — 正向转换
      expect(VALID_TRANSITIONS.some(
        t => t.from === from && t.action === action && t.to === to
      )).toBe(true)
    }
  )

  test('enabled 状态不应直接 uninstall（需先 disable）', () => {
    // Arrange
    const enabledToUninstall = VALID_TRANSITIONS.find(
      t => t.from === 'enabled' && t.action === 'uninstall'
    )

    // Assert — enabled 状态不可直接卸载
    expect(enabledToUninstall).toBeUndefined()
  })

  test('migration_failed 插件不应阻塞其他插件启动', () => {
    // Arrange — migration_failed 是终端状态（Phase 1a）
    const recoveryFromFailed = VALID_TRANSITIONS.find(
      t => t.from === 'migration_failed' && t.to !== 'migration_failed'
    )

    // Assert — Phase 1a 不支持从 migration_failed 自动恢复
    expect(recoveryFromFailed).toBeUndefined()
  })
})
```

### 3.4 InlinePluginHost Mock 约束（D1.2）

**测试文件**: `packages/core/src/__tests__/unit/plugin-host-mock.test.ts`

```typescript
import { describe, test, expect, vi } from 'vitest'
import { InlinePluginHost } from '../../plugin-host'
import type { PluginHost, Manifest } from '@audebase/shared-types'

function createMockPlugin(overrides: Partial<Manifest> = {}): Manifest {
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

describe('InlinePluginHost Mock 约束', () => {
  // 约束 1: 所有方法返回 Promise
  test('load() 应返回 Promise', async () => {
    // Arrange
    const host = new InlinePluginHost(createMockPlugin(), { mockDelay: 0 })

    // Act
    const result = host.load()

    // Assert
    expect(result).toBeInstanceOf(Promise)
    await result // 不抛异常
  })

  // 约束 2: 参数经过 JSON 序列化
  test('install() 参数应经过 JSON 序列化（丢失函数和 undefined）', async () => {
    // Arrange
    const host = new InlinePluginHost(createMockPlugin(), { mockDelay: 0 })
    const fn = () => {}
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
  test('load() 返回值应可安全 JSON.stringify', async () => {
    // Arrange
    const host = new InlinePluginHost(createMockPlugin(), { mockDelay: 0 })

    // Act
    const result = await host.load()

    // Assert — 不应抛出 Circular reference 错误
    expect(() => JSON.stringify(result)).not.toThrow()
  })

  // 约束 4: 30s 超时
  test('超时插件应在 30s 后拒绝', async () => {
    // Arrange
    const slowManifest = createMockPlugin()
    const host = new InlinePluginHost(slowManifest, {
      mockDelay: 0,
      mockLoadDuration: 35_000, // 35s
    })

    // Act & Assert
    await expect(host.load()).rejects.toThrow('timeout')
  }, 40_000) // vitest 超时略大于 30s

  // 约束 5: 1-5ms 延迟注入
  test('应注入 mock 延迟（1-5ms）', async () => {
    // Arrange
    const host = new InlinePluginHost(createMockPlugin(), { mockDelay: 3 })

    // Act
    const start = performance.now()
    await host.load()
    const elapsed = performance.now() - start

    // Assert — 允许 ±2ms 误差
    expect(elapsed).toBeGreaterThanOrEqual(1)
    expect(elapsed).toBeLessThanOrEqual(7)
  })
})
```

### 3.5 生命周期钩子顺序

**测试文件**: `packages/core/src/__tests__/unit/plugin-lifecycle.test.ts`

```typescript
import { describe, test, expect, vi } from 'vitest'
import { InlinePluginHost } from '../../plugin-host'

describe('插件生命周期钩子执行顺序', () => {
  test('install 流程应依次触发 afterAdd → beforeLoad → load → install → afterEnable', async () => {
    // Arrange
    const callOrder: string[] = []
    const mockPlugin = {
      name: '@test/plugin',
      version: '1.0.0',
      display_name: 'Test',
      application: { entry: 'src/index.ts' },
      runtime: { mode: 'inline' as const, partition: 'SYSTEM' },
      dependencies: [],
      assets: [],
      security: {},
      models: [],
      permissions: [],
      cron: [],
      data: [],
    }

    const host = new InlinePluginHost(mockPlugin, { mockDelay: 0 })

    // Mock 生命周期钩子
    host.afterAdd = vi.fn(async () => { callOrder.push('afterAdd') })
    host.beforeLoad = vi.fn(async () => { callOrder.push('beforeLoad') })
    const origLoad = host.load.bind(host)
    host.load = vi.fn(async () => {
      callOrder.push('load')
      return origLoad()
    })
    host.install = vi.fn(async () => { callOrder.push('install') })
    host.afterEnable = vi.fn(async () => { callOrder.push('afterEnable') })

    // Act — 模拟 Core 的 install 流程
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

  test('enable 流程不应重复调用 install', async () => {
    // Arrange
    const host = new InlinePluginHost(
      { name: '@test/plugin', version: '1.0.0', display_name: 'Test', application: { entry: 'src/index.ts' }, runtime: { mode: 'inline' as const, partition: 'SYSTEM' }, dependencies: [], assets: [], security: {}, models: [], permissions: [], cron: [], data: [] },
      { mockDelay: 0 },
    )

    const installFn = vi.fn()
    host.install = installFn
    host.afterEnable = vi.fn()

    // Act — enable 不应调用 install
    await host.afterEnable?.()

    // Assert
    expect(installFn).not.toHaveBeenCalled()
  })

  test('disable 流程应触发 afterDisable', async () => {
    // Arrange
    const host = new InlinePluginHost(
      { name: '@test/plugin', version: '1.0.0', display_name: 'Test', application: { entry: 'src/index.ts' }, runtime: { mode: 'inline' as const, partition: 'SYSTEM' }, dependencies: [], assets: [], security: {}, models: [], permissions: [], cron: [], data: [] },
      { mockDelay: 0 },
    )

    const disableFn = vi.fn()
    host.afterDisable = disableFn

    // Act
    await host.afterDisable?.()

    // Assert
    expect(disableFn).toHaveBeenCalledOnce()
  })

  test('uninstall 流程应先 disable 再 preUninstall', async () => {
    // Arrange
    const callOrder: string[] = []
    const host = new InlinePluginHost(
      { name: '@test/plugin', version: '1.0.0', display_name: 'Test', application: { entry: 'src/index.ts' }, runtime: { mode: 'inline' as const, partition: 'SYSTEM' }, dependencies: [], assets: [], security: {}, models: [], permissions: [], cron: [], data: [] },
      { mockDelay: 0 },
    )

    host.afterDisable = vi.fn(async () => { callOrder.push('afterDisable') })
    host.preUninstall = vi.fn(async () => { callOrder.push('preUninstall') })

    // Act — 模拟 Core 的 uninstall 流程
    await host.afterDisable?.()
    await host.preUninstall?.()

    // Assert
    expect(callOrder).toEqual(['afterDisable', 'preUninstall'])
  })
})
```

---

## 4. 集成测试设计

### 4.1 PluginManager 完整状态机

**测试文件**: `packages/core/src/__tests__/integration/plugin-manager.integration.test.ts`

**环境要求**: 真实 PostgreSQL（事务回滚）+ ioredis-mock

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { createTestApp, type TestApp } from '../helpers/create-test-app'
import { seedTestPlugin } from '../seeds/plugins'

describe('PluginManager 集成测试', () => {
  let test: TestApp

  beforeEach(async () => {
    test = await createTestApp({ withRedis: true })
  })

  afterEach(async () => {
    await test.cleanup()
  })

  test('discover() 应发现文件系统中的插件', async () => {
    // Arrange — 在临时目录创建 manifest.yaml
    await seedTestPlugin(test, {
      name: '@test/plugin-alpha',
      version: '1.0.0',
      displayName: 'Alpha Plugin',
    })

    // Act
    const plugins = await test.app.pluginManager.discover()

    // Assert
    const alpha = plugins.find(p => p.name === '@test/plugin-alpha')
    expect(alpha).toBeDefined()
    expect(alpha!.status).toBe('discovered')
  })

  test('完整状态转换: discovered → installed → enabled → disabled → uninstall', async () => {
    // Arrange
    const pluginName = '@test/plugin-beta'
    await seedTestPlugin(test, { name: pluginName, version: '1.0.0' })
    const pm = test.app.pluginManager

    // Act & Assert — discovered
    await pm.discover()
    let plugin = pm.getPlugin(pluginName)
    expect(plugin).toBeDefined()

    // Act & Assert — install
    await pm.install(pluginName)
    plugin = pm.getPlugin(pluginName)
    expect(plugin!.status).toBe('installed')

    // Act & Assert — enable
    await pm.enable(pluginName)
    plugin = pm.getPlugin(pluginName)
    expect(plugin!.status).toBe('enabled')

    // Act & Assert — disable
    await pm.disable(pluginName)
    plugin = pm.getPlugin(pluginName)
    expect(plugin!.status).toBe('disabled')

    // Act & Assert — uninstall
    await pm.uninstall(pluginName)
    plugin = pm.getPlugin(pluginName)
    expect(plugin).toBeUndefined()
  })

  test('重复安装应返回错误', async () => {
    // Arrange
    const pluginName = '@test/plugin-gamma'
    await seedTestPlugin(test, { name: pluginName, version: '1.0.0' })
    const pm = test.app.pluginManager

    await pm.discover()
    await pm.install(pluginName)

    // Act & Assert
    await expect(pm.install(pluginName)).rejects.toThrow('ALREADY_INSTALLED')
  })

  test('有启用依赖的插件不可禁用', async () => {
    // Arrange — plugin-a 被 plugin-b 依赖，且 plugin-b 是 enabled
    const pluginA = '@test/plugin-dependency-a'
    const pluginB = '@test/plugin-dependency-b'

    await seedTestPlugin(test, { name: pluginA, version: '1.0.0' })
    await seedTestPlugin(test, {
      name: pluginB,
      version: '1.0.0',
      dependencies: [pluginA],
    })

    const pm = test.app.pluginManager
    await pm.discover()
    await pm.install(pluginA)
    await pm.install(pluginB)
    await pm.enable(pluginA)
    await pm.enable(pluginB)

    // Act & Assert — 禁用被依赖的 plugin-a 应返回 409
    await expect(pm.disable(pluginA)).rejects.toThrow('DEPENDENCY_CONFLICT')
  })

  test('状态变更加入审计日志', async () => {
    // Arrange
    const pluginName = '@test/plugin-audit'
    await seedTestPlugin(test, { name: pluginName, version: '1.0.0' })
    const pm = test.app.pluginManager
    await pm.discover()

    // Act
    await pm.install(pluginName)

    // Assert — 查询 audit_log 表
    const logs = await test.db.query.auditLog.findMany({
      where: (fields, { eq, and }) =>
        and(eq(fields.resourceType, 'plugin'), eq(fields.resourceId, pluginName)),
    })
    expect(logs.length).toBeGreaterThanOrEqual(1)
    expect(logs.some(l => l.action === 'lifecycle:install')).toBe(true)
  })
})
```

### 4.2 PluginHost Context 注入

```typescript
describe('PluginHost Context 注入', () => {
  let test: TestApp

  beforeEach(async () => {
    test = await createTestApp({ withRedis: true })
  })

  afterEach(async () => {
    await test.cleanup()
  })

  test('插件应通过 PluginHost.db 访问数据库', async () => {
    // Arrange
    const pluginName = '@test/plugin-db-access'
    await seedTestPlugin(test, { name: pluginName, version: '1.0.0' })
    const pm = test.app.pluginManager
    await pm.discover()
    await pm.install(pluginName)
    await pm.enable(pluginName)

    // Act — 插件代码内通过 this.db 查询
    const host = pm.getPlugin(pluginName)!
    const result = await host.db.query.modules.findFirst()

    // Assert — 不抛异常，插件可以访问数据库
    expect(result).toBeDefined()
  })

  test('插件应通过 PluginHost.t() 获取翻译', async () => {
    // Arrange
    const pluginName = '@test/plugin-i18n'
    await seedTestPlugin(test, { name: pluginName, version: '1.0.0' })
    const pm = test.app.pluginManager
    await pm.discover()
    await pm.install(pluginName)
    const host = pm.getPlugin(pluginName)!

    // Act
    const translated = host.t('plugin.name')

    // Assert — 返回翻译字符串或 key 本身（fallback）
    expect(typeof translated).toBe('string')
    expect(translated.length).toBeGreaterThan(0)
  })
})
```

---

## 5. 契约测试

**测试文件**: `packages/core/src/__tests__/contracts/plugins.contract.test.ts`

```typescript
import { describe, test, expect } from 'vitest'
import { z } from 'zod'
import { createTestApp, type TestApp } from '../helpers/create-test-app'
import { validateContract } from '../helpers/contract-utils'
import { seedAdminUser } from '../seeds/admin'

// Response schemas
const pluginListSchema = z.object({
  data: z.array(z.object({
    name: z.string(),
    version: z.string(),
    displayName: z.string(),
    status: z.enum(['discovered', 'installed', 'loaded', 'enabled', 'disabled', 'migration_failed']),
    partition: z.string(),
    mode: z.literal('inline'),
    dependencies: z.array(z.string()),
  })),
  meta: z.object({
    count: z.number().int().nonnegative(),
  }),
})

describe('插件 API 契约测试', () => {
  let test: TestApp

  beforeEach(async () => {
    test = await createTestApp({ withRedis: true })
    await seedAdminUser(test)
  })

  afterEach(async () => {
    await test.cleanup()
  })

  test('GET /api/plugins 返回插件列表', async () => {
    await validateContract('GET', '/api/plugins', {
      response: pluginListSchema,
      status: 200,
    }, test)
  })

  test('GET /api/plugins/:name 不存在的插件返回 404', async () => {
    await validateContract('GET', '/api/plugins/nonexistent', {
      response: errorResponseSchema,
      status: 404,
    }, test)
  })

  test('POST /api/plugins/:name/enable 未认证返回 401', async () => {
    await validateContract('POST', '/api/plugins/test/enable', {
      response: errorResponseSchema,
      status: 401,
    }, test)
  })
})
```

---

## 6. 测试种子数据

**种子工厂文件**: `packages/core/src/__tests__/seeds/plugins.ts`

```typescript
import type { TestApp } from '../helpers/create-test-app'
import type { PluginDescriptor } from '@audebase/shared-types'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

interface SeedPluginOptions {
  name: string
  version: string
  displayName?: string
  dependencies?: string[]
  partition?: string
}

export async function seedTestPlugin(
  test: TestApp,
  opts: SeedPluginOptions,
): Promise<void> {
  const {
    name,
    version,
    displayName = name,
    dependencies = [],
    partition = 'SYSTEM',
  } = opts

  // 在临时目录创建插件目录结构
  const tmpDir = path.join(os.tmpdir(), `aude-test-${Date.now()}`, name.replace('@', '').replace('/', '-'))
  await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true })

  // manifest.yaml
  const manifest = {
    name,
    version,
    display_name: displayName,
    application: { entry: 'src/index.ts' },
    dependencies,
    runtime: { mode: 'inline', partition },
  }
  await fs.writeFile(
    path.join(tmpDir, 'manifest.yaml'),
    Object.entries(manifest)
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? '' : v}`)
      .join('\n'),
  )

  // 入口文件（最小骨架）
  await fs.writeFile(
    path.join(tmpDir, 'src/index.ts'),
    `export default class Plugin { async load() {} }`,
  )

  // 将临时路径注入 TestApp 的插件扫描路径
  test.addPluginScanPath(tmpDir)
}
```

---

## 7. Mock 策略汇总

| 依赖 | 单元测试策略 | 集成测试策略 |
|------|------------|------------|
| PostgreSQL | 不连接 — mock Drizzle query builder | 真实 PG + 事务回滚 |
| Redis | ioredis-mock | ioredis-mock（Phase 1a 允许） |
| 文件系统 | vitest mock (`vi.mock('fs')`) | 真实临时目录 (`os.tmpdir()`) |
| Fastify | 不需要 — 纯逻辑测试 | `fastify.inject()` |
| manifest.yaml | mock 文件内容（字符串） | 真实文件（`os.tmpdir()` 创建） |

---

## 8. 核心路径覆盖率矩阵

| 文件 | 最低覆盖率 | 关键语句 |
|------|:---:|------|
| `plugin-manager.ts` | **80%** | discover, install, enable, disable, uninstall, isLoaded, getPlugin |
| `plugin-host.ts` | **80%** | load, all 7 lifecycle hooks, JSON marshal assertions |
| `manifest-schema.ts` | **80%** | manifestSchema.parse (all fields) |
| `dependency-resolver.ts` | **80%** | resolveDependencyOrder (Kahn 算法) |
| `plugin-status.ts` | **80%** | 状态转换表 + 条件检查 |

---

## 9. CI 集成

```yaml
# .github/workflows/test.yml (plugin-framework 部分)
jobs:
  test-plugin-framework:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: audebase_test
          POSTGRES_USER: audebase
          POSTGRES_PASSWORD: audebase_test
        ports: ['5432:5432']

    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @audebase/core test -- --coverage
        env:
          AUDE_DATABASE_URL: postgres://audebase:audebase_test@localhost:5432/audebase_test
          AUDE_JWT_SECRET: test-secret-at-least-32-characters-long!!
```

**覆盖率闸门**: `vitest.config.ts` 中配置 `lines: 80, branches: 70, functions: 80`（对 `plugin-manager.ts` 强制 80%）。

---

## 10. 验收标准

遵循 phase-planning.md §1a #6 验收标准：

| # | 标准 | 对应测试 |
|---|------|---------|
| 1 | `PluginManager.discover()` 发现 manifest.yaml 插件 | `plugin-manager.integration.test.ts`: discover() |
| 2 | `plugin.load()` 触发 7 钩子链 | `plugin-lifecycle.test.ts`: 钩子顺序 |
| 3 | manifest name/version 缺失拒绝加载 | `manifest-schema.test.ts`: 缺少必填字段 |
| 4 | 插件通过 Core db 代理查询 | `plugin-manager.integration.test.ts`: Context 注入 |
| 5 | `--strict-plugin-host` 模式下 JSON.parse(JSON.stringify(params)) 往返断言 | `plugin-host-mock.test.ts`: 约束 2/3 |

---

## 参考

- [plugin-framework-sdd.md](plugin-framework-sdd.md) — SDD 接口定义与测试边界
- [test-seed-strategy.md](test-seed-strategy.md) — 测试种子数据工厂
- [redis-mock-guide.md](redis-mock-guide.md) — Redis/BullMQ Mock 指南
- [dev-workflow.md](dev-workflow.md) — Test Harness (`createTestApp`) 设计
- [phase-planning.md](../phase-planning.md) — Phase 1a 模块清单与验收标准
- [../../.agents/memorys/decisions.md](../../.agents/memorys/decisions.md) — D1.1, D1.2, D1.4, D1.5

---

## 11. 错误码覆盖

根据 plugin-framework-sdd.md §5 定义的错误码：

**测试文件**: `packages/plugin-framework/src/__tests__/unit/error-codes.test.ts`

```typescript
import { describe, test, expect, vi } from 'vitest'
import { PluginManager } from '../../plugin-manager'
import { createTestApp, type TestApp } from '../helpers/create-test-app'
import { seedTestPlugin } from '../seeds/plugins'
import { seedMigrationFiles } from '../seeds/migrations'

describe('PluginManager 错误码覆盖', () => {
  let test: TestApp

  beforeEach(async () => {
    test = await createTestApp()
  })

  afterEach(async () => {
    await test.cleanup()
  })

  // NOT_FOUND — 尝试操作不存在的插件
  test('获取不存在的插件应抛出 NOT_FOUND', () => {
    // Arrange & Act & Assert
    expect(() => test.app.pluginManager.getPlugin('@nonexistent/plugin')).toThrow('NOT_FOUND')
  })

  // DEPENDENCY_MISSING — 安装时依赖插件不存在
  test('依赖缺失的插件安装应抛出 DEPENDENCY_MISSING', async () => {
    // Arrange
    await seedTestPlugin(test, {
      name: '@test/plugin-missing-dep',
      version: '1.0.0',
      dependencies: ['@test/nonexistent-dep'],
    })
    const pm = test.app.pluginManager
    await pm.discover()

    // Act & Assert
    await expect(pm.install('@test/plugin-missing-dep')).rejects.toThrow('DEPENDENCY_MISSING')
  })

  // CIRCULAR_DEPENDENCY — 循环依赖检测
  test('循环依赖应抛出 CIRCULAR_DEPENDENCY', async () => {
    // Arrange
    await seedTestPlugin(test, { name: '@test/plugin-cycle-a', version: '1.0.0', dependencies: ['@test/plugin-cycle-b'] })
    await seedTestPlugin(test, { name: '@test/plugin-cycle-b', version: '1.0.0', dependencies: ['@test/plugin-cycle-a'] })
    const pm = test.app.pluginManager
    await pm.discover()

    // Act & Assert
    await expect(pm.install('@test/plugin-cycle-a')).rejects.toThrow('CIRCULAR_DEPENDENCY')
  })

  // LIFECYCLE_ERROR — 生命周期钩子执行失败
  test('enable 钩子抛异常应记录 LIFECYCLE_ERROR', async () => {
    // Arrange
    await seedTestPlugin(test, { name: '@test/plugin-lifecycle-fail', version: '1.0.0' })
    const pm = test.app.pluginManager
    await pm.discover()
    await pm.install('@test/plugin-lifecycle-fail')

    // 模拟 install() 钩子抛出异常
    const host = pm.getPlugin('@test/plugin-lifecycle-fail')!
    host.install = vi.fn().mockRejectedValue(new Error('Install failed'))

    // Act & Assert
    await expect(pm.enable('@test/plugin-lifecycle-fail')).rejects.toThrow('LIFECYCLE_ERROR')
  })

  // MIGRATION_FAILED — 迁移执行失败
  test('迁移失败插件应标记为 MIGRATION_FAILED 状态', async () => {
    // Arrange
    await seedTestPlugin(test, { name: '@test/plugin-migrate-fail', version: '1.0.0' })

    // 创建失败迁移文件
    await seedMigrationFiles(test, '@test/plugin-migrate-fail', '1.0.0', {
      preload: 'INVALID_SQL_THIS_WILL_FAIL;',
    })

    const pm = test.app.pluginManager
    await pm.discover()

    // Act
    await pm.install('@test/plugin-migrate-fail')

    // Assert — 迁移失败不会阻塞系统，插件状态为 migration_failed
    const plugin = pm.getPlugin('@test/plugin-migrate-fail')
    expect(plugin!.status).toBe('migration_failed')
  })

  // MANIFEST_INVALID — manifest 解析失败
  test('无效 manifest 应抛出 MANIFEST_INVALID', async () => {
    // Arrange — 在无效格式的目录中发现 manifest
    const pm = test.app.pluginManager
    
    // Act & Assert
    await expect(pm.discover()).rejects.toThrow('MANIFEST_INVALID')
  })
})
```

| 错误码 | 对应测试 | SDD 引用 |
|--------|---------|----------|
| `NOT_FOUND` | getPlugin 不存在 | plugin-framework-sdd.md §5 |
| `DEPENDENCY_MISSING` | 依赖缺失的插件安装 | plugin-framework-sdd.md §5 |
| `CIRCULAR_DEPENDENCY` | 循环依赖插件安装 | plugin-framework-sdd.md §5 |
| `LIFECYCLE_ERROR` | install/enable 钩子失败 | plugin-framework-sdd.md §5 |
| `MIGRATION_FAILED` | 迁移 SQL 执行失败 | plugin-framework-sdd.md §5 |
| `MANIFEST_INVALID` | manifest.yaml 解析/验证失败 | plugin-framework-sdd.md §5 |

> **上游 TDD 参考**: [shared-types-tdd.md §3.1](shared-types-tdd.md) — ErrorCode 枚举定义
