# Manifest Engine SDD — Phase 1a

> **创建日期**: 2026-07-13  
> **目的**: 为 Phase 1a manifest.yaml 解析与验证引擎提供编码前的完整接口定义。  
> **前置阅读**: D1.5（manifest 规范）, D2（声明系统）, plugin-framework-sdd.md §3  
> **责任人**: Person A

---

## 1. 概述

Manifest Engine 负责解析和验证插件的 `manifest.yaml` 文件。它是插件发现流程（`PluginManager.discover()`）的第一步——在插件被加载前，其 manifest 必须通过所有验证检查。

### 设计原则

- **声明即契约**: manifest.yaml 是插件的唯一真实来源，解析结果不可变
- **Zod 验证优先**: 所有字段通过 Zod schema 校验，类型自动推导
- **失败快速明确**: 验证错误提供精确的位置和原因，方便开发者定位
- **循环依赖检测**: 在解析阶段就检测依赖图中的循环，避免运行时死锁
- **Phase 1a 字段子集**: 仅验证 Phase 1a 所需字段，Phase 1b/2 字段预留但标记为可选

---

## 2. Public API Surface

### 2.1 ManifestEngine

```typescript
// packages/manifest-engine/src/engine.ts

interface ManifestEngine {
  /**
   * 解析单个插件的 manifest.yaml 文件
   *
   * 流程:
   * 1. 读取 manifest.yaml 文件内容
   * 2. YAML 解析为原始对象
   * 3. Zod schema 验证所有字段
   * 4. 返回不可变的 Manifest 对象
   *
   * @param manifestPath — manifest.yaml 文件的绝对路径
   * @returns Manifest — 验证通过的不可变对象
   * @throws ManifestParseError — YAML 格式错误
   * @throws ManifestValidationError — 字段验证失败（包含所有错误的聚合列表）
   */
  parse(manifestPath: string): Promise<Manifest>

  /**
   * 批量解析并验证依赖图
   *
   * 解析多个插件的 manifest，检查依赖关系:
   * - 所有依赖是否存在（在已发现的插件中）
   * - 是否存在循环依赖
   * - SemVer 兼容性（Phase 1a: exact match only）
   *
   * @param manifestPaths — manifest.yaml 文件路径列表
   * @returns 按依赖拓扑排序的 Manifest 列表
   * @throws ManifestValidationError — 循环依赖或缺失依赖
   */
  parseAll(manifestPaths: string[]): Promise<Manifest[]>

  /**
   * 仅验证 manifest 内容（不生成 Manifest 对象，用于 CI 预检）
   *
   * @param content — manifest.yaml 文件原始内容
   * @returns ValidationResult — { valid, errors[] }
   */
  validate(content: string): ValidationResult
}
```

### 2.2 Manifest（解析结果）

```typescript
interface Manifest {
  // === 基础元数据 ===
  readonly name: string              // @audebase/plugin-{name}
  readonly version: string           // SemVer 格式 1.0.0
  readonly display_name: string      // 显示名称
  readonly description?: string      // 插件描述（可选）
  readonly category?: 'SYSTEM' | 'business' | 'integration' | 'theme'

  // === 许可 ===
  readonly license: string           // 默认 "Apache-2.0"

  // === 插件实现 ===
  readonly application: {
    readonly entry: string           // 入口文件路径（相对于 manifest 目录）
    readonly author?: string
  }

  // === 依赖 ===
  readonly dependencies: readonly string[]  // 插件包名列表

  // === 资源 ===
  readonly assets: readonly string[] // Phase 1a 通常为空

  // === 运行时配置 ===
  readonly runtime: {
    readonly mode: 'inline'          // Phase 1a 仅支持 inline
    readonly partition: string       // SYSTEM | oa | erp | mes | isolated
    readonly crash_policy: 'restart' | 'ignore'
  }

  // === 安全 ===
  readonly security: {
    readonly db_namespace?: string   // Phase 1b+
  }

  // === 数据模型（Phase 1a 骨架） ===
  readonly models: readonly Array<{
    readonly name: string
    readonly table: string
  }>

  // === 权限声明 ===
  readonly permissions: readonly Array<{
    readonly action: string
    readonly resource: string
    readonly description?: string
  }>

  // === 国际化 ===
  readonly locale?: {
    readonly path: string            // 翻译文件目录
  }

  // === 初始化数据 ===
  readonly data: readonly string[]   // SQL 种子文件路径列表

  // === 生命周期配置 ===
  readonly lifecycle?: {
    readonly auto_install?: boolean  // 默认 false
  }
}
```

### 2.3 ValidationResult

```typescript
interface ValidationResult {
  /** 是否通过验证 */
  valid: boolean

  /** 所有验证错误（空数组 = 通过） */
  errors: ValidationError[]
}

interface ValidationError {
  /** 错误路径（点分路径，如 "runtime.mode"） */
  path: string

  /** 错误消息 */
  message: string

  /** 错误代码 */
  code: 'MISSING_FIELD' | 'INVALID_FORMAT' | 'INVALID_VALUE' | 'UNKNOWN_FIELD'
}
```

---

## 3. Zod Schema（完整 Phase 1a 字段验证）

```typescript
// packages/manifest-engine/src/schema.ts

import { z } from 'zod'

const SEMVER_REGEX = /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/
const PLUGIN_NAME_REGEX = /^@[a-z][a-z0-9-]*\/plugin-[\w-]+$/

export const manifestSchema = z.object({
  // === 基础元数据（全部必需） ===
  name: z.string()
    .regex(PLUGIN_NAME_REGEX, '插件名必须符合 @{scope}/plugin-{name} 格式')
    .describe('插件包名'),
  version: z.string()
    .regex(SEMVER_REGEX, '版本号必须符合 SemVer 格式 (1.0.0)')
    .describe('SemVer 版本'),
  display_name: z.string()
    .min(1, '显示名称不能为空')
    .max(255, '显示名称最多 255 个字符')
    .describe('显示名称'),
  description: z.string()
    .optional()
    .describe('插件描述'),
  category: z.enum(['SYSTEM', 'business', 'integration', 'theme'])
    .optional()
    .describe('插件分类'),

  // === 许可 ===
  license: z.string()
    .default('Apache-2.0')
    .describe('许可协议'),

  // === 插件实现 ===
  application: z.object({
    entry: z.string()
      .min(1, '入口文件路径不能为空')
      .describe('入口文件路径（相对于 manifest 目录）'),
    author: z.string()
      .optional()
      .describe('作者'),
  }),

  // === 依赖 ===
  dependencies: z.array(
    z.string().regex(PLUGIN_NAME_REGEX, '依赖项必须是有效的插件包名')
  ).default([]).describe('依赖列表'),

  // === 资源 ===
  assets: z.array(z.string())
    .default([])
    .describe('资源文件列表'),

  // === 运行时配置 ===
  runtime: z.object({
    mode: z.literal('inline', {
      errorMap: () => ({ message: 'Phase 1a 仅支持 mode="inline"' })
    }).describe('运行时模式'),
    partition: z.string()
      .min(1, 'partition 不能为空')
      .describe('信任分组 (SYSTEM | oa | erp | mes | isolated)'),
    crash_policy: z.enum(['restart', 'ignore'])
      .default('restart')
      .describe('崩溃策略'),
  }),

  // === 安全 ===
  security: z.object({
    db_namespace: z.string().optional()
      .describe('数据库命名空间 (Phase 1b+)'),
  }).default({}).describe('安全配置'),

  // === 数据模型 ===
  models: z.array(z.object({
    name: z.string()
      .min(1, 'Collection 名称不能为空')
      .regex(/^[a-z][a-z0-9_]*$/, 'Collection 名必须为 snake_case'),
    table: z.string()
      .min(1, '表名不能为空')
      .regex(/^[a-z][a-z0-9_]*$/, '表名必须为 snake_case'),
  })).default([]).describe('数据模型声明'),

  // === 权限声明 ===
  permissions: z.array(z.object({
    action: z.string()
      .min(1)
      .regex(/^[a-z][a-z0-9_:*]+$/, 'action 格式: resource:verb'),
    resource: z.string()
      .min(1)
      .regex(/^[a-z][a-z0-9_-]+$/, 'resource 必须为 kebab-case'),
    description: z.string().optional(),
  })).default([]).describe('权限声明'),

  // === 国际化 ===
  locale: z.object({
    path: z.string()
      .min(1)
      .describe('翻译文件目录路径'),
  }).optional().describe('国际化配置'),

  // === 初始化数据 ===
  data: z.array(z.string())
    .default([])
    .describe('SQL 种子文件路径列表'),

  // === 生命周期配置 ===
  lifecycle: z.object({
    auto_install: z.boolean()
      .default(false)
      .describe('是否自动安装（Phase 1a: 仅 plugin-core 使用）'),
  }).optional().describe('生命周期配置'),
})

// 从 schema 推导完整类型
export type Manifest = z.infer<typeof manifestSchema>
```

---

## 4. 依赖解析算法

### 4.1 拓扑排序（Kahn 算法）

```typescript
/**
 * 对插件列表按依赖关系进行拓扑排序
 *
 * 流程:
 * 1. 构建邻接表（pluginName → deps[]）
 * 2. 计算每个节点的入度
 * 3. Kahn 算法排序
 * 4. plugin-core（dependencies: []）始终排第一
 * 5. 循环依赖检测（如有剩余节点未处理 → 存在循环）
 *
 * @param manifests — 已解析的 manifest 列表
 * @returns 按依赖排序的 manifest 列表
 * @throws ManifestValidationError — 存在循环依赖
 */
function resolveDependencyOrder(manifests: Manifest[]): Manifest[] {
  const nameMap = new Map(manifests.map(m => [m.name, m]))
  const inDegree = new Map<string, number>()
  const adjacency = new Map<string, string[]>()

  // 初始化图
  for (const m of manifests) {
    if (!inDegree.has(m.name)) inDegree.set(m.name, 0)
    adjacency.set(m.name, [])

    for (const dep of m.dependencies) {
      if (!nameMap.has(dep)) {
        // 缺失依赖 — 后续阶段的插件可以不存在
        continue
      }
      adjacency.get(dep)!.push(m.name)
      inDegree.set(m.name, (inDegree.get(m.name) || 0) + 1)
    }
  }

  // 确保 plugin-core 入度始终为 0（没有插件可以依赖它之前的加载顺序）
  if (inDegree.has('@audebase/plugin-core')) {
    inDegree.set('@audebase/plugin-core', 0)
  }

  // Kahn 算法
  const queue: Manifest[] = []
  for (const m of manifests) {
    if (inDegree.get(m.name) === 0) queue.push(m)
  }

  const result: Manifest[] = []
  while (queue.length > 0) {
    const current = queue.shift()!
    result.push(current)

    for (const neighbor of (adjacency.get(current.name) || [])) {
      const newDegree = (inDegree.get(neighbor) || 1) - 1
      inDegree.set(neighbor, newDegree)
      if (newDegree === 0) {
        queue.push(nameMap.get(neighbor)!)
      }
    }
  }

  // 循环依赖检测
  if (result.length !== manifests.length) {
    const unprocessed = manifests
      .filter(m => !result.includes(m))
      .map(m => m.name)
    throw new ManifestValidationError(
      `检测到循环依赖，涉及插件: ${unprocessed.join(', ')}`,
      unprocessed,
      'CIRCULAR_DEPENDENCY'
    )
  }

  return result
}
```

### 4.2 SemVer 兼容性检查（Phase 1a）

```typescript
/**
 * Phase 1a: 仅精确版本匹配
 * Phase 1b+: 支持 semver range（^1.0.0, ~1.2.3）
 */
function checkDependencyVersion(
  pluginName: string,
  requiredVersion: string,
  availableVersion: string
): boolean {
  // Phase 1a: exact match only
  return requiredVersion === availableVersion
}
```

---

## 5. 错误处理

### 5.1 错误类型

```typescript
import { ErrorCode, UserError } from '@audebase/shared-types'

class ManifestParseError extends UserError {
  constructor(
    message: string,
    public readonly manifestPath: string,
    public readonly yamlError?: string
  ) {
    super(ErrorCode.PLUGIN_MANIFEST_INVALID, `[${manifestPath}] YAML 解析失败: ${message}`)
    this.name = 'ManifestParseError'
  }
}

class ManifestValidationError extends UserError {
  constructor(
    message: string,
    public readonly plugins: string[],
    public readonly errorCode: ErrorCode  // PLUGIN_CIRCULAR_DEPENDENCY | PLUGIN_DEPENDENCY_MISSING | PLUGIN_MANIFEST_INVALID
  ) {
    super(errorCode, message)
    this.name = 'ManifestValidationError'
  }
}

// 聚合多个字段验证错误
interface ManifestFieldErrors {
  pluginName: string
  errors: Array<{
    path: string
    message: string
    code: string
  }>
}
```

### 5.2 错误传播约定

- **YAML 解析失败**: 抛出 `ManifestParseError` → 该插件被跳过，不影响其他插件发现
- **Zod 字段验证失败**: 返回 `ValidationResult`（含所有字段的聚合错误列表）→ 该插件被跳过，不影响其他插件发现
- **循环依赖**: 抛出 `ManifestValidationError` → 涉及的所有插件被跳过，记录 audit_log
- **缺失依赖**: 如缺失的依赖在已发现插件列表中不存在 → 该插件的 `dependencies` 数组保留该条目，但不阻塞加载（依赖可能在后续阶段安装）
- **SemVer 不匹配**: Phase 1a 精确匹配失败 → 记录警告日志，不阻塞加载

### 5.3 错误消息示例

```
[packages/plugin-rbac/manifest.yaml] 验证失败:
  - name: 插件名必须符合 @{scope}/plugin-{name} 格式
  - version: 版本号 "1" 不是合法的 SemVer 格式
  - runtime.mode: Phase 1a 仅支持 mode="inline"，当前值: "process"
  - application.entry: 入口文件路径不能为空
```

---

## 6. 测试边界

| 测试层级 | 范围 | Mock 策略 | 文件位置 |
|---------|------|----------|---------|
| 单元测试 | Zod schema 验证、ManifestEngine.parse()、resolveDependencyOrder() | mock 文件系统（memfs） | `src/__tests__/unit/` |
| 集成测试 | 真实 manifest.yaml 文件解析 | 真实文件系统 + 测试固定件目录 | `src/__tests__/integration/` |
| CI 预检 | `aude manifest:validate --all` | 真实文件系统 | CI pipeline |

### 最小测试用例集

1. **有效 manifest**: 含全部必填字段 + 若干可选字段 → parse() 返回 Manifest 对象，所有字段正确解析
2. **缺失必填字段**: 缺失 `name` / `version` / `application.entry` → ValidationResult.valid = false，errors 列出所有缺失字段
3. **格式错误**: `version: "v1"`（非 SemVer）→ `INVALID_FORMAT` 错误
4. **mode 错误**: `runtime.mode: "process"`（Phase 1a 仅 inline）→ `INVALID_VALUE` 错误
5. **plugin name 错误**: `name: "my-plugin"`（无 @scope 前缀）→ `INVALID_FORMAT` 错误
6. **循环依赖**: plugin-a 依赖 plugin-b，plugin-b 依赖 plugin-a → ManifestValidationError
7. **线性依赖排序**: plugin-c → plugin-b → plugin-a → 验证返回顺序为 [a, b, c]
8. **零依赖 plugin-core 排首位**: 多插件列表中 plugin-core 始终是结果数组的第一个元素
9. **SemVer 边界**: `0.0.0`, `999.999.999`, `1.0.0-alpha.1`, `1.0.0+build.123` 均通过验证
10. **重复字段**: YAML 中重复定义 `name` → 解析错误（YAML 解析器处理）

### 测试固定件目录结构

```
packages/manifest-engine/src/__tests__/fixtures/
├── valid/
│   ├── minimal-manifest.yaml        # 最少字段
│   ├── full-manifest.yaml           # 所有字段
│   ├── plugin-core-manifest.yaml    # 真实 plugin-core manifest
│   └── plugin-rbac-manifest.yaml    # 真实 RBAC 插件 manifest
├── invalid/
│   ├── missing-name.yaml
│   ├── missing-version.yaml
│   ├── invalid-semver.yaml
│   ├── invalid-mode.yaml
│   ├── invalid-plugin-name.yaml
│   ├── empty-entry.yaml
│   └── bad-yaml.yaml               # 语法错误
└── deps/
    ├── linear-a.yaml                # 无依赖
    ├── linear-b.yaml                # 依赖 a
    ├── linear-c.yaml                # 依赖 b
    ├── cycle-a.yaml                 # 依赖 cycle-b
    ├── cycle-b.yaml                 # 依赖 cycle-a
    └── missing-dep.yaml             # 依赖不存在的插件
```

---

## 7. 实现约束

- **不可变输出**: `Manifest` 对象的所有属性均为 `readonly`，解析后不可修改
- **Zod 优先**: 所有字段验证通过 Zod schema，不手写 if/else 校验逻辑
- **错误聚合**: 一次 parse() 调用返回所有字段错误（非遇错即停），方便开发者一次修复
- **无文件绑定**: `ManifestEngine.parse()` 返回的 `Manifest` 对象不持有 `manifestPath` 引用，由调用方管理
- **类型安全**: 禁止 `as any` / `@ts-ignore`，所有公共 API 使用显式类型注解
- **YAML 库**: 使用 `js-yaml` 解析（与 Fastify 生态一致），不使用 `yaml`（功能更多但体积更大）
- **小文件原则**: schema.ts（Zod 定义）、engine.ts（解析逻辑）、resolver.ts（依赖排序）各自独立，单文件不超过 250 行

---

## 8. 与 Plugin Framework 的集成

```typescript
// PluginManager.discover() 中使用 ManifestEngine
async function discover(): Promise<PluginDescriptor[]> {
  const manifestPaths = await scanPluginDirectories()
  const manifests = await manifestEngine.parseAll(manifestPaths)

  // 转换为 PluginDescriptor
  return manifests.map(m => ({
    name: m.name,
    version: m.version,
    displayName: m.display_name,
    partition: m.runtime.partition,
    mode: m.runtime.mode,
    dependencies: [...m.dependencies],
    manifestPath: `${m.name}/manifest.yaml`,  // 由调用方补全
    entryPath: m.application.entry,
    status: 'discovered',
  }))
}
```

---

## 9. Open Questions (Phase 1a 期间解决)

- [ ] 是否需要 `manifest.lock` 锁定文件？类比 package-lock.json 确保依赖版本一致性
- [ ] plugin name 格式是否需要放宽？当前严格 `@scope/plugin-{name}`，是否允许 `plugin-{name}`（无 scope）？
- [ ] manifest.yaml 的注释保留策略：解析后是否保留原始注释（用于 manifest 编辑 UI）？
- [ ] Phase 1b 字段（exports, provides, cron）在 Phase 1a 的 schema 中应标记为 `optional` 还是完全忽略？

---

## 10. 变更记录

| 版本 | 日期 | 变更内容 |
|------|------|---------|
| v0.1.0 | 2026-07-13 | 初始版本 |
