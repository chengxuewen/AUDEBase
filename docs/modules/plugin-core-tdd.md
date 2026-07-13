# Plugin-Core Bootstrap TDD 测试策略 — Phase 1a

> **创建日期**: 2026-07-13  
> **目的**: 为 Phase 1a #4 模块（plugin-core Bootstrap）提供完整的 TDD 测试策略与用例设计。  
> **前置阅读**: D1.6, database-schema.md, plugin-framework-sdd.md, test-seed-strategy.md  
> **责任人**: Person B  
> **覆盖率目标**: 80% lines（核心路径 install() 强制 80%）

---

## 1. 测试金字塔

```
         ┌──────────────────────┐
         │  E2E (10%)            │  Playwright: admin 用户登录 + 默认菜单可见
         │  packages/admin-ui/   │  + 系统租户存在
         │  __e2e__/             │
         ├──────────────────────┤
         │  集成测试 (45%)        │  真实 PG + 完整 Bootstrap 流程
         │  packages/plugin-core/│  install() 创建管理员 + 角色 + 权限 + 菜单
         │  __tests__/integration│  + 幂等性验证（重复安装不重复创建）
         ├──────────────────────┤
         │  单元测试 (45%)        │  Vitest: PluginCore 类方法、Bootstrap 数据
         │  packages/plugin-core/│  install() 钩子逻辑、数据校验
         │  __tests__/unit/      │
         └──────────────────────┘
```

## 2. 测试边界

| 测试层级 | 范围 | Mock 策略 | 文件位置 |
|---------|------|----------|---------|
| 单元测试 | PluginCore.install() 数据生成逻辑 | mock DB（不连 PG） | `packages/plugin-core/src/__tests__/unit/` |
| 集成测试 | 完整 Bootstrap 流程 + 数据库写入验证 | 真实 PG（事务回滚） | `packages/plugin-core/src/__tests__/integration/` |
| 契约测试 | 首次启动后 /health 端点 + 管理页面渲染 | Fastify.inject() | `packages/core/src/__tests__/contracts/` |
| E2E 测试 | admin 登录 + ProLayout 菜单 + 用户管理 | 真实 PG + Redis + Playwright | `packages/admin-ui/__e2e__/health.e2e.ts` |

---

## 3. Bootstrap 数据规范

plugin-core 是零依赖内核插件（D1.6），负责首次运行时创建以下核心数据：

| 数据 | 内容 | 对应数据库表 |
|------|------|------------|
| 系统租户 | `slug: 'system'`, `name: '系统租户'` | `tenants` |
| admin 用户 | `username: 'admin'`, `must_change_password: true` | `users` |
| admin 角色 | `slug: 'admin'`, `name: '管理员'`, `is_system: true` | `roles` |
| member 角色 | `slug: 'member'`, `name: '成员'`, `is_system: true` | `roles` |
| 核心权限项 | `manage:plugin`, `manage:user`, `manage:role`, `read:audit_log`, `read:health` | `permissions` |
| admin→admin 角色 | user_roles 关联 | `user_roles` |
| admin 角色→全部权限 | role_permissions 关联 | `role_permissions` |
| 核心模块注册 | plugin-core 自身注册到 modules 表 | `modules` |

---

## 4. 单元测试设计

### 4.1 PluginCore 类 — 基础结构

**测试文件**: `packages/plugin-core/src/__tests__/unit/plugin-core.test.ts`

```typescript
import { describe, test, expect, vi, beforeEach } from 'vitest'
import PluginCore from '../../index'
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
    db: mockDb as any,
    t: (key: string) => key,
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as any,
    config: { get: vi.fn() } as any,
    ...overrides,
  }
}

describe('PluginCore', () => {
  let plugin: PluginCore

  beforeEach(() => {
    plugin = new PluginCore()
  })

  test('应继承 PluginHost 接口', () => {
    // Assert — PluginCore 应实现 PluginHost 的所有必需方法
    expect(plugin.name).toBeDefined()
    expect(plugin.status).toBeDefined()
    expect(plugin.manifest).toBeDefined()
    expect(plugin.db).toBeDefined()
    expect(typeof plugin.t).toBe('function')
    expect(plugin.logger).toBeDefined()
  })

  test('install() 应创建系统租户', async () => {
    // Arrange
    const host = createMockHost()
    plugin.injectHost(host)

    // Act
    await plugin.install!()

    // Assert
    expect(host.db.insert).toHaveBeenCalled()
  })

  test('dependencies 应为空数组（零依赖）', () => {
    // D1.6: plugin-core 零依赖
    expect(plugin.manifest.dependencies).toEqual([])
  })

  test('auto_install 应为 true（不可卸载）', () => {
    // D1.6: plugin-core 不可卸载
    expect(plugin.manifest.auto_install).toBe(true)
  })
})
```

### 4.2 Bootstrap 数据校验

**测试文件**: `packages/plugin-core/src/__tests__/unit/bootstrap-data.test.ts`

```typescript
import { describe, test, expect } from 'vitest'
import { generateBootstrapData } from '../../bootstrap-data'

describe('generateBootstrapData', () => {
  test('应生成 admin 用户数据', () => {
    // Arrange & Act
    const data = generateBootstrapData()

    // Assert
    expect(data.adminUser).toBeDefined()
    expect(data.adminUser.username).toBe('admin')
    expect(data.adminUser.mustChangePassword).toBe(true)
    expect(data.adminUser.isActive).toBe(true)
    expect(data.adminUser.tokenVersion).toBe(0)
  })

  test('admin 密码应经过 bcrypt 哈希', () => {
    // Arrange & Act
    const data = generateBootstrapData()

    // Assert
    expect(data.adminUser.passwordHash).not.toBe('Admin@123')
    expect(data.adminUser.passwordHash).toMatch(/^\$2[aby]\$\d+\$/)
  })

  test('应生成 2 个系统角色（admin + member）', () => {
    // Arrange & Act
    const data = generateBootstrapData()

    // Assert
    expect(data.roles).toHaveLength(2)
    const slugs = data.roles.map(r => r.slug)
    expect(slugs).toContain('admin')
    expect(slugs).toContain('member')
    expect(data.roles.every(r => r.isSystem)).toBe(true)
  })

  test('应生成 5 个核心权限项', () => {
    // Arrange & Act
    const data = generateBootstrapData()

    // Assert
    expect(data.permissions.length).toBeGreaterThanOrEqual(5)
    const permIds = data.permissions.map(p => `${p.action}:${p.resource}`)
    expect(permIds).toContain('manage:plugin')
    expect(permIds).toContain('manage:user')
    expect(permIds).toContain('manage:role')
    expect(permIds).toContain('read:audit_log')
    expect(permIds).toContain('read:health')
  })

  test('admin 角色应拥有全部权限', () => {
    // Arrange & Act
    const data = generateBootstrapData()
    const adminRole = data.roles.find(r => r.slug === 'admin')!

    // Assert
    const adminPerms = data.rolePermissions
      .filter(rp => rp.roleId === adminRole.id)
    expect(adminPerms.length).toBe(data.permissions.length)
  })

  test('member 角色应拥有基础权限', () => {
    // Arrange & Act
    const data = generateBootstrapData()
    const memberRole = data.roles.find(r => r.slug === 'member')!

    // Assert — member 至少应有 read:health 权限
    const memberPerms = data.rolePermissions
      .filter(rp => rp.roleId === memberRole.id)
    expect(memberPerms.length).toBeGreaterThan(0)
  })

  test('admin 用户应关联 admin 角色', () => {
    // Arrange & Act
    const data = generateBootstrapData()
    const adminRole = data.roles.find(r => r.slug === 'admin')!

    // Assert
    const userRole = data.userRoles.find(
      ur => ur.userId === data.adminUser.id && ur.roleId === adminRole.id
    )
    expect(userRole).toBeDefined()
  })

  test('系统租户 tenant_id 应为 NULL（全局数据）', () => {
    // Arrange & Act
    const data = generateBootstrapData()

    // Assert — 系统角色和权限应无租户限制
    expect(data.roles.every(r => r.tenantId === null)).toBe(true)
    expect(data.permissions.every(p => p.tenantId === null)).toBe(true)
  })

  test('生成的 UUID 应唯一', () => {
    // Arrange & Act
    const data1 = generateBootstrapData()
    const data2 = generateBootstrapData()

    // Assert — 每次调用生成新的 UUID
    expect(data1.adminUser.id).not.toBe(data2.adminUser.id)
  })
})
```

### 4.3 幂等性验证

**测试文件**: `packages/plugin-core/src/__tests__/unit/idempotency.test.ts`

```typescript
import { describe, test, expect, vi } from 'vitest'
import { isBootstrapComplete } from '../../bootstrap-check'

describe('Bootstrap 幂等性', () => {
  test('数据库中已有 admin 时应跳过创建', async () => {
    // Arrange — mock DB 返回已有 admin
    const mockDb = {
      query: {
        users: {
          findFirst: vi.fn().mockResolvedValue({ id: 'existing-admin', username: 'admin' }),
        },
      },
    }

    // Act
    const complete = await isBootstrapComplete(mockDb as any)

    // Assert
    expect(complete).toBe(true)
  })

  test('数据库中无 admin 时应返回未完成', async () => {
    // Arrange — mock DB 返回 null
    const mockDb = {
      query: {
        users: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
    }

    // Act
    const complete = await isBootstrapComplete(mockDb as any)

    // Assert
    expect(complete).toBe(false)
  })

  test('模块注册表中已有 plugin-core 记录时应跳过', async () => {
    // Arrange
    const mockDb = {
      query: {
        modules: {
          findFirst: vi.fn().mockResolvedValue({
            name: '@audebase/plugin-core',
            state: 'enabled',
          }),
        },
      },
    }

    // Act
    const complete = await isBootstrapComplete(mockDb as any)

    // Assert
    expect(complete).toBe(true)
  })
})
```

---

## 5. 集成测试设计

### 5.1 完整 Bootstrap 流程

**测试文件**: `packages/plugin-core/src/__tests__/integration/bootstrap.integration.test.ts`

**环境要求**: 真实 PostgreSQL（事务回滚）

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { createTestApp, type TestApp } from '../helpers/create-test-app'
import { sql } from 'drizzle-orm'

describe('PluginCore Bootstrap 集成测试', () => {
  let test: TestApp

  beforeEach(async () => {
    test = await createTestApp({ withRedis: true })
  })

  afterEach(async () => {
    await test.cleanup()
  })

  test('首次启动应创建完整 Bootstrap 数据', async () => {
    // Arrange — 确保数据库是干净的（无 admin 用户）
    const existing = await test.db.query.users.findFirst({
      where: (fields, { eq }) => eq(fields.username, 'admin'),
    })
    expect(existing).toBeNull()

    // Act — 执行 plugin-core 的 install()
    const pm = test.app.pluginManager
    await pm.install('@audebase/plugin-core')

    // Assert — 验证各表数据

    // 1. 系统租户
    const tenant = await test.db.query.tenants.findFirst({
      where: (fields, { eq }) => eq(fields.slug, 'system'),
    })
    expect(tenant).toBeDefined()
    expect(tenant!.name).toBe('系统租户')

    // 2. admin 用户
    const admin = await test.db.query.users.findFirst({
      where: (fields, { eq }) => eq(fields.username, 'admin'),
    })
    expect(admin).toBeDefined()
    expect(admin!.isActive).toBe(true)
    expect(admin!.mustChangePassword).toBe(true)

    // 3. 角色
    const roles = await test.db.query.roles.findMany()
    const roleSlugs = roles.map(r => r.slug)
    expect(roleSlugs).toContain('admin')
    expect(roleSlugs).toContain('member')

    // 4. 权限项
    const permissions = await test.db.query.permissions.findMany()
    expect(permissions.length).toBeGreaterThanOrEqual(5)

    // 5. admin → admin 角色关联
    const adminRole = roles.find(r => r.slug === 'admin')!
    const userRoles = await test.db.query.userRoles.findMany({
      where: (fields, { eq }) => eq(fields.userId, admin!.id),
    })
    expect(userRoles.some(ur => ur.roleId === adminRole.id)).toBe(true)

    // 6. admin 角色 → 全部权限
    const rolePerms = await test.db.query.rolePermissions.findMany({
      where: (fields, { eq }) => eq(fields.roleId, adminRole.id),
    })
    expect(rolePerms.length).toBe(permissions.length)

    // 7. modules 表注册
    const module = await test.db.query.modules.findFirst({
      where: (fields, { eq }) => eq(fields.name, '@audebase/plugin-core'),
    })
    expect(module).toBeDefined()
    expect(module!.state).toBe('enabled')
  })

  test('重复安装应保持幂等（不创建重复数据）', async () => {
    // Arrange — 第一次安装
    const pm = test.app.pluginManager
    await pm.install('@audebase/plugin-core')

    // 记录第一次安装的数据量
    const userCountBefore = await test.db.select({ count: sql<number>`count(*)` })
      .from(test.schema.users)

    // Act — 第二次安装（模拟重启）
    await pm.install('@audebase/plugin-core')

    // Assert — 数据量不变
    const userCountAfter = await test.db.select({ count: sql<number>`count(*)` })
      .from(test.schema.users)
    expect(userCountAfter).toEqual(userCountBefore)

    // admin 角色权限数不变
    const adminRole = await test.db.query.roles.findFirst({
      where: (fields, { eq }) => eq(fields.slug, 'admin'),
    })
    const rolePerms = await test.db.query.rolePermissions.findMany({
      where: (fields, { eq }) => eq(fields.roleId, adminRole!.id),
    })
    // 权限数应与首次一致
    const permCount = await test.db.select({ count: sql<number>`count(*)` })
      .from(test.schema.permissions)
    expect(rolePerms.length).toBe(permCount as any)
  })

  test('admin 密码应为 bcrypt 哈希（非明文）', async () => {
    // Arrange & Act
    const pm = test.app.pluginManager
    await pm.install('@audebase/plugin-core')

    // Assert
    const admin = await test.db.query.users.findFirst({
      where: (fields, { eq }) => eq(fields.username, 'admin'),
    })
    expect(admin!.passwordHash).toMatch(/^\$2[aby]\$\d+\$/)
    expect(admin!.passwordHash).not.toBe('Admin@123')
  })

  test('Bootstrap 失败时应标记 migration_failed 状态', async () => {
    // Arrange — 模拟 install 过程中的 DB 异常
    const pm = test.app.pluginManager

    // 注入一个会失败的 mock（例如：重复插入 role_permissions 触发约束冲突）
    // 实际测试中可通过 mock 实现

    // Act & Assert
    // 此用例验证错误不阻塞启动（D1.6 约束）
    // 实际编码时使用 vi.spyOn 注入错误
  })
})
```

### 5.2 Bootstrap 与模块注册表联动

```typescript
describe('PluginCore — modules 表注册', () => {
  let test: TestApp

  beforeEach(async () => {
    test = await createTestApp({ withRedis: true })
  })

  afterEach(async () => {
    await test.cleanup()
  })

  test('install 应将 plugin-core 写入 modules 表', async () => {
    // Arrange & Act
    const pm = test.app.pluginManager
    await pm.install('@audebase/plugin-core')

    // Assert
    const module = await test.db.query.modules.findFirst({
      where: (fields, { eq }) => eq(fields.name, '@audebase/plugin-core'),
    })
    expect(module).toBeDefined()
    expect(module!.version).toBe('1.0.0')
    expect(module!.state).toBe('enabled')
    expect(module!.autoInstall).toBe(true)
    expect(module!.runtimeMode).toBe('inline')
    expect(module!.runtimePartition).toBe('SYSTEM')
  })
})
```

---

## 6. 契约测试

**测试文件**: `packages/core/src/__tests__/contracts/bootstrap.contract.test.ts`

```typescript
import { describe, test, expect } from 'vitest'
import { createTestApp, type TestApp } from '../helpers/create-test-app'

describe('Bootstrap 后契约测试', () => {
  let test: TestApp

  beforeEach(async () => {
    test = await createTestApp()
    // 执行 Bootstrap
    await test.app.pluginManager.install('@audebase/plugin-core')
  })

  afterEach(async () => {
    await test.cleanup()
  })

  test('/health 应返回 db:true', async () => {
    // Arrange & Act
    const res = await test.app.inject({ method: 'GET', url: '/health' })

    // Assert
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.status).toBe('ok')
    expect(body.db).toBe(true)
  })

  test('admin 用户应可登录', async () => {
    // Arrange
    const loginPayload = {
      username: 'admin',
      password: 'Admin@123',
    }

    // Act
    const res = await test.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: loginPayload,
    })

    // Assert
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.access_token).toBeDefined()
    expect(body.refresh_token).toBeDefined()
    expect(body.expires_in).toBeGreaterThan(0)
    expect(body.token_type).toBe('Bearer')
  })

  test('admin 首次登录应收到 must_change_password 标记', async () => {
    // Arrange
    const loginPayload = {
      username: 'admin',
      password: 'Admin@123',
    }

    // Act
    const res = await test.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: loginPayload,
    })

    // Assert
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    // D1.6: admin 默认密码强制首次修改
    expect(body.must_change_password).toBe(true)
  })
})
```

---

## 7. 测试种子数据

**种子工厂文件**: `packages/core/src/__tests__/seeds/admin.ts`

```typescript
import type { TestApp } from '../helpers/create-test-app'
import { hash } from 'bcrypt'

export async function seedAdminUser(
  test: TestApp,
  options: {
    username?: string
    password?: string
    tokenVersion?: number
  } = {},
) {
  const {
    username = 'admin',
    password = 'Admin@123',
    tokenVersion = 0,
  } = options

  // 幂等性检查
  const existing = await test.db.query.users.findFirst({
    where: (fields, { eq }) => eq(fields.username, username),
  })
  if (existing) return existing

  const passwordHash = await hash(password, 10)
  const admin = await test.db.insert(test.schema.users).values({
    username,
    passwordHash,
    tokenVersion,
    isActive: true,
    mustChangePassword: true,
  }).returning().get()

  return admin
}

export async function seedSystemTenant(test: TestApp) {
  const existing = await test.db.query.tenants.findFirst({
    where: (fields, { eq }) => eq(fields.slug, 'system'),
  })
  if (existing) return existing

  return test.db.insert(test.schema.tenants).values({
    slug: 'system',
    name: '系统租户',
    config: {},
    status: 'active',
  }).returning().get()
}

export async function seedAdminRole(test: TestApp) {
  const existing = await test.db.query.roles.findFirst({
    where: (fields, { eq }) => eq(fields.slug, 'admin'),
  })
  if (existing) return existing

  return test.db.insert(test.schema.roles).values({
    name: '管理员',
    slug: 'admin',
    isSystem: true,
  }).returning().get()
}
```

---

## 8. Mock 策略汇总

| 依赖 | 单元测试策略 | 集成测试策略 |
|------|------------|------------|
| PostgreSQL | 不连接 — mock Drizzle query/insert | 真实 PG + 事务回滚 |
| bcrypt | 使用真实 bcrypt（纯 JS 实现） | 真实 bcrypt |
| PluginHost context | mock `{ db, t, logger, config }` | 真实 InlinePluginHost |
| modules 表 | mock | 真实 PG 表 |

---

## 9. 核心路径覆盖率矩阵

| 文件 | 最低覆盖率 | 关键语句 |
|------|:---:|------|
| `packages/plugin-core/src/index.ts` | **80%** | PluginCore 类、injectHost、install |
| `packages/plugin-core/src/bootstrap-data.ts` | **80%** | generateBootstrapData、hashPassword |
| `packages/plugin-core/src/bootstrap-check.ts` | **80%** | isBootstrapComplete |

---

## 10. CI 集成

plugin-core 测试与 core 包共用 CI pipeline（位于 `packages/core/`），无需独立 CI job。

```yaml
- run: pnpm --filter @audebase/plugin-core test -- --coverage
  env:
    AUDE_DATABASE_URL: postgres://audebase:audebase_test@localhost:5432/audebase_test
    AUDE_JWT_SECRET: test-secret-at-least-32-characters-long!!
```

---

## 11. 验收标准

遵循 phase-planning.md §1a #4 验收标准：

| # | 标准 | 对应测试 |
|---|------|---------|
| 1 | admin 用户创建成功（must_change_password=true） | `bootstrap.integration.test.ts`: 完整 Bootstrap |
| 2 | 默认角色 admin/member 存在 | `bootstrap-data.test.ts`: 角色生成 |
| 3 | 系统租户 (slug=system) 存在 | `bootstrap.integration.test.ts`: 系统租户 |
| 4 | 核心权限项注册到 permissions 表 | `bootstrap-data.test.ts`: 权限项生成 |
| 5 | 重复安装幂等（不创建重复数据）| `bootstrap.integration.test.ts`: 幂等性 |
| 6 | admin 密码 bcrypt 哈希（非明文）| `bootstrap.integration.test.ts`: 密码哈希 |
| 7 | plugin-core 零依赖（dependencies: []）| `plugin-core.test.ts`: 零依赖 |
| 8 | modules 表有 plugin-core 记录 | `bootstrap.integration.test.ts`: 模块注册 |

---

## 参考

- [database-schema.md](database-schema.md) — 11 张表完整 DDL
- [plugin-framework-sdd.md](plugin-framework-sdd.md) — PluginHost 接口与生命周期
- [test-seed-strategy.md](test-seed-strategy.md) — 测试种子数据工厂
- [phase-planning.md](../phase-planning.md) — Phase 1a 模块清单与验收标准
- [../../.agents/memorys/decisions.md](../../.agents/memorys/decisions.md) — D1.6

---

## 12. 错误码覆盖

根据 plugin-core-sdd.md §5 定义的错误码：

**测试文件**: `packages/plugin-core/src/__tests__/unit/error-codes.test.ts`

```typescript
import { describe, test, expect } from 'vitest'
import { PluginCore } from '../../plugin-core'
import { createTestApp, type TestApp } from '../helpers/create-test-app'

describe('PluginCore 错误码覆盖', () => {
  let test: TestApp

  beforeEach(async () => {
    test = await createTestApp()
  })

  afterEach(async () => {
    await test.cleanup()
  })

  // ALREADY_INSTALLED — 重复安装同一插件
  test('重复安装应抛出 ALREADY_INSTALLED', async () => {
    // Arrange
    const pm = test.app.pluginManager
    await seedTestPlugin(test, { name: '@test/plugin-dup', version: '1.0.0' })
    await pm.discover()
    await pm.install('@test/plugin-dup')

    // Act & Assert
    await expect(pm.install('@test/plugin-dup')).rejects.toThrow('ALREADY_INSTALLED')
  })

  // BOOTSTRAP_FAILED — 首次初始化时 Bootstrap 数据写入失败
  test('Bootstrap 数据写入失败应抛出 BOOTSTRAP_FAILED', async () => {
    // Arrange — 模拟 DB 插入失败
    const faultyDB = {
      insert: () => { throw new Error('duplicate key') },
      query: {}
    }
    const pluginCore = new PluginCore(faultyDB as any)

    // Act & Assert
    await expect(pluginCore.install()).rejects.toThrow('BOOTSTRAP_FAILED')
  })

  // DB_CONNECTION_FAILURE — 数据库连接不可用
  test('数据库连接失败应抛出 DB_CONNECTION_FAILURE', async () => {
    // Arrange
    const { app } = await createTestApp({
      dbUrl: 'postgres://invalid-host:5432/nonexistent',
    })
    
    // Act & Assert
    await expect(app.pluginCore.checkDB()).rejects.toThrow('DB_CONNECTION_FAILURE')
    await app.close()
  })
})
```

| 错误码 | 对应测试 | SDD 引用 |
|--------|---------|----------|
| `ALREADY_INSTALLED` | 重复安装同一插件 | plugin-core-sdd.md §5 |
| `BOOTSTRAP_FAILED` | Bootstrap 数据写入失败 | plugin-core-sdd.md §5 |
| `DB_CONNECTION_FAILURE` | 数据库连接不可用 | plugin-core-sdd.md §5 |

**与 plugin-framework 的共享错误码**：
- `NOT_FOUND` — 不存在的插件操作
- `LIFECYCLE_ERROR` — 生命周期钩子异常
- `MIGRATION_FAILED` — 迁移执行失败

> **上游 TDD 参考**: [shared-types-tdd.md §3.1](shared-types-tdd.md) — ErrorCode 枚举定义; [plugin-framework-tdd.md §11](plugin-framework-tdd.md) — 共享错误码
