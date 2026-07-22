# Manifest Engine TDD 测试策略 — Phase 1a

> **创建日期**: 2026-07-13  
> **目的**: 为 Phase 1a manifest.yaml 解析与验证提供完整的 TDD 测试策略与用例设计。  
> **背景**: manifest.yaml 是插件框架的入口契约（D1.5），manifest-engine 是跨模块共享的基础设施——PluginManager、MigrationEngine、RBAC、管理 UI 均依赖 manifest 解析结果。  
> **前置阅读**: D1.5, plugin-framework-sdd.md §3, test-seed-strategy.md  
> **覆盖率目标**: 80% lines（核心路径 manifestSchema.parse 强制 80%）

---

## 1. 测试金字塔

```
         ┌──────────────────────┐
         │  E2E (5%)             │  Playwright: 管理 UI 加载插件列表验证解析的 manifest 字段显示正确
         │  packages/admin-ui/   │
         ├──────────────────────┤
         │  集成测试 (30%)        │  真实 PG + 真实 manifest.yaml 文件（临时目录）
         │  packages/core/       │  discover() → parse manifest → 写入 modules 表
         │  __tests__/integration│
         ├──────────────────────┤
         │  单元测试 (65%)        │  Vitest: Zod schema 全覆盖、字段默认值、
         │  packages/core/       │  版本比较、依赖声明校验、YAML 解析容错
         │  __tests__/unit/      │  （与 plugin-framework-tdd.md 的 manifest-schema 测试互补）
         └──────────────────────┘
```

## 2. 测试边界

| 测试层级 | 范围 | Mock 策略 | 文件位置 |
|---------|------|----------|---------|
| 单元测试 | Zod schema 覆盖、YAML 解析、默认值、跨字段约束 | 无外部依赖（纯逻辑） | `packages/core/src/__tests__/unit/` |
| 集成测试 | 真实 manifest.yaml 文件 → parse → modules 表 | 真实 PG + 临时目录 | `packages/core/src/__tests__/integration/` |
| 契约测试 | modules 表字段与 manifest 字段一致性 | Fastify.inject() | `packages/core/src/__tests__/contracts/` |

---

## 3. 单元测试设计

### 3.1 完整字段覆盖矩阵

**测试文件**: `packages/core/src/__tests__/unit/manifest-full-coverage.test.ts`

**策略**: 对 manifestSchema 的每个字段编写正向 + 边界 + 非法值测试。

```typescript
import { describe, test, expect } from 'vitest'
import { manifestSchema } from '../../manifest-schema'

// 合法全量 manifest 作为基线
const FULL_VALID_MANIFEST = {
  name: '@audebase/plugin-test',
  version: '1.0.0',
  display_name: '测试插件',
  description: '用于测试的示例插件',
  category: 'business' as const,
  license: 'Apache-2.0',
  application: {
    entry: 'src/index.ts',
    author: 'aude-team',
  },
  dependencies: ['@audebase/plugin-rbac'],
  assets: ['dist/admin.js', 'dist/admin.css'],
  runtime: {
    mode: 'inline' as const,
    partition: 'SYSTEM',
    crash_policy: 'restart' as const,
  },
  security: { db_namespace: 'test_ns' },
  models: [{ name: 'order', table: 'orders' }],
  permissions: [
    { action: 'create', resource: 'order', description: '创建订单' },
    { action: 'read', resource: 'order' },
  ],
  locale: { path: 'locale' },
  data: ['seeds/init.sql'],
  cron: [{ name: 'cleanup', schedule: '0 3 * * *', handler: 'cleanupHandler' }],
}

describe('manifestSchema — 全字段覆盖', () => {
  // ============================================================
  // 基础元数据
  // ============================================================

  describe('name', () => {
    test('合法 name: @scope/plugin-name', () => {
      const validNames = [
        '@audebase/plugin-core',
        '@audebase/plugin-rbac',
        '@my/plugin-hello',
        '@a/plugin-b',
      ]
      for (const name of validNames) {
        const manifest = { ...FULL_VALID_MANIFEST, name }
        expect(manifestSchema.safeParse(manifest).success).toBe(true)
      }
    })

    test('非法 name: 无 scope', () => {
      const manifest = { ...FULL_VALID_MANIFEST, name: 'my-plugin' }
      expect(manifestSchema.safeParse(manifest).success).toBe(false)
    })

    test('非法 name: 空字符串', () => {
      const manifest = { ...FULL_VALID_MANIFEST, name: '' }
      expect(manifestSchema.safeParse(manifest).success).toBe(false)
    })

    test('非法 name: 大写字母', () => {
      const manifest = { ...FULL_VALID_MANIFEST, name: '@Audebase/Plugin-Test' }
      expect(manifestSchema.safeParse(manifest).success).toBe(false)
    })
  })

  describe('version', () => {
    test('合法 SemVer', () => {
      const validVersions = ['0.1.0', '1.0.0', '2.3.4', '1.0.0-alpha.1', '1.0.0-beta.2']
      for (const version of validVersions) {
        const manifest = { ...FULL_VALID_MANIFEST, version }
        expect(manifestSchema.safeParse(manifest).success).toBe(true)
      }
    })

    test('非法 version: 缺少 patch', () => {
      const manifest = { ...FULL_VALID_MANIFEST, version: '1.0' }
      expect(manifestSchema.safeParse(manifest).success).toBe(false)
    })

    test('非法 version: v 前缀', () => {
      const manifest = { ...FULL_VALID_MANIFEST, version: 'v1.0.0' }
      expect(manifestSchema.safeParse(manifest).success).toBe(false)
    })
  })

  describe('display_name', () => {
    test('应在 1-255 字符范围内', () => {
      const manifest = { ...FULL_VALID_MANIFEST, display_name: 'A' }
      expect(manifestSchema.safeParse(manifest).success).toBe(true)

      const longName = { ...FULL_VALID_MANIFEST, display_name: 'A'.repeat(255) }
      expect(manifestSchema.safeParse(longName).success).toBe(true)

      const tooLong = { ...FULL_VALID_MANIFEST, display_name: 'A'.repeat(256) }
      expect(manifestSchema.safeParse(tooLong).success).toBe(false)

      const empty = { ...FULL_VALID_MANIFEST, display_name: '' }
      expect(manifestSchema.safeParse(empty).success).toBe(false)
    })
  })

  describe('category', () => {
    test('合法值: SYSTEM, business, integration, theme', () => {
      const validCategories = ['SYSTEM', 'business', 'integration', 'theme'] as const
      for (const category of validCategories) {
        const manifest = { ...FULL_VALID_MANIFEST, category }
        expect(manifestSchema.safeParse(manifest).success).toBe(true)
      }
    })

    test('非法 category: 不在枚举中', () => {
      const manifest = { ...FULL_VALID_MANIFEST, category: 'unknown' }
      expect(manifestSchema.safeParse(manifest).success).toBe(false)
    })

    test('category 可选 — 缺失应通过', () => {
      const { category, ...rest } = FULL_VALID_MANIFEST
      expect(manifestSchema.safeParse(rest).success).toBe(true)
    })
  })

  // ============================================================
  // 运行时配置
  // ============================================================

  describe('runtime', () => {
    test('mode 必须为 inline（Phase 1a）', () => {
      const manifest = {
        ...FULL_VALID_MANIFEST,
        runtime: { ...FULL_VALID_MANIFEST.runtime, mode: 'process' },
      }
      expect(manifestSchema.safeParse(manifest).success).toBe(false)
    })

    test('partition 可为任意字符串', () => {
      const partitions = ['SYSTEM', 'oa', 'erp', 'mes', 'isolated', 'custom-domain']
      for (const partition of partitions) {
        const manifest = {
          ...FULL_VALID_MANIFEST,
          runtime: { ...FULL_VALID_MANIFEST.runtime, partition },
        }
        expect(manifestSchema.safeParse(manifest).success).toBe(true)
      }
    })

    test('crash_policy 默认值为 restart', () => {
      const { crash_policy, ...runtime } = FULL_VALID_MANIFEST.runtime
      const manifest = { ...FULL_VALID_MANIFEST, runtime }
      const parsed = manifestSchema.parse(manifest)
      expect(parsed.runtime.crash_policy).toBe('restart')
    })

    test('crash_policy: restart 或 ignore', () => {
      expect(manifestSchema.safeParse({
        ...FULL_VALID_MANIFEST,
        runtime: { ...FULL_VALID_MANIFEST.runtime, crash_policy: 'ignore' },
      }).success).toBe(true)

      expect(manifestSchema.safeParse({
        ...FULL_VALID_MANIFEST,
        runtime: { ...FULL_VALID_MANIFEST.runtime, crash_policy: 'kill' },
      }).success).toBe(false)
    })
  })

  // ============================================================
  // 依赖声明
  // ============================================================

  describe('dependencies', () => {
    test('默认值为空数组', () => {
      const { dependencies, ...rest } = FULL_VALID_MANIFEST
      const parsed = manifestSchema.parse(rest)
      expect(parsed.dependencies).toEqual([])
    })

    test('依赖应为字符串数组', () => {
      const manifest = {
        ...FULL_VALID_MANIFEST,
        dependencies: ['@audebase/plugin-rbac', '@audebase/plugin-audit'],
      }
      expect(manifestSchema.safeParse(manifest).success).toBe(true)
    })

    test('依赖不能为非字符串类型', () => {
      const manifest = {
        ...FULL_VALID_MANIFEST,
        dependencies: [{ name: '@audebase/plugin-rbac' }],
      }
      expect(manifestSchema.safeParse(manifest).success).toBe(false)
    })
  })

  // ============================================================
  // 权限声明
  // ============================================================

  describe('permissions', () => {
    test('默认值为空数组', () => {
      const { permissions, ...rest } = FULL_VALID_MANIFEST
      const parsed = manifestSchema.parse(rest)
      expect(parsed.permissions).toEqual([])
    })

    test('action 和 resource 必填', () => {
      const manifest = {
        ...FULL_VALID_MANIFEST,
        permissions: [{ action: 'read' }], // 缺少 resource
      }
      expect(manifestSchema.safeParse(manifest).success).toBe(false)
    })

    test('description 可选', () => {
      const manifest = {
        ...FULL_VALID_MANIFEST,
        permissions: [{ action: 'read', resource: 'order' }],
      }
      expect(manifestSchema.safeParse(manifest).success).toBe(true)
    })
  })

  // ============================================================
  // 默认值
  // ============================================================

  describe('默认值', () => {
    test('license 默认为 Apache-2.0', () => {
      const { license, ...rest } = FULL_VALID_MANIFEST
      const parsed = manifestSchema.parse(rest)
      expect(parsed.license).toBe('Apache-2.0')
    })

    test('assets 默认为空数组', () => {
      const { assets, ...rest } = FULL_VALID_MANIFEST
      const parsed = manifestSchema.parse(rest)
      expect(parsed.assets).toEqual([])
    })

    test('security 默认为 {} ', () => {
      const { security, ...rest } = FULL_VALID_MANIFEST
      const parsed = manifestSchema.parse(rest)
      expect(parsed.security).toEqual({})
    })

    test('models 默认为空数组', () => {
      const { models, ...rest } = FULL_VALID_MANIFEST
      const parsed = manifestSchema.parse(rest)
      expect(parsed.models).toEqual([])
    })

    test('data 默认为空数组', () => {
      const { data, ...rest } = FULL_VALID_MANIFEST
      const parsed = manifestSchema.parse(rest)
      expect(parsed.data).toEqual([])
    })

    test('cron 默认为空数组', () => {
      const { cron, ...rest } = FULL_VALID_MANIFEST
      const parsed = manifestSchema.parse(rest)
      expect(parsed.cron).toEqual([])
    })
  })
})
```

### 3.2 YAML 解析容错

**测试文件**: `packages/core/src/__tests__/unit/manifest-yaml-parse.test.ts`

```typescript
import { describe, test, expect } from 'vitest'
import { parseManifestYaml } from '../../manifest-loader'
import * as yaml from 'yaml'

describe('parseManifestYaml', () => {
  test('应正确解析标准 YAML', () => {
    // Arrange
    const yamlContent = `
name: "@audebase/plugin-test"
version: "1.0.0"
display_name: "测试插件"
application:
  entry: "src/index.ts"
runtime:
  mode: inline
  partition: SYSTEM
`

    // Act
    const result = parseManifestYaml(yamlContent)

    // Assert
    expect(result.name).toBe('@audebase/plugin-test')
    expect(result.version).toBe('1.0.0')
    expect(result.application.entry).toBe('src/index.ts')
  })

  test('应处理空文件', () => {
    // Arrange
    const yamlContent = ''

    // Act & Assert
    expect(() => parseManifestYaml(yamlContent)).toThrow()
  })

  test('应处理注释行', () => {
    // Arrange
    const yamlContent = `
# 这是注释
name: "@audebase/plugin-test"
# 版本信息
version: "1.0.0"
`

    // Act
    const result = parseManifestYaml(yamlContent)

    // Assert
    expect(result.name).toBe('@audebase/plugin-test')
    expect(result.version).toBe('1.0.0')
  })

  test('应处理多行字符串', () => {
    // Arrange
    const yamlContent = `
name: "@audebase/plugin-test"
version: "1.0.0"
display_name: "测试插件"
description: |
  这是一个
  多行描述
application:
  entry: "src/index.ts"
runtime:
  mode: inline
  partition: SYSTEM
`

    // Act
    const result = parseManifestYaml(yamlContent)

    // Assert
    expect(result.description).toContain('多行描述')
  })

  test('应拒绝非法 YAML 语法', () => {
    // Arrange
    const yamlContent = `
name: @audebase/plugin-test
  bad-indent: value
`

    // Act & Assert
    expect(() => parseManifestYaml(yamlContent)).toThrow()
  })

  test('应处理 YAML 数组语法', () => {
    // Arrange
    const yamlContent = `
name: "@audebase/plugin-test"
version: "1.0.0"
display_name: "Test"
application:
  entry: "src/index.ts"
runtime:
  mode: inline
  partition: SYSTEM
dependencies:
  - "@audebase/plugin-rbac"
  - "@audebase/plugin-audit"
`

    // Act
    const result = parseManifestYaml(yamlContent)

    // Assert
    expect(result.dependencies).toHaveLength(2)
    expect(result.dependencies).toContain('@audebase/plugin-rbac')
  })

  test('应处理布尔值和数字', () => {
    // Arrange
    const yamlContent = `
name: "@audebase/plugin-test"
version: "1.0.0"
display_name: "Test"
application:
  entry: "src/index.ts"
runtime:
  mode: inline
  partition: SYSTEM
permissions:
  - action: "manage"
    resource: "plugin"
    is_global: true
    priority: 100
`

    // Act
    const result = parseManifestYaml(yamlContent)

    // Assert
    expect(result.permissions[0].is_global).toBe(true)
    expect(result.permissions[0].priority).toBe(100)
  })
})
```

### 3.3 版本比较工具

**测试文件**: `packages/core/src/__tests__/unit/version-compare.test.ts`

```typescript
import { describe, test, expect } from 'vitest'
import { compareVersions, isVersionGt, semverSort } from '../../version-utils'

describe('版本比较工具', () => {
  describe('compareVersions', () => {
    test('相同版本返回 0', () => {
      expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    })

    test('a > b 返回正数', () => {
      expect(compareVersions('2.0.0', '1.0.0')).toBeGreaterThan(0)
      expect(compareVersions('1.1.0', '1.0.0')).toBeGreaterThan(0)
      expect(compareVersions('1.0.1', '1.0.0')).toBeGreaterThan(0)
    })

    test('a < b 返回负数', () => {
      expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0)
      expect(compareVersions('1.0.0', '1.1.0')).toBeLessThan(0)
      expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0)
    })

    test('pre-release 版本排序', () => {
      // 根据 SemVer: 1.0.0-alpha < 1.0.0
      expect(compareVersions('1.0.0-alpha', '1.0.0')).toBeLessThan(0)
      expect(compareVersions('1.0.0-alpha.1', '1.0.0-alpha.2')).toBeLessThan(0)
      expect(compareVersions('1.0.0-beta', '1.0.0')).toBeLessThan(0)
    })

    test('应处理多位数版本号', () => {
      expect(compareVersions('10.0.0', '2.0.0')).toBeGreaterThan(0)
      expect(compareVersions('1.20.0', '1.3.0')).toBeGreaterThan(0)
    })
  })

  describe('isVersionGt', () => {
    test('新版本 > 已安装版本返回 true', () => {
      // manifest version 2.0.0, 已安装 version 1.0.0
      expect(isVersionGt('2.0.0', '1.0.0')).toBe(true)
    })

    test('新版本 ≤ 已安装版本返回 false', () => {
      expect(isVersionGt('1.0.0', '1.0.0')).toBe(false)
      expect(isVersionGt('0.9.0', '1.0.0')).toBe(false)
    })
  })

  describe('semverSort', () => {
    test('应按版本升序排列', () => {
      // Arrange
      const versions = ['2.0.0', '1.0.0', '1.5.0', '1.0.1', '1.0.0-alpha']

      // Act
      const sorted = semverSort(versions)

      // Assert
      expect(sorted[0]).toBe('1.0.0-alpha')
      expect(sorted[1]).toBe('1.0.0')
      expect(sorted[2]).toBe('1.0.1')
      expect(sorted[3]).toBe('1.5.0')
      expect(sorted[4]).toBe('2.0.0')
    })
  })
})
```

---

## 4. 集成测试设计

### 4.1 Manifest 解析 + modules 表写入

**测试文件**: `packages/core/src/__tests__/integration/manifest-to-db.integration.test.ts`

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { createTestApp, type TestApp } from '../helpers/create-test-app'
import { seedTestPlugin } from '../seeds/plugins'
import { manifestSchema } from '../../manifest-schema'

describe('Manifest → Modules 表集成测试', () => {
  let test: TestApp

  beforeEach(async () => {
    test = await createTestApp()
  })

  afterEach(async () => {
    await test.cleanup()
  })

  test('discover() → 解析 manifest → 写入 modules 表', async () => {
    // Arrange
    await seedTestPlugin(test, {
      name: '@audebase/plugin-alpha',
      version: '1.2.3',
      displayName: 'Alpha 插件',
      dependencies: ['@audebase/plugin-rbac'],
    })

    // Act
    const pm = test.app.pluginManager
    await pm.discover()

    // Assert — modules 表中存在记录
    const module = await test.db.query.modules.findFirst({
      where: (fields, { eq }) => eq(fields.name, '@audebase/plugin-alpha'),
    })
    expect(module).toBeDefined()
    expect(module!.version).toBe('1.2.3')
    expect(module!.displayName).toBe('Alpha 插件')
    expect(module!.state).toBe('discovered')
    expect(module!.runtimeMode).toBe('inline')
    expect(module!.runtimePartition).toBe('SYSTEM')
  })

  test('manifest permissions 应写入 permissions 表', async () => {
    // Arrange — 插件声明了权限
    await seedTestPlugin(test, {
      name: '@audebase/plugin-orders',
      version: '1.0.0',
      permissions: [
        { action: 'create', resource: 'order' },
        { action: 'read', resource: 'order' },
        { action: 'update', resource: 'order' },
      ],
    })

    // Act
    const pm = test.app.pluginManager
    await pm.discover()
    await pm.install('@audebase/plugin-orders')

    // Assert
    const permissions = await test.db.query.permissions.findMany({
      where: (fields, { eq }) => eq(fields.resource, 'order'),
    })
    expect(permissions.length).toBe(3)
    const actions = permissions.map(p => p.action)
    expect(actions).toContain('create')
    expect(actions).toContain('read')
    expect(actions).toContain('update')
  })

  test('manifest models 应写入 collections 表', async () => {
    // Arrange
    await seedTestPlugin(test, {
      name: '@audebase/plugin-crm',
      version: '1.0.0',
      models: [
        { name: 'lead', table: 'leads' },
        { name: 'contact', table: 'contacts' },
      ],
    })

    // Act
    const pm = test.app.pluginManager
    await pm.discover()
    await pm.install('@audebase/plugin-crm')

    // Assert
    const collections = await test.db.query.collections.findMany()
    const names = collections.map(c => c.name)
    expect(names).toContain('lead')
    expect(names).toContain('contact')
  })

  test('manifest 验证失败不应写入 modules 表', async () => {
    // Arrange — 创建非法 manifest（缺少 version）
    const tmpDir = await createInvalidManifest({
      name: '@audebase/plugin-broken',
      // 故意缺失 version
    })

    // Act
    const pm = test.app.pluginManager
    await expect(pm.discover()).rejects.toThrow()

    // Assert — modules 表无记录
    const module = await test.db.query.modules.findFirst({
      where: (fields, { eq }) => eq(fields.name, '@audebase/plugin-broken'),
    })
    expect(module).toBeNull()
  })
})
```

---

## 5. 测试种子数据 — Manifest 变体

**种子工厂文件**: `packages/core/src/__tests__/seeds/manifest.ts`

```typescript
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import * as yaml from 'yaml'

interface ManifestSeedOptions {
  name: string
  version: string
  displayName: string
  description?: string
  category?: string
  dependencies?: string[]
  partition?: string
  permissions?: Array<{ action: string; resource: string }>
  models?: Array<{ name: string; table: string }>
}

export async function seedManifestFile(
  dirPath: string,
  opts: ManifestSeedOptions,
): Promise<string> {
  const manifest = {
    name: opts.name,
    version: opts.version,
    display_name: opts.displayName,
    description: opts.description,
    category: opts.category,
    application: { entry: 'src/index.ts' },
    dependencies: opts.dependencies ?? [],
    runtime: {
      mode: 'inline',
      partition: opts.partition ?? 'SYSTEM',
    },
    permissions: opts.permissions ?? [],
    models: opts.models ?? [],
    data: [],
    cron: [],
  }

  const yamlContent = yaml.stringify(manifest)
  const filePath = path.join(dirPath, 'manifest.yaml')
  await fs.writeFile(filePath, yamlContent)
  return filePath
}

/**
 * 创建非法 manifest（用于错误路径测试）
 */
export async function createInvalidManifest(
  partial: Record<string, unknown>,
): Promise<string> {
  const tmpDir = path.join(os.tmpdir(), `aude-manifest-test-${Date.now()}`)
  await fs.mkdir(tmpDir, { recursive: true })

  const yamlContent = yaml.stringify(partial)
  await fs.writeFile(path.join(tmpDir, 'manifest.yaml'), yamlContent)
  return tmpDir
}
```

---

## 6. Mock 策略汇总

| 依赖 | 单元测试策略 | 集成测试策略 |
|------|------------|------------|
| manifest.yaml 文件 | 字符串直传（YAML parse） | 真实文件（`os.tmpdir()`） |
| PostgreSQL (modules 表) | 不连接 | 真实 PG + 事务回滚 |
| YAML 库 | 真实 `yaml` 库 | 真实 `yaml` 库 |
| Zod | 真实 `zod` | 真实 `zod` |

---

## 7. 核心路径覆盖率矩阵

| 文件 | 最低覆盖率 | 关键语句 |
|------|:---:|------|
| `manifest-schema.ts` | **80%** | manifestSchema.parse (所有字段 + 默认值) |
| `manifest-loader.ts` | **80%** | parseManifestYaml, readManifest, validateManifest |
| `version-utils.ts` | **80%** | compareVersions, semverSort, isVersionGt |
| `dependency-resolver.ts` | **80%** | resolveDependencyOrder (被 plugin-framework-tdd.md 覆盖) |

> **备注**: manifest-schema.ts 的单元测试跨越本文档和 plugin-framework-tdd.md —— 本文档侧重全字段覆盖矩阵和默认值验证，plugin-framework-tdd.md 侧重缺失必填字段和格式错误场景。

---

## 8. CI 集成

manifest-engine 测试与 core 包共用 CI pipeline。

```yaml
- run: pnpm --filter @audebase/core test -- --coverage
  env:
    AUDE_DATABASE_URL: postgres://audebase:audebase_test@localhost:5432/audebase_test
```

---

## 9. 验收标准

| # | 标准 | 对应测试 |
|---|------|---------|
| 1 | 合法 manifest 全部字段解析正确 | `manifest-full-coverage.test.ts`: 正向测试 |
| 2 | 非法 manifest 拒绝加载（name/version 缺失） | `manifest-full-coverage.test.ts`: 边界测试 |
| 3 | YAML 解析容错（注释、多行、数组） | `manifest-yaml-parse.test.ts` |
| 4 | manifest 解析结果写入 modules 表 | `manifest-to-db.integration.test.ts` |
| 5 | 版本比较工具正确（SemVer） | `version-compare.test.ts` |
| 6 | Phase 1a runtime.mode 仅接受 inline | `manifest-full-coverage.test.ts`: runtime.mode |
| 7 | 默认值正确注入（license, assets, dependencies） | `manifest-full-coverage.test.ts`: 默认值 |

---

## 参考

- [plugin-framework-sdd.md](plugin-framework-sdd.md) §3 — Manifest Validation Zod Schema 定义
- [plugin-framework-tdd.md](plugin-framework-tdd.md) — 互补的 manifest 测试（缺失字段/格式错误）
- [database-schema.md](database-schema.md) — modules 表 DDL (§1)
- [test-seed-strategy.md](test-seed-strategy.md) — 测试种子数据工厂
- [dev-workflow.md](dev-workflow.md) — Test Harness 设计
- [../../.agents/memorys/decisions.md](../../.agents/memorys/decisions.md) — D1.5

---

## 10. 错误码覆盖

根据 manifest-engine-sdd.md §5 定义的 7 个错误码：

**测试文件**: `packages/manifest-engine/src/__tests__/unit/error-codes.test.ts`

```typescript
import { describe, test, expect } from 'vitest'
import { parseManifestYaml, validateManifest } from '../../manifest-engine'

describe('Manifest Engine 错误码覆盖', () => {
  // PARSE_ERROR — YAML 解析失败
  test('无效 YAML 语法应抛出 PARSE_ERROR', () => {
    // Arrange
    const invalidYaml = 'name: @audebase/plugin-test
  bad-indent: value'

    // Act & Assert
    expect(() => parseManifestYaml(invalidYaml)).toThrow('PARSE_ERROR')
  })

  // VALIDATION_ERROR — Zod schema 验证失败
  test('缺少必填字段应抛出 VALIDATION_ERROR', () => {
    // Arrange
    const incomplete = { name: '@audebase/plugin-test' }

    // Act & Assert
    expect(() => validateManifest(incomplete)).toThrow('VALIDATION_ERROR')
  })

  // NAME_FORMAT_ERROR — 插件名不符合 @scope/plugin- 规范
  test('非法插件名格式应抛出 NAME_FORMAT_ERROR', () => {
    // Arrange
    const badManifest = JSON.parse(JSON.stringify(VALID_MINIMAL_MANIFEST))
    badManifest.name = 'no-scope-plugin'

    // Act & Assert
    expect(() => validateManifest(badManifest)).toThrow('NAME_FORMAT_ERROR')
  })

  // VERSION_FORMAT_ERROR — SemVer 格式错误
  test('非法版本号应抛出 VERSION_FORMAT_ERROR', () => {
    // Arrange
    const badManifest = JSON.parse(JSON.stringify(VALID_MINIMAL_MANIFEST))
    badManifest.version = 'latest'

    // Act & Assert
    expect(() => validateManifest(badManifest)).toThrow('VERSION_FORMAT_ERROR')
  })

  // MODE_ERROR — runtime.mode 非法（Phase 1a 仅 inline）
  test('非 inline mode 应抛出 MODE_ERROR', () => {
    // Arrange
    const badManifest = JSON.parse(JSON.stringify(VALID_MINIMAL_MANIFEST))
    badManifest.runtime.mode = 'container'

    // Act & Assert
    expect(() => validateManifest(badManifest)).toThrow('MODE_ERROR')
  })

  // PARTITION_ERROR — 非法 partition 值
  test('非法 partition 应抛出 PARTITION_ERROR', () => {
    // Arrange
    const badManifest = JSON.parse(JSON.stringify(VALID_MINIMAL_MANIFEST))
    badManifest.runtime.partition = 'INVALID'

    // Act & Assert
    expect(() => validateManifest(badManifest)).toThrow('PARTITION_ERROR')
  })

  // DUPLICATE_NAME — 插件名重复
  test('同名插件应抛出 DUPLICATE_NAME', () => {
    // Arrange
    const manifests = [
      { ...VALID_MINIMAL_MANIFEST, name: '@audebase/plugin-same' },
      { ...VALID_MINIMAL_MANIFEST, name: '@audebase/plugin-same' },
    ]

    // Act & Assert
    expect(() => registerManifests(manifests)).toThrow('DUPLICATE_NAME')
  })
})
```

| 错误码 | 对应测试 | SDD 引用 |
|--------|---------|----------|
| `PARSE_ERROR` | YAML 解析失败 | manifest-engine-sdd.md §5 |
| `VALIDATION_ERROR` | Zod schema 验证失败 | manifest-engine-sdd.md §5 |
| `NAME_FORMAT_ERROR` | 插件名格式不符 | manifest-engine-sdd.md §5 |
| `VERSION_FORMAT_ERROR` | SemVer 格式错误 | manifest-engine-sdd.md §5 |
| `MODE_ERROR` | runtime.mode 非法 | manifest-engine-sdd.md §5 |
| `PARTITION_ERROR` | runtime.partition 非法 | manifest-engine-sdd.md §5 |
| `DUPLICATE_NAME` | 同名插件注册 | manifest-engine-sdd.md §5 |

> **上游 TDD 参考**: [shared-types-tdd.md §3.1](shared-types-tdd.md) — ErrorCode 枚举定义; [plugin-framework-tdd.md §3.1](plugin-framework-tdd.md) — manifestSchema
