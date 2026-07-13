# 测试 Seed Data 策略

> 参照: Odoo `env.ref()` + ERPNext `test_records`

## 种子数据工厂

每个包在 `src/__tests__/seeds/` 目录下提供工厂函数：

```typescript
// core/src/__tests__/seeds/admin.ts
export async function seedAdminUser(testApp: TestApp) {
  const admin = await testApp.db.insert(users).values({
    username: 'admin',
    password_hash: await hash('Admin@123'),
    token_version: 0,
    is_active: true,
  }).returning().get()
  return admin
}

// core/src/__tests__/seeds/tenant.ts
export async function seedTestTenant(testApp: TestApp, slug = 'test-corp') {
  return testApp.db.insert(tenants).values({
    slug,
    name: 'Test Corporation',
    status: 'active',
  }).returning().get()
}
```

## createTestApp 增强

```typescript
const app = await createTestApp({
  seeds: {
    admin: true,           // seed admin user
    tenant: 'test-corp',   // seed tenant with slug
  },
})

// 引用种子数据
const admin = await app.db.query.users.findFirst({
  where: eq(users.username, 'admin'),
})
```

## 约定

| 规则 | 详情 |
|------|------|
| 目录结构 | `packages/*/src/__tests__/seeds/*.ts` |
| 命名 | `seed{Noun}()` |
| 幂等性 | 先检查记录是否存在，避免重复 |
| 隔离 | `createTestApp()` 提供独立 DB 事务 (BEGIN/ROLLBACK) |
| 共享 seed | shared-types 包提供通用 seed 工具 |

## 6. 集成测试边界

### 6.1 需要集成测试的层边界

| 边界 | 路径 | 测试目标 |
|------|------|----------|
| DB -> ORM | Drizzle schema -> PostgreSQL | 确认 schema 定义与实际表结构一致 |
| DB -> Migration | 迁移 SQL -> 表变更 | 确认 migration 正确修改 schema 和数据 |
| API -> DB | HTTP 端点 -> Drizzle 查询 | 确认请求经过完整中间件链写入数据库 |
| Auth -> JWT | 登录 -> token 签发 -> 验证 | 确认 JWT 签发/验证/刷新链路 |
| Config -> env | `@fastify/env` schema -> 环境变量 | 确认启动时校验缺失变量时报错 |
| RateLimit -> IP | 速率限制中间件 -> 请求计数 | 确认超限返回 429（含 ErrorCode） |

### 6.2 最小用例数

每个模块边界至少 **2 个集成测试用例**：

| 边界 | 最小用例数 |
|------|:----------:|
| DB -> ORM | 2+ |
| DB -> Migration | 2+ |
| API -> DB | 3+（GET + POST + 错误路径） |
| Auth -> JWT | 3+（签发 + 验证 + 过期） |
| Config -> env | 2+ |
| RateLimit -> IP | 2+ |

### 6.3 测试数据库生命周期

所有集成测试在单个数据库事务中运行，确保零副作用：

```typescript
// core/src/__tests__/helpers/db-lifecycle.ts
import { type TestApp, createTestApp } from './create-test-app'

export async function withTestApp(
  fn: (app: TestApp) => Promise<void>,
): Promise<void> {
  const app = await createTestApp()
  await app.db.transaction(async (tx) => {
    try {
      await fn(app.withTransaction(tx))
      await tx.rollback() // 始终回滚，无副作用
    } catch (error: unknown) {
      await tx.rollback()
      throw error
    }
  })
}
```

**生命周期**: `createTestApp` -> `seed` -> `test` -> `rollback transaction` -> `teardown`

### 6.4 各模块集成测试目标

| 模块 | 包名 | 集成测试目标 |
|------|------|-------------|
| shared-types | `@audebase/shared-types` | 无（纯类型定义，无需集成测试） |
| core | `@audebase/core` | app 启动 + `/health` 端点 + 速率限制 |
| migration | `@audebase/migration` | 完整三阶段执行（preload/postsync/postload）+ `--dry-run` |
| rbac | `@audebase/rbac` | auth 登录流程 + 角色 CRUD + 权限检查 |
| audit | `@audebase/audit` | 写操作产生审计记录 + 按资源查询审计历史 |
| i18n | `@audebase/i18n` | `t()` 翻译调用 + namespace 隔离 |
| plugin-core | `@audebase/plugin-core` | bootstrap 初始化 admin 用户 + 默认角色 + 租户 |
| cli | `@audebase/cli` | `aude db:migrate` + `aude plugin:create` |

### 6.5 Phase 1a 环境要求

| 组件 | 要求 |
|------|------|
| 数据库 | **真实 PostgreSQL**（不允许 SQLite mock）。测试前通过 `pg_tmp` 或 Docker 创建临时数据库，测试完成销毁。 |
| Redis | **允许 mock**。使用 `ioredis-mock` 替代真实 Redis，避免测试间 key 污染。 |
| 文件系统 | 使用 `os.tmpdir()` 临时目录，测试结束自动清理。 |

理由：PostgreSQL 特性（RETURNING、事务性 DDL、JSONB）与 SQLite 差异显著，mock 会掩盖迁移兼容性问题。Redis 的 mock 足够覆盖 `SET/GET/DEL/EXPIRE` 操作，不必要在测试中运行真实 Redis。

## 7. API 契约测试格式

### 7.1 定义

契约测试验证 API 端点的**响应形状**与 Zod schema 匹配，而非验证具体数据值。

**区分于 E2E 测试**：
- 契约测试：验证响应结构（字段名、类型、嵌套形状）
- E2E 测试：验证浏览器中用户可见行为

### 7.2 格式

```typescript
// 契约测试专用辅助函数
import { z } from 'zod'
import { ErrorCode } from '@audebase/shared-types'

interface ContractTestOptions {
  request?: z.ZodType<unknown>
  response: z.ZodType<unknown>
  status: number
}

export async function validateContract(
  method: string,
  endpoint: string,
  opts: ContractTestOptions,
): Promise<void> {
  // 1. 如果提供了 request schema，先验证请求体
  // 2. 发送 HTTP 请求到测试 app
  // 3. 用 opts.response schema 解析响应 body
  // 4. Zod parse 成功 = 契约通过；失败 = 契约不匹配
  // 5. 验证 HTTP 状态码 === opts.status
}
```

**调用示例**：

```typescript
// auth/login
import { describe, it } from 'vitest'

describe('POST /auth/login', () => {
  it('返回有效 token 响应', async () => {
    await withTestApp(async (app) => {
      await validateContract('POST', '/auth/login', {
        request: loginSchema,
        response: tokenResponseSchema,
        status: 200,
      })
    })
  })
})

// users CRUD
describe('GET /api/users', () => {
  it('返回分页用户列表', async () => {
    await withTestApp(async (app) => {
      // 先种子数据
      await seedAdminUser(app)
      await validateContract('GET', '/api/users', {
        response: paginatedUsersSchema,
        status: 200,
      })
    })
  })
})

// health check
describe('GET /health', () => {
  it('返回健康状态', async () => {
    await withTestApp(async (app) => {
      await validateContract('GET', '/health', {
        response: healthResponseSchema,
        status: 200,
      })
    })
  })
})
```

### 7.3 Request/Response Schema 定义

```typescript
// shared-types/src/schemas/auth.ts
import { z } from 'zod'

export const loginSchema = z.object({
  username: z.string().min(3).max(100),
  password: z.string().min(8),
})

export const tokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number().int().positive(),
  token_type: z.literal('Bearer'),
})

// shared-types/src/schemas/users.ts
export const paginatedUsersSchema = z.object({
  data: z.array(z.object({
    id: z.string().uuid(),
    username: z.string(),
    is_active: z.boolean(),
    created_at: z.string().datetime(),
  })),
  meta: z.object({
    count: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalPages: z.number().int().nonnegative(),
  }),
})

// shared-types/src/schemas/health.ts
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  db: z.boolean(),
  redis: z.boolean().optional(),
  uptime: z.number().nonnegative(),
})

// shared-types/src/schemas/errors.ts
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.nativeEnum(ErrorCode),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
})
```

### 7.4 错误路径契约

```typescript
describe('POST /auth/login 错误路径', () => {
  it('缺少必填字段返回 VALIDATION_ERROR', async () => {
    await withTestApp(async (app) => {
      await validateContract('POST', '/auth/login', {
        response: errorResponseSchema,
        status: 400,
      })
    })
  })

  it('无效凭据返回 AUTH_INVALID_CREDENTIALS', async () => {
    await withTestApp(async (app) => {
      // 发送错误的用户名密码
      await validateContract('POST', '/auth/login', {
        response: errorResponseSchema,
        status: 401,
      })
    })
  })
})

describe('GET /api/users 未认证', () => {
  it('无 token 返回 AUTH_REQUIRED', async () => {
    await withTestApp(async (app) => {
      await validateContract('GET', '/api/users', {
        response: errorResponseSchema,
        status: 401,
      })
    })
  })
})
```

### 7.5 契约测试组织约定

| 规则 | 详情 |
|------|------|
| 目录 | `packages/*/src/__tests__/contracts/` |
| 文件命名 | `{module}.contract.test.ts`（如 `auth.contract.test.ts`） |
| 运行方式 | `pnpm test:contract`（仅运行 contracts 目录） |
| CI | 每次 PR 运行全量契约测试 |
| Schema 存放 | `@audebase/shared-types/schemas/` — 前后端共享 |
