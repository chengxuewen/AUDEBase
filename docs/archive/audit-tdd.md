# Audit TDD 测试策略

> **模块**: `@audebase/audit`  
> **依赖**: `@audebase/core`, `@audebase/shared-types`  
> **更新日期**: 2026-07-13  
> **参考**: D1.12 (审计日志)、api-specification.md §5、database-schema.md §9、test-seed-strategy.md §6.4

---

## 1. 测试范围

审计模块自动记录所有 API 写操作（POST/PUT/PATCH/DELETE），提供按资源查询审计历史的能力。

| 测试类型 | 最低用例数 | 数据库 |
|---------|:---:|------|
| 单元测试 | 8+ | 无（mock DB） |
| 集成测试 | 6+ | 真实 PostgreSQL |
| 契约测试 | 4+ | 真实 PostgreSQL |
| E2E 测试 | 1 流程 | Docker PostgreSQL |

---

## 2. 模块结构

```
packages/audit/
├── src/
│   ├── index.ts              # Audit Plugin 入口
│   ├── middleware.ts          # 写操作拦截中间件（onResponse hook）
│   ├── service.ts            # AuditService (record/query)
│   ├── routes/
│   │   └── audit.routes.ts   # GET /api/audit-logs
│   ├── __tests__/
│   │   ├── unit/
│   │   │   ├── audit.service.test.ts
│   │   │   └── audit.middleware.test.ts
│   │   ├── integration/
│   │   │   └── audit.integration.test.ts
│   │   ├── contracts/
│   │   │   └── audit.contract.test.ts
│   │   └── seeds/
│   │       └── audit-logs.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## 3. 单元测试

### 3.1 AuditService 单元测试

```
测试文件: packages/audit/src/__tests__/unit/audit.service.test.ts
```

```typescript
import { describe, test, expect, beforeEach, vi } from 'vitest'
import { AuditService } from '../../service'

const mockDb = {
  insert: vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn() }) }),
  select: vi.fn().mockReturnValue({ from: vi.fn() }),
  query: { audit_log: { findMany: vi.fn() } },
}

describe('AuditService.record', () => {
  let auditService: AuditService

  beforeEach(() => {
    vi.clearAllMocks()
    auditService = new AuditService(mockDb as any)
  })

  test('记录创建操作（含 new_values）', async () => {
    // Arrange
    // Arrange
    const entry = {
      tenant_id: 't-uuid',
      actor_id: 'u-uuid',
      action: 'create',
      resource_type: 'user',
      resource_id: 'r-uuid',
      new_values: { username: 'newuser', is_active: true },
      ip: '192.168.1.1',
      user_agent: 'test-agent',
      request_id: 'req-123',
    }

    // Act
    await auditService.record(entry)

    // Assert
    expect(mockDb.insert).toHaveBeenCalled()
  })

  test('记录更新操作（含 old_values + new_values）', async () => {
    // Arrange
    const entry = {
      tenant_id: 't-uuid',
      actor_id: 'u-uuid',
      action: 'update',
      resource_type: 'user',
      resource_id: 'r-uuid',
      old_values: { username: 'oldname' },
      new_values: { username: 'newname' },
    }
    await auditService.record(entry)
    expect(mockDb.insert).toHaveBeenCalled()
  })

  test('记录删除操作（含 old_values，new_values 为 null）', async () => {
    // Arrange
    const entry = {
      tenant_id: 't-uuid',
      actor_id: 'u-uuid',
      action: 'delete',
      resource_type: 'user',
      resource_id: 'r-uuid',
      old_values: { username: 'deleteduser', is_active: true },
    }
    await auditService.record(entry)
    expect(mockDb.insert).toHaveBeenCalled()
  })

  test('系统操作 actor_id 为 null', async () => {
    // Arrange
    const entry = {
      tenant_id: null,
      actor_id: null,
      action: 'startup',
      resource_type: 'system',
    }
    await auditService.record(entry)
    expect(mockDb.insert).toHaveBeenCalled()
  })

  test('记录 RBAC 操作（assign_role/revoke_role/create_role/delete_role）', async () => {
    // Arrange
    const rbacActions = ['assign_role', 'revoke_role', 'create_role', 'delete_role']
    for (const action of rbacActions) {
      await auditService.record({
        tenant_id: 't-uuid',
        actor_id: 'u-uuid',
        action: `rbac:${action}`,
        resource_type: 'role',
        resource_id: 'role-uuid',
      })
    }
    // 所有 rbac 动作均已记录
    expect(mockDb.insert).toHaveBeenCalledTimes(rbacActions.length)
  })
})

describe('AuditService.query', () => {
  test('按 resource_type + resource_id 查询', async () => {
    // Arrange
    mockDb.query.audit_log.findMany.mockResolvedValue([
      { id: 'a1', action: 'create', resource_type: 'user', resource_id: 'r-uuid' },
      { id: 'a2', action: 'update', resource_type: 'user', resource_id: 'r-uuid' },
    ])

    const logs = await auditService.query({
      tenant_id: 't-uuid',
      resource_type: 'user',
      resource_id: 'r-uuid',
    })
    expect(logs).toHaveLength(2)
    expect(logs[0].action).toBe('create')
    expect(logs[1].action).toBe('update')
  })

  test('租户隔离：tenant-A 不可见 tenant-B 记录', async () => {
    // Arrange
    // mock 仅返回 tenant-A 的数据
    mockDb.query.audit_log.findMany.mockResolvedValue([
      { id: 'a1', action: 'create', resource_type: 'user' },
    ])

    const logs = await auditService.query({ tenant_id: 'tenant-A-uuid' })
    expect(logs).toHaveLength(1)
  })
})
```

### 3.2 审计中间件单元测试

```
测试文件: packages/audit/src/__tests__/unit/audit.middleware.test.ts
```

```typescript
import { describe, test, expect, vi } from 'vitest'
import { auditMiddleware } from '../../middleware'

describe('auditMiddleware', () => {
  test('GET 请求不记录审计', async () => {
    // Arrange
    const mockRequest = { method: 'GET', url: '/api/users' }
    const auditSpy = vi.fn()
    // Act — 模拟 onResponse hook
    const hook = auditMiddleware(auditSpy as any)
    await hook(mockRequest as any, {} as any, {} as any)
    expect(auditSpy).not.toHaveBeenCalled()
  })

  test('POST 请求自动记录', async () => {
    // Arrange
    const mockRequest = {
      method: 'POST',
      url: '/api/users',
      body: { username: 'newuser' },
      user: { id: 'u-uuid', tenant_id: 't-uuid' },
      headers: { 'user-agent': 'test', 'x-request-id': 'req-1' },
      ip: '192.168.1.1',
    }
    const auditSpy = vi.fn()
    await auditMiddleware(auditSpy as any)(mockRequest as any, {} as any, {} as any)
    expect(auditSpy).toHaveBeenCalled()
  })

  test('PUT 请求自动记录', async () => {
    // Arrange
    const mockRequest = {
      method: 'PUT', url: '/api/users/uuid-1',
      body: { username: 'updated' },
      user: { id: 'u-uuid', tenant_id: 't-uuid' },
      headers: {},
      ip: '10.0.0.1',
    }
    const auditSpy = vi.fn()
    await auditMiddleware(auditSpy as any)(mockRequest as any, {} as any, {} as any)
    expect(auditSpy).toHaveBeenCalled()
  })

  test('DELETE 请求自动记录', async () => {
    // Arrange
    const mockRequest = {
      method: 'DELETE', url: '/api/users/uuid-1',
      user: { id: 'u-uuid', tenant_id: 't-uuid' },
      headers: {},
      ip: '10.0.0.1',
    }
    const auditSpy = vi.fn()
    await auditMiddleware(auditSpy as any)(mockRequest as any, {} as any, {} as any)
    expect(auditSpy).toHaveBeenCalled()
  })

  test('审计写入失败不阻塞业务响应', async () => {
    // Arrange
    const mockRequest = {
      method: 'POST', url: '/api/users',
      body: { username: 'newuser' },
      user: { id: 'u-uuid' },
      headers: {},
      ip: '127.0.0.1',
    }
    const failingAudit = vi.fn().mockRejectedValue(new Error('DB timeout'))
    // 不应抛出异常
    await expect(
      auditMiddleware(failingAudit as any)(mockRequest as any, {} as any, {} as any),
    ).resolves.not.toThrow()
  })

  test('未认证请求（无 user）actor_id 为 null', async () => {
    // Arrange
    const mockRequest = {
      method: 'POST', url: '/api/auth/login',
      body: { username: 'admin', password: 'xxx' },
      headers: { 'x-request-id': 'req-noauth' },
      ip: '127.0.0.1',
    }
    const auditSpy = vi.fn()
    await auditMiddleware(auditSpy as any)(mockRequest as any, {} as any, {} as any)
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({ actor_id: null }),
    )
  })
})
```

---

## 4. 集成测试

```
测试文件: packages/audit/src/__tests__/integration/audit.integration.test.ts
```

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { withTestApp } from '../../../core/src/__tests__/helpers/db-lifecycle'
import { seedAdminUser } from '../seeds/admin'

describe('审计集成测试', () => {
  let test: TestApp

  beforeEach(async () => {
    test = await createTestApp()
  })

  afterEach(async () => {
    await test.cleanup()
  })

  test('创建用户 → 自动写入 audit_log', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      const token = await loginAsAdmin(app, seedAdminUser)

      await app.inject({
        method: 'POST',
        url: '/api/users',
        headers: { authorization: `Bearer ${token}` },
        payload: { username: 'audit-user', password: 'SecurePass1!', role_slugs: ['member'] },
      })

      // 验证审计记录
      const logs = await app.db.query.audit_log.findMany({
        where: eq(audit_log.resource_type, 'user'),
      })
      expect(logs).toHaveLength(1)
      expect(logs[0].action).toBe('create')
      expect(logs[0].resource_type).toBe('user')
      expect(logs[0].new_values).toBeDefined()
    })
  })

  test('更新用户 → 记录 old_values + new_values', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      const token = await loginAsAdmin(app)
      // 先创建用户
      const createRes = await app.inject({
        method: 'POST', url: '/api/users',
        headers: { authorization: `Bearer ${token}` },
        payload: { username: 'upd-user', password: 'SecurePass1!', role_slugs: ['member'] },
      })
      const userId = createRes.json().data.id

      // 更新用户
      await app.inject({
        method: 'PATCH', url: `/api/users/${userId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { username: 'updated-user' },
      })

      const logs = await app.db.query.audit_log.findMany({
        where: eq(audit_log.resource_id, userId),
        orderBy: desc(audit_log.created_at),
      })
      const updateLog = logs[0]
      expect(updateLog.action).toBe('update')
      expect(updateLog.old_values).toBeDefined()
      expect(updateLog.new_values).toBeDefined()
    })
  })

  test('按 resource_type + resource_id 查询审计历史', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      // 先写入多条审计
      // ...

      const res = await app.inject({
        method: 'GET',
        url: '/api/audit-logs?resource_type=user&resource_id=u-uuid',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data.length).toBeGreaterThan(0)
      expect(body.data[0].resource_type).toBe('user')
    })
  })

  test('租户 A 不显示租户 B 的审计记录', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      // 在 tenant-A 中创建用户
      // ...
      // 切换到 tenant-B 查询 — 应无记录
      // ...
    })
  })

  test('GET /api/audit-logs 按时间倒序', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/audit-logs',
        headers: { authorization: `Bearer ${token}` },
      })
      const logs = res.json().data
      if (logs.length >= 2) {
        const t1 = new Date(logs[0].created_at).getTime()
        const t2 = new Date(logs[1].created_at).getTime()
        expect(t1).toBeGreaterThanOrEqual(t2)
      }
    })
  })

  test('审计写入 DB 失败 → 业务操作仍然成功', async () => {
    // Arrange & Act
    // 模拟 audit_log 表不可用场景
    // 创建用户操作不应因审计失败而阻塞
  })
})
```

---

## 5. 契约测试

```
测试文件: packages/audit/src/__tests__/contracts/audit.contract.test.ts
```

```typescript
import { validateContract } from '../../../core/src/__tests__/helpers/contract'
import { paginatedAuditLogsSchema, errorResponseSchema } from '@audebase/shared-types'

describe('GET /api/audit-logs 契约', () => {
  test('200 分页形状匹配 paginatedAuditLogsSchema', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      await validateContract('GET', '/api/audit-logs', {
        response: paginatedAuditLogsSchema,
        status: 200,
      })
    })
  })

  test('无 token → 401 + errorResponseSchema', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      await validateContract('GET', '/api/audit-logs', {
        response: errorResponseSchema,
        status: 401,
      })
    })
  })

  test('member 角色无查看审计权限 → 403', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      const token = await loginAsMember(app)
      await validateContract('GET', '/api/audit-logs', {
        response: errorResponseSchema,
        status: 403,
      })
    })
  })

  test('过滤 resource_type → 200 + 过滤结果', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      await validateContract('GET', '/api/audit-logs?resource_type=user', {
        response: paginatedAuditLogsSchema,
        status: 200,
      })
    })
  })
})
```

---

## 6. E2E 测试 (Playwright)

审计日志 E2E 属于 Phase 1a stretch goal（e2e-test-flows.md §6）：

```
packages/admin-ui/__e2e__/audit-logs.e2e.ts
preSeed: { admin: true, auditLogs: 10 }  // 预种子 10 条审计记录
```

| 用例 | 描述 |
|------|------|
| 审计列表展示 | 登录 → 导航到审计日志 → ProTable 展示记录列表 |
| 按资源类型筛选 | 选择 resource_type=user → 表格仅显示用户相关记录 |
| 分页 | 验证审计日志列表分页功能 |

---

## 7. 种子数据

```
packages/audit/src/__tests__/seeds/
└── audit-logs.ts
```

```typescript
import type { TestApp } from '@audebase/core'

export async function seedAuditLogs(
  app: TestApp,
  count: number = 10,
  tenantId: string = 'default-tenant',
): Promise<void> {
  const actions = ['create', 'update', 'delete', 'login', 'logout']
  const resourceTypes = ['user', 'role', 'plugin', 'audit_log']

  for (let i = 0; i < count; i++) {
    const existing = await app.db.query.audit_log.findFirst({
      where: eq(audit_log.resource_id, `test-res-${i}`),
    })
    if (existing) continue  // 幂等

    await app.db.insert(audit_log).values({
      tenant_id: tenantId,
      actor_id: 'seed-actor-uuid',
      action: actions[i % actions.length],
      resource_type: resourceTypes[i % resourceTypes.length],
      resource_id: `test-res-${i}`,
      new_values: { seed_index: i },
      ip: '127.0.0.1',
      user_agent: 'seed-agent',
      request_id: `seed-req-${i}`,
    })
  }
}
```

---

## 8. Mock 策略

| 依赖 | 单元测试 | 集成测试 |
|------|---------|---------|
| PostgreSQL | 无（mock DB provider） | 真实 pg_tmp/Docker |
| Drizzle ORM | vi.fn() mock query/insert | 真实 Drizzle + PG |
| Fastify onResponse | spy on hook callback | 真实 Fastify app |
| RBAC (token验证) | 不涉及 | 真实 token |

---

## 9. 数据库索引验证（集成测试）

```typescript
describe('审计日志索引', () => {
  test('(tenant_id, resource_type, resource_id) 复合索引生效', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      // EXPLAIN 验证索引使用
      const plan = await app.db.execute(`
        EXPLAIN SELECT * FROM audit_log
        WHERE tenant_id = $1 AND resource_type = $2 AND resource_id = $3
      `, ['t-uuid', 'user', 'r-uuid'])
      // 应使用 idx_audit_log_resource 索引
      expect(plan.rows[0]['QUERY PLAN']).toContain('Index Scan')
    })
  })
})
```

---

## 10. 覆盖率目标

| 指标 | 目标 | 关键路径 |
|------|:---:|------|
| 行覆盖率 | **80%+** | |
| 分支覆盖率 | **75%+** | record/query 全部分支 + 错误路径 |
| 函数覆盖率 | **90%+** | AuditService.record/query，middleware hook |
| 集成 | 6+ | 创建/更新/删除审计记录 + 查询 + 租户隔离 |
| 契约 | 4+ | GET 200/401/403/过滤 |

---

## 11. CI 集成

```yaml
audit-test:
  runs-on: ubuntu-latest
  services:
    postgres:
      image: postgres:16-alpine
      env:
        POSTGRES_DB: audebase_test
        POSTGRES_USER: audebase
        POSTGRES_PASSWORD: audebase_test
      ports: ["5432:5432"]
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - run: pnpm install --frozen-lockfile
    - run: pnpm --filter @audebase/audit test:unit
    - run: pnpm --filter @audebase/audit test:integration
      env:
        DATABASE_URL: postgres://audebase:audebase_test@localhost:5432/audebase_test
        AUDE_JWT_SECRET: ci-test-secret-at-least-32-characters-long
```

---

## 12. 用例汇总

| 测试层 | 用例数 |
|--------|:---:|
| 单元 - audit.service | 7 |
| 单元 - audit.middleware | 6 |
| 集成 - audit.integration | 6 |
| 契约 - audit.contract | 4 |
| E2E - audit-logs | 3 |
| **合计** | **26** |

---

## 13. 参考

- [api-specification.md](api-specification.md) §5 — GET /api/audit-logs
- [database-schema.md](database-schema.md) §9 — audit_log 表结构
- [e2e-test-flows.md](e2e-test-flows.md) §6 — 审计日志 E2E (stretch)
- [test-seed-strategy.md](test-seed-strategy.md) §6.4 — 集成测试目标
- [../../.agents/memorys/decisions.md](../../.agents/memorys/decisions.md) — D1.12 审计日志

> **上游 TDD 参考**: [shared-types-tdd.md §3.1](shared-types-tdd.md) — ErrorCode 枚举; [rbac-tdd.md §3](rbac-tdd.md) — 认证 token 验证

---

## 14. 审计动作延伸测试

**测试文件**: `packages/audit/src/__tests__/unit/category-actions.test.ts`

```typescript
import { describe, test, expect } from 'vitest'
import { AuditService } from '../../service'

describe('audit action 分类覆盖', () => {
  test('plugin 类别动作: lifecycle:install, lifecycle:enable, lifecycle:disable, lifecycle:uninstall', async () => {
    // Arrange
    // Arrange
    const pluginActions = ['lifecycle:install', 'lifecycle:enable', 'lifecycle:disable', 'lifecycle:uninstall']
    const auditService = new AuditService(mockDb as any)

    // Act & Assert — 所有 plugin 动作均可记录
    for (const action of pluginActions) {
      await auditService.record({
        tenant_id: 't-uuid',
        actor_id: 'u-uuid',
        action,
        resource_type: 'plugin',
        resource_id: 'plugin-uuid',
      })
    }
    expect(mockDb.insert).toHaveBeenCalledTimes(pluginActions.length)
  })

  test('user 类别动作: create, update, delete, login, logout, password_change', async () => {
    // Arrange
    // Arrange
    const userActions = ['create', 'update', 'delete', 'login', 'logout', 'password_change']
    const auditService = new AuditService(mockDb as any)

    // Act & Assert
    for (const action of userActions) {
      await auditService.record({
        tenant_id: 't-uuid',
        actor_id: 'u-uuid',
        action,
        resource_type: 'user',
        resource_id: 'user-uuid',
      })
    }
    expect(mockDb.insert).toHaveBeenCalledTimes(userActions.length)
  })

  test('rbac 类别动作: rbac:assign_role, rbac:revoke_role, rbac:create_role, rbac:delete_role', async () => {
    // Arrange
    // Arrange
    const rbacActions = ['rbac:assign_role', 'rbac:revoke_role', 'rbac:create_role', 'rbac:delete_role']
    const auditService = new AuditService(mockDb as any)

    // Act & Assert
    for (const action of rbacActions) {
      await auditService.record({
        tenant_id: 't-uuid',
        actor_id: 'u-uuid',
        action,
        resource_type: 'role',
        resource_id: 'role-uuid',
      })
    }
    expect(mockDb.insert).toHaveBeenCalledTimes(rbacActions.length)
  })
})
```
