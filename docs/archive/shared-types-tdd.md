# shared-types TDD 测试策略

> **模块**: `@audebase/shared-types`  
> **依赖**: 无（零依赖基础包）  
> **更新日期**: 2026-07-13  
> **参考**: test-seed-strategy.md §6.4（shared-types 无需集成测试）、dev-workflow.md §1.2（包依赖图）

---

## 1. 测试策略概述

`shared-types` 是纯类型定义包，不含数据库操作、不含 HTTP 端点、不含运行时副作用。测试重点是**类型编译验证 + Zod schema 单元测试 + ErrorCode 枚举值唯一性**。

| 测试类型 | 是否适用 | 说明 |
|---------|:---:|------|
| 单元测试 | ✅ | Zod schema 校验、ErrorCode 枚举、类型工具函数 |
| 集成测试 | ❌ | 无运行时依赖，无需集成测试 |
| 契约测试 | ❌ | 契约测试在消费端包（core/rbac/audit）中执行 |
| E2E 测试 | ❌ | 不涉及浏览器交互 |
| 编译时测试 | ✅ | TypeScript 类型检查等同于测试 |

---

## 2. 包结构

```
packages/shared-types/
├── src/
│   ├── index.ts              # barrel export
│   ├── plugin.types.ts       # Plugin, PluginHost, Manifest 接口
│   ├── rbac.types.ts         # User, Role, Permission 类型
│   ├── api.types.ts          # ApiResponse<T>, PaginatedResponse<T>, PaginationMeta
│   ├── errors.ts             # ErrorCode 枚举 + UserError/SystemError 类
│   ├── auth.types.ts         # LoginRequest, TokenResponse, RefreshRequest
│   ├── health.types.ts       # HealthResponse, ReadyResponse
│   └── __tests__/
│       ├── errors.test.ts
│       ├── schemas.test.ts
│       └── type-compilation.test.ts  # 编译时类型断言
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## 3. 单元测试

### 3.1 ErrorCode 枚举测试

```
测试文件: packages/shared-types/src/__tests__/errors.test.ts
```

```typescript
import { describe, test, expect } from 'vitest'
import { ErrorCode } from '../errors'

describe('ErrorCode 枚举', () => {
  test('所有错误码唯一且无重复值', () => {
    // Arrange
    const codes = Object.values(ErrorCode)
    const unique = new Set(codes)
    expect(unique.size).toBe(codes.length)
  })

  test('错误码命名使用 UPPER_SNAKE_CASE 格式', () => {
    // Arrange
    const codes = Object.values(ErrorCode) as string[]
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z][A-Z_]+[A-Z]$/)
    }
  })

  test('包含所有 api-conventions.md 定义的错误码', () => {
    // Arrange
    const expectedCodes = [
      'VALIDATION_ERROR',
      'AUTH_REQUIRED',
      'AUTH_INVALID_CREDENTIALS',
      'AUTH_TOKEN_EXPIRED',
      'AUTH_TOKEN_INVALID',
      'AUTH_MUST_CHANGE_PASSWORD',
      'FORBIDDEN',
      'NOT_FOUND',
      'CONFLICT',
      'RATE_LIMIT_EXCEEDED',
      'INTERNAL_ERROR',
      'DB_UNAVAILABLE',
      'REDIS_UNAVAILABLE',
    ]
    for (const ec of expectedCodes) {
      expect(ErrorCode[ec as keyof typeof ErrorCode]).toBeDefined()
    }
  })

  test('所有错误码均有 string 值（非数字）', () => {
    // Arrange
    const codes = Object.values(ErrorCode)
    for (const code of codes) {
      expect(typeof code).toBe('string')
    }
  })
})
```

### 3.2 UserError / SystemError 类测试

```typescript
import { describe, test, expect } from 'vitest'
import { ErrorCode, UserError, SystemError } from '../errors'

describe('UserError', () => {
  test('构造中包含 code + message + details', () => {
    // Arrange & Act
    const err = new UserError(
      ErrorCode.VALIDATION_ERROR,
      '用户名必填',
      { field: 'username' },
    )
    expect(err.code).toBe(ErrorCode.VALIDATION_ERROR)
    expect(err.message).toBe('用户名必填')
    expect(err.details).toEqual({ field: 'username' })
  })

  test('details 可选', () => {
    // Arrange & Act
    const err = new UserError(ErrorCode.NOT_FOUND, '资源不存在')
    expect(err.details).toBeUndefined()
  })

  test('继承自 Error', () => {
    // Arrange & Act
    const err = new UserError(ErrorCode.FORBIDDEN, '无权限')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(UserError)
  })

  test('toJSON 返回序列化格式', () => {
    // Arrange & Act
    const err = new UserError(ErrorCode.VALIDATION_ERROR, 'msg', { k: 'v' })
    const json = err.toJSON()
    expect(json).toEqual({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'msg',
      details: { k: 'v' },
    })
  })
})

describe('SystemError', () => {
  test('构造中包含 code + message + 原始错误', () => {
    // Arrange & Act
    const cause = new Error('db timeout')
    const err = new SystemError(ErrorCode.DB_UNAVAILABLE, '数据库连接超时', cause)
    expect(err.code).toBe(ErrorCode.DB_UNAVAILABLE)
    expect(err.message).toBe('数据库连接超时')
    expect(err.cause).toBe(cause)
  })

  test('继承自 Error', () => {
    // Arrange & Act
    const err = new SystemError(ErrorCode.INTERNAL_ERROR, '内部错误')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(SystemError)
  })

  test('toJSON 不暴露 cause 详情', () => {
    // Arrange & Act
    const cause = new Error('sensitive')
    const err = new SystemError(ErrorCode.DB_UNAVAILABLE, '数据库不可用', cause)
    const json = err.toJSON()
    expect(json).toEqual({
      code: ErrorCode.DB_UNAVAILABLE,
      message: '数据库不可用',
    })
    expect(json).not.toHaveProperty('cause')
  })
})
```

### 3.3 Zod Schema 单元测试

```
测试文件: packages/shared-types/src/__tests__/schemas.test.ts
```

```typescript
import { describe, test, expect } from 'vitest'
import {
  loginSchema,
  tokenResponseSchema,
  paginatedUsersSchema,
  healthResponseSchema,
  errorResponseSchema,
  createUserSchema,
  updateUserSchema,
  createRoleSchema,
} from '../schemas'  // 按 api-specification.md 定义

describe('loginSchema', () => {
  test('接受有效登录请求', () => {
    // Arrange & Act
    const result = loginSchema.safeParse({
      username: 'admin',
      password: 'Admin@123',
    })
    expect(result.success).toBe(true)
  })

  test('拒绝 username 过短', () => {
    // Arrange & Act
    const result = loginSchema.safeParse({
      username: 'ab',
      password: 'password123',
    })
    expect(result.success).toBe(false)
  })

  test('拒绝 password 过短', () => {
    // Arrange & Act
    const result = loginSchema.safeParse({
      username: 'admin',
      password: '1234567',
    })
    expect(result.success).toBe(false)
  })

  test('拒绝缺少必填字段', () => {
    // Arrange & Act
    const result = loginSchema.safeParse({ username: 'admin' })
    expect(result.success).toBe(false)
  })
})

describe('tokenResponseSchema', () => {
  test('接受有效 token 响应', () => {
    // Arrange & Act
    const result = tokenResponseSchema.safeParse({
      access_token: 'eyJ...',
      refresh_token: 'ref_...',
      expires_in: 900,
      token_type: 'Bearer',
    })
    expect(result.success).toBe(true)
  })

  test('拒绝 token_type 非 Bearer', () => {
    // Arrange & Act
    const result = tokenResponseSchema.safeParse({
      access_token: 'eyJ...',
      refresh_token: 'ref_...',
      expires_in: 900,
      token_type: 'Basic',
    })
    expect(result.success).toBe(false)
  })

  test('拒绝 expires_in 非正整数', () => {
    // Arrange & Act
    const result = tokenResponseSchema.safeParse({
      access_token: 'eyJ...',
      refresh_token: 'ref_...',
      expires_in: -1,
      token_type: 'Bearer',
    })
    expect(result.success).toBe(false)
  })
})

describe('paginatedUsersSchema', () => {
  test('接受有效分页响应', () => {
    // Arrange & Act
    const result = paginatedUsersSchema.safeParse({
      data: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          username: 'admin',
          is_active: true,
          created_at: '2026-07-13T10:00:00Z',
        },
      ],
      meta: {
        count: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      },
    })
    expect(result.success).toBe(true)
  })

  test('拒绝 data 中缺少 id', () => {
    // Arrange & Act
    const result = paginatedUsersSchema.safeParse({
      data: [{ username: 'admin', is_active: true, created_at: '2026-07-13T10:00:00Z' }],
      meta: { count: 1, page: 1, pageSize: 20, totalPages: 1 },
    })
    expect(result.success).toBe(false)
  })

  test('拒绝 id 非 UUID 格式', () => {
    // Arrange & Act
    const result = paginatedUsersSchema.safeParse({
      data: [
        { id: 'not-uuid', username: 'x', is_active: true, created_at: '2026-07-13T10:00:00Z' },
      ],
      meta: { count: 1, page: 1, pageSize: 20, totalPages: 1 },
    })
    expect(result.success).toBe(false)
  })
})

describe('healthResponseSchema', () => {
  test('接受有效健康检查响应', () => {
    // Arrange & Act
    const result = healthResponseSchema.safeParse({
      status: 'ok',
      db: true,
      redis: true,
      uptime: 86400,
      version: '0.1.0',
      timestamp: '2026-07-13T10:00:00Z',
    })
    expect(result.success).toBe(true)
  })

  test('redis 可选', () => {
    // Arrange & Act
    const result = healthResponseSchema.safeParse({
      status: 'ok',
      db: true,
      uptime: 0,
    })
    expect(result.success).toBe(true)
  })

  test('拒绝 status 非 ok', () => {
    // Arrange & Act
    const result = healthResponseSchema.safeParse({
      status: 'error',
      db: false,
      uptime: 0,
    })
    expect(result.success).toBe(false)
  })
})

describe('createUserSchema', () => {
  test('接受有效创建用户请求', () => {
    // Arrange & Act
    const result = createUserSchema.safeParse({
      username: 'newuser',
      password: 'SecurePass1!',
      role_slugs: ['member'],
      is_active: true,
    })
    expect(result.success).toBe(true)
  })

  test('拒绝 password 不符合复杂度', () => {
    // Arrange & Act
    const result = createUserSchema.safeParse({
      username: 'newuser',
      password: '12345678',
      role_slugs: ['member'],
    })
    expect(result.success).toBe(false)
  })

  test('拒绝空 role_slugs', () => {
    // Arrange & Act
    const result = createUserSchema.safeParse({
      username: 'newuser',
      password: 'SecurePass1!',
      role_slugs: [],
    })
    expect(result.success).toBe(false)
  })
})

describe('createRoleSchema', () => {
  test('接受有效创建角色请求', () => {
    // Arrange & Act
    const result = createRoleSchema.safeParse({
      name: '审计员',
      slug: 'auditor',
      description: '审计日志查看权限',
      permission_ids: ['perm-uuid-1', 'perm-uuid-2'],
    })
    expect(result.success).toBe(true)
  })

  test('拒绝 slug 非 snake_case', () => {
    // Arrange & Act
    const result = createRoleSchema.safeParse({
      name: '审计员',
      slug: 'Auditor Role',
      permission_ids: [],
    })
    expect(result.success).toBe(false)
  })
})
```

### 3.4 ApiResponse 泛型类型编译测试

```
测试文件: packages/shared-types/src/__tests__/type-compilation.test.ts
```

```typescript
import { describe, test, expectTypeOf } from 'vitest'
import type {
  User,
  Role,
  Permission,
  Plugin,
  Manifest,
} from '../index'
import type {
  ApiResponse,
  PaginatedResponse,
  PaginationMeta,
} from '../api.types'

describe('编译时类型断言（非运行时，由 TypeScript 编译器校验）', () => {
  test('ApiResponse<T> 结构正确', () => {
    // Arrange & Act
    expectTypeOf<ApiResponse<User>>().toMatchTypeOf<{
      data: User
    }>()
  })

  test('PaginatedResponse<T> 包含 data + meta', () => {
    // Arrange & Act
    expectTypeOf<PaginatedResponse<User>>().toMatchTypeOf<{
      data: User[]
      meta: PaginationMeta
    }>()
  })

  test('PaginationMeta 字段完整', () => {
    // Arrange & Act
    expectTypeOf<PaginationMeta>().toMatchTypeOf<{
      count: number
      page: number
      pageSize: number
      totalPages: number
    }>()
  })

  test('User 接口包含所有必填字段', () => {
    // Arrange & Act
    expectTypeOf<User>().toMatchTypeOf<{
      id: string
      username: string
      password_hash: string
      token_version: number
      is_active: boolean
      must_change_password: boolean
      created_at: string
      updated_at: string
    }>()
  })

  test('Role 接口包含所有必填字段', () => {
    // Arrange & Act
    expectTypeOf<Role>().toMatchTypeOf<{
      id: string
      tenant_id: string | null
      name: string
      slug: string
      description: string | null
      is_system: boolean
      created_at: string
      updated_at: string
    }>()
  })

  test('Permission 接口包含 action + resource', () => {
    // Arrange & Act
    expectTypeOf<Permission>().toMatchTypeOf<{
      id: string
      action: string
      resource: string
      description: string | null
    }>()
  })

  test('Plugin 接口包含所有必填字段', () => {
    // Arrange & Act
    expectTypeOf<Plugin>().toMatchTypeOf<{
      id: string
      name: string
      version: string
      display_name: string
      status: string
      category: string | null
      description: string | null
    }>()
  })
})
```

---

## 4. Schema 定义文件结构

所有 Zod schema 在 `shared-types/src/schemas/` 中定义，按领域组织：

```
shared-types/src/schemas/
├── index.ts          # barrel export
├── auth.ts           # loginSchema, tokenResponseSchema, refreshSchema
├── users.ts          # createUserSchema, updateUserSchema, paginatedUsersSchema
├── roles.ts          # createRoleSchema, updateRoleSchema, paginatedRolesSchema
├── permissions.ts    # paginatedPermissionsSchema
├── plugins.ts        # paginatedPluginsSchema
├── audit.ts          # paginatedAuditLogsSchema
├── health.ts         # healthResponseSchema, readyResponseSchema
├── errors.ts         # errorResponseSchema
└── common.ts         # paginationMetaSchema, uuidSchema, tenantIdSchema
```

---

## 5. 覆盖率目标

| 指标 | 目标 | 说明 |
|------|:---:|------|
| 行覆盖率 | 95%+ | 全为纯函数/Zod schema，无副作用 |
| 分支覆盖率 | 90%+ | Zod refine/transform 所有分支 |
| 函数覆盖率 | 100% | 每个导出函数至少一个测试 |
| ErrorCode | 100% | 每个错误码枚举值在测试中引用 |

---

## 6. CI 集成

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'shared-types',
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      thresholds: {
        lines: 95,
        branches: 90,
        functions: 100,
      },
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],  // barrel export 无需覆盖
    },
  },
})
```

```json
// package.json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit"
  }
}
```

CI pipeline:
```yaml
shared-types-test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - run: pnpm install --frozen-lockfile
    - run: pnpm --filter @audebase/shared-types typecheck
    - run: pnpm --filter @audebase/shared-types test:coverage
```

---

## 7. 参考

- [api-conventions.md](api-conventions.md) §11 — ErrorCode 枚举定义
- [api-specification.md](api-specification.md) — 端点请求/响应格式
- [database-schema.md](database-schema.md) — 表结构（决定 User/Role/Permission 类型字段）
- [dev-workflow.md](dev-workflow.md) §1.2 — 包依赖图（shared-types 零依赖）
- [test-seed-strategy.md](test-seed-strategy.md) §6.4 — shared-types 无需集成测试
