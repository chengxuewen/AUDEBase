# Plugin Framework SDD — Phase 1a

> **创建日期**: 2026-07-13  
> **目的**: 为 Phase 1a #6 模块（插件框架）提供编码前的完整接口定义。  
> **前置阅读**: D1.1, D1.2, D1.4, D1.5, plugin-framework.md  
> **责任人**: Person B

---

## 1. Public API Surface

### 1.1 PluginManager

```typescript
// packages/core/src/plugin-manager.ts

interface PluginManager {
  /**
   * 发现所有可用插件
   * 
   * 扫描顺序:
   * 1. packages/ 目录（pnpm workspace 内）→ inline 模式
   * 2. plugins/ 目录（外部插件）→ inline 模式
   * 
   * 每个目录需满足: 包含 manifest.yaml + package.json
   * 返回按依赖拓扑排序的插件列表
   */
  discover(): Promise<PluginDescriptor[]>

  /**
   * 安装插件
   * 1. 执行依赖解析（semver 兼容性检查）
   * 2. 写入 modules 表（status='installed'）
   * 3. 触发 afterAdd → beforeLoad → load → install 生命周期
   * 4. 写入 audit_log（action='lifecycle:install'）
   */
  install(pluginName: string): Promise<void>

  /**
   * 启用已安装的插件
   * 1. 检查前置依赖已安装且 enabled
   * 2. 触发 afterEnable 生命周期
   * 3. 写入 audit_log（action='lifecycle:enable'）
   */
  enable(pluginName: string): Promise<void>

  /**
   * 禁用插件
   * 1. 触发 afterDisable 生命周期
   * 2. 卸载插件的 HTTP 路由（调用 Fastify route removal）
   * 3. 写入 audit_log（action='lifecycle:disable'）
   * 
   * 注意: 被其他已启用插件依赖的插件不可禁用。返回 409 Conflict。
   */
  disable(pluginName: string): Promise<void>

  /**
   * 卸载插件
   * 1. 如果插件为 enabled 状态，先执行 disable
   * 2. 触发 preUninstall 生命周期
   * 3. 写入 audit_log（action='lifecycle:uninstall'）
   */
  uninstall(pluginName: string): Promise<void>

  /**
   * 检查插件是否已加载
   */
  isLoaded(pluginName: string): boolean

  /**
   * 获取已加载的 PluginHost 实例
   */
  getPlugin(pluginName: string): PluginHost | undefined
}
```

### 1.2 PluginDescriptor

```typescript
interface PluginDescriptor {
  /** 插件包名，如 @audebase/plugin-core */
  name: string
  /** SemVer 版本 */
  version: string
  /** 显示名称 */
  displayName: string
  /** 四层信任分组: SYSTEM | {domain} | isolated */
  partition: 'SYSTEM' | string
  /** 运行时模式: inline (Phase 1a) */
  mode: 'inline'
  /** 依赖列表 */
  dependencies: string[]
  /** manifest.yaml 文件路径 */
  manifestPath: string
  /** 入口文件路径（相对于 manifestPath） */
  entryPath: string
  /** 状态: discovered | installed | loaded | enabled | disabled | migration_failed */
  status: PluginStatus
}
```

### 1.3 PluginHost (Phase 1a — Inline)

```typescript
interface PluginHost {
  /** 插件名 */
  readonly name: string
  /** 插件状态 */
  readonly status: PluginStatus
  /** 插件 manifest */
  readonly manifest: Manifest

  // === 生命周期钩子 ===
  /** 插件被发现时调用（注册阶段） */
  afterAdd?(): Promise<void>
  /** 插件加载前调用（注册数据表、中间件、i18n） */
  beforeLoad?(): Promise<void>
  /** 加载插件代码（require() 入口文件） */
  load(): Promise<void>
  /** 安装时调用（创建 DB 表、写入配置） */
  install?(): Promise<void>
  /** 启用后调用（启动定时任务、注册事件监听） */
  afterEnable?(): Promise<void>
  /** 禁用后调用（注销事件、停止定时任务） */
  afterDisable?(): Promise<void>
  /** 卸载前调用（提醒用户备份数据） */
  preUninstall?(): Promise<void>

  // === Phase 1a Context 注入 ===
  /** 数据库访问 */
  readonly db: DrizzleDB
  /** 翻译函数 */
  t(key: string, params?: Record<string, string>): string
  /** Pino logger instance. TODO: import from @audebase/shared-types */
  logger: PinoLogger
  /** Core config manager. TODO: import from @audebase/shared-types */
  config: ConfigManager
}

type PluginStatus = 'discovered' | 'installed' | 'loaded' | 'enabled' | 'disabled' | 'migration_failed'
```

### 1.4 PluginHost Inline Mock 约束（D1.2）

Phase 1a InlinePluginHost 必须通过以下 5 项断言：

```typescript
// 约束 1: 所有方法调用返回 Promise
async function testAsyncSemantics() {
  const host = createPluginHost(mockPlugin)
  const result = await host.load()
  // 验证: result 是 Promise 解析值，不是同步返回
}

// 约束 2: 所有参数经过 JSON.stringify → JSON.parse 序列化
async function testJsonSerialization() {
  const input = { nested: { date: new Date('2026-01-01') }, fn: undefined }
  const serialized = JSON.parse(JSON.stringify(input))
  // 验证: host.install(serialized) 不会传递原始引用或函数
}

// 约束 3: 所有返回值经过 JSON.stringify → JSON.parse 反序列化
async function testJsonDeserialization() {
  const host = createPluginHost(mockPlugin)
  const result = await host.load()
  // 验证: JSON.stringify(result) 不会抛出 Circular reference 错误
}

// 约束 4: 30s 超时
async function testTimeout() {
  const host = createPluginHost(slowPlugin)
  await expect(host.load()).rejects.toThrow('Plugin lifecycle timeout after 30s')
}

// 约束 5: 1-5ms 延迟注入
async function testDelayInjection() {
  const host = createPluginHost(mockPlugin, { mockDelay: 3 })
  const start = Date.now()
  await host.load()
  const elapsed = Date.now() - start
  // 验证: elapsed 在 3-5ms 范围内（允许 ±2ms 误差）
}
```

---

## 2. 生命周期状态机

### 2.1 Phase 1a 状态转换

```
                    discover()
  [不存在] ──────────────────────────→ discovered
                                           │
                                    install() + init DB
                                           │
                                           ▼
                 ┌─────────────── installed ───────────────┐
                 │                     │                    │
            enable()              disable()          uninstall()
                 │                     │                    │
                 ▼                     ▼                    ▼
              enabled  ────────── disabled             [已移除]
                 │                     │
            disable()              enable()
                 │                     │
                 └─────────────────────┘

  discover() 失败:  记录错误 → 跳过该插件
  install() 失败:   标记 db status='migration_failed' → 跳过 → 不阻塞系统启动（D1.7）
  enable() 失败:    标记 disabled → 记录错误 → 不阻塞其他插件
  disable() 失败:   保持 enabled → 记录错误 → 不阻塞其他插件
```

### 2.2 状态转换规则

| 当前状态 | 操作 | 新状态 | 条件 | 副作用 |
|---------|------|--------|------|--------|
| (不存在) | discover | discovered | manifest.yaml 存在 | 写入 modules 表 |
| discovered | install | installed | 依赖插件已 installed | 执行 afterAdd→beforeLoad→load→install |
| installed | enable | enabled | 无 | 执行 afterEnable |
| enabled | disable | disabled | 无其他启用插件依赖它 | 执行 afterDisable |
| disabled | enable | enabled | 无 | 执行 afterEnable |
| disabled | uninstall | (移除) | 无其他插件依赖它 | 执行 preUninstall |
| * | (迁移失败) | migration_failed | 迁移执行失败 | 记录 audit_log + logger.error |

---

## 3. Manifest Validation (Zod Schema)

基于 D1.5 定义，Phase 1a 必须验证的字段：

```typescript
// packages/core/src/manifest-schema.ts

import { z } from 'zod'

export const manifestSchema = z.object({
  // === 基础元数据 ===
  name: z.string().regex(/^@[a-z][a-z0-9-]*\/plugin-[\w-]+$/, '插件名必须以 @scope/plugin- 开头'),
  version: z.string().regex(/^\d+\.\d+\.\d+(-[\w.]+)?$/, 'SemVer 格式'),
  display_name: z.string().min(1).max(255),
  description: z.string().optional(),
  category: z.enum(['SYSTEM', 'business', 'integration', 'theme']).optional(),
  
  // === 许可 ===
  license: z.string().default('Apache-2.0'),
  
  // === 插件实现 ===
  application: z.object({
    entry: z.string(),           // 入口文件路径
    author: z.string().optional(),
  }),
  
  // === 依赖 ===
  dependencies: z.array(z.string()).default([]),
  
  // === 资源 ===
  assets: z.array(z.string()).default([]),
  
  // === 运行时配置 ===
  runtime: z.object({
    mode: z.literal('inline'),   // Phase 1a 仅支持 inline
    partition: z.string(),       // SYSTEM | oa | erp | mes | isolated
    crash_policy: z.enum(['restart', 'ignore']).default('restart'),
  }),
  
  // === 安全 ===
  security: z.object({
    db_namespace: z.string().optional(),  // Phase 1b+
  }).default({}),
  
  // === 数据模型（Phase 1a 骨架） ===
  models: z.array(z.object({
    name: z.string(),
    table: z.string(),
  })).default([]),
  
  // === 权限声明 ===
  permissions: z.array(z.object({
    action: z.string(),
    resource: z.string(),
    description: z.string().optional(),
  })).default([]),
  
  // === 国际化 ===
  locale: z.object({
    path: z.string(),            // 翻译文件目录
  }).optional(),
  
  // === 初始化数据（Phase 1a: plugin-core 专用） ===
  data: z.array(z.string()).default([]),
  
  // === 定时任务（Phase 1b） ===
  cron: z.array(z.object({
    name: z.string(),
    schedule: z.string(),        // cron 表达式
    handler: z.string(),         // 处理函数名
  })).default([]),
})

export type Manifest = z.infer<typeof manifestSchema>
```

### 依赖解析算法

```typescript
/**
 * 拓扑排序解决插件加载顺序
 * 使用 Kahn 算法
 * 
 * @throws ManifestValidationError 循环依赖或缺失依赖
 */
async function resolveDependencyOrder(
  plugins: PluginDescriptor[]
): Promise<PluginDescriptor[]> {
  // 1. 构建依赖图（邻接表）
  // 2. Kahn 算法拓扑排序
  // 3. semver 兼容性校验（Phase 1a: 仅 exact match；Phase 1b: semver range）
  // 4. plugin-core 始终排第一（D1.6: dependencies: []）
  // 5. 循环依赖 → 拒绝加载，抛出 ManifestValidationError
```typescript
import { ErrorCode, UserError } from '@audebase/shared-types'

class ManifestValidationError extends UserError {
  constructor(
    message: string,
    public readonly pluginName: string,
    public readonly errorCode: ErrorCode
  ) {
    super(errorCode, `[${pluginName}] ${message}`)
    this.name = 'ManifestValidationError'
  }
}
```

---

## 4. Error Handling Contract

所有 PluginManager 公共方法遵循统一的错误模式：

```typescript
// 错误类型映射
type PluginError =
  | { type: 'NOT_FOUND'; plugin: string }
  | { type: 'ALREADY_INSTALLED'; plugin: string }
  | { type: 'DEPENDENCY_MISSING'; plugin: string; missing: string[] }
  | { type: 'CIRCULAR_DEPENDENCY'; plugins: string[] }
  | { type: 'LIFECYCLE_ERROR'; plugin: string; phase: string; cause: Error }
  | { type: 'MIGRATION_FAILED'; plugin: string; version: string; cause: Error }
  | { type: 'MANIFEST_INVALID'; plugin: string; errors: ZodError }
```

### 错误传播约定

- 单个插件生命周期失败 → 不阻塞其他插件加载
- migration_failed → 跳过该插件，系统继续启动
- Manifest 验证失败 → 拒绝安装该插件，不影响已加载插件
- 所有错误写入 audit_log（action='error', resource_type='plugin'）

---

## 5. Test Boundaries

| 测试层级 | 范围 | Mock 策略 | 文件位置 |
|---------|------|----------|---------|
| 单元测试 | Manifest 解析、依赖排序、状态转换 | mock 所有外部依赖 | `src/__tests__/unit/` |
| 集成测试 | PluginManager + 真实 Drizzle | 真实 PG（事务回滚）+ mock Redis | `src/__tests__/integration/` |
| E2E 测试 | 完整 install→enable→disable 流程 | 真实 PG + 真实 Redis | `packages/admin-ui/__e2e__/plugins.e2e.ts` |

### 最小测试用例集

1. `manifestSchema.parse()` 验证：合法 manifest、非法 manifest、缺失字段、格式错误
2. `resolveDependencyOrder()`: 线性依赖、多依赖、循环依赖报错、缺失依赖报错
3. 状态转换: discovered→installed→enabled→disabled→uninstall 完整链
4. 错误态: migration_failed 不阻塞启动
5. InlinePluginHost 5 项 mock 约束断言

---

## 6. 与其他模块的交互

| 调用方 | 接口 | 调用方式 |
|--------|------|---------|
| #1 内核骨架 | `PluginManager.discover()` | 启动时 Core 调用 |
| #4 plugin-core | `PluginManager.install()` | Core bootstrap 流程 |
| #7 JWT 认证 | (无直接依赖) | 插件框架不处理认证 |
| #8 RBAC | `manifest.permissions` | 解析 manifest 时注册权限项 |
| #10 审计日志 | `PluginManager.*` | 每次状态变更写入 audit_log |
| #12 管理 UI | `PluginManager` 全部公共 API | REST API `/api/plugins/*` 代理 |

### 6.2 PluginManager 方法与 HTTP 端点映射

PluginManager 公共方法通过 REST API `/api/plugins/*` 暴露给 Admin UI：

| PluginManager 方法 | HTTP 方法 | 端点 | 说明 |
|---------------------|-----------|------|------|
| `discover()` | `GET` | `/api/plugins` | 列出所有已发现/已安装插件 |
| `install(name)` | `POST` | `/api/plugins/{name}/install` | 安装插件 |
| `enable(name)` | `POST` | `/api/plugins/{name}/enable` | 启用插件 |
| `disable(name)` | `POST` | `/api/plugins/{name}/disable` | 禁用插件 |
| `uninstall(name)` | `DELETE` | `/api/plugins/{name}` | 卸载插件（先 disable 再 preUninstall）|
| `isLoaded(name)` | - | 内部方法，不暴露 HTTP | - |
| `getPlugin(name)` | - | 内部方法，不暴露 HTTP | - |

详见 [api-specification.md](api-specification.md) 端点 #13-#15, #22。

---

## 7. Open Questions (Phase 1a 期间解决)

- [ ] `discover()` 是否支持 npm registry 发现（当前仅文件系统）
- [ ] 插件间类型共享：shared-types 包如何被插件引用
- [ ] 插件配置热重载：修改 manifest 后是否需重启（Phase 1a 需要重启）
- [ ] 插件日志注入：如何将插件 logger 聚合到 Core pino stream

---

## 8. 变更记录

| 版本 | 日期 | 变更内容 |
|------|------|---------|
| v0.1.0 | 2026-07-13 | 初始版本 |
