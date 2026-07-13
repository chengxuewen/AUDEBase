# RBAC TDD 测试策略

> **模块**: `@audebase/rbac`  
> **依赖**: `@audebase/core`, `@audebase/shared-types`  
> **更新日期**: 2026-07-13  
> **参考**: D8.1 (JWT密钥管理)、D10 (Record Rules)、D11 (字段级权限)、api-specification.md §1-3、database-schema.md §3-8

---

## 1. 测试策略概述

RBAC 模块覆盖认证、授权、用户/角色/权限 CRUD，是 Phase 1a 核心安全基础设施。测试策略分四层：

```
┌──────────────────────────────────────────────────────┐
│  E2E (Playwright) — 登录/用户管理/角色管理完整流程      │
├──────────────────────────────────────────────────────┤
│  契约测试 — 所有 API 端点响应形状 + 错误路径            │
├──────────────────────────────────────────────────────┤
│  集成测试 — DB→ORM→API→JWT 完整链路 + 真实 PostgreSQL  │
├──────────────────────────────────────────────────────┤
│  单元测试 — AuthService/RBACService/middleware 纯逻辑   │
└──────────────────────────────────────────────────────┘
```

| 测试类型 | 最低用例数 | 数据库 |
|---------|:---:|------|
| 单元测试 | 18+ | ioredis-mock |
| 集成测试 | 15+ | 真实 PostgreSQL |
| 契约测试 | 9+ | 真实 PostgreSQL |
| E2E 测试 | 4 流程 | Docker PostgreSQL |

---

## 2. 模块结构

```
packages/rbac/
├── src/
│   ├── index.ts              # RBAC Plugin 入口
│   ├── middleware.ts          # ACL 检查中间件 (verifyToken + checkPermission)
│   ├── service.ts             # RBACService (can/assignRole/revokeRole)
│   ├── auth.service.ts        # AuthService (login/refresh/logout)
│   ├── routes/
│   │   ├── auth.routes.ts     # /api/auth/login, /api/auth/refresh, /api/auth/logout
│   │   ├── users.routes.ts    # /api/users CRUD
│   │   └── roles.routes.ts    # /api/roles CRUD, /api/permissions
│   ├── __tests__/
│   │   ├── unit/
│   │   │   ├── auth.service.test.ts
│   │   │   ├── rbac.service.test.ts
│   │   │   ├── middleware.test.ts
│   │   │   └── token.test.ts
│   │   ├── integration/
│   │   │   ├── auth.integration.test.ts
│   │   │   ├── users.integration.test.ts
│   │   │   └── roles.integration.test.ts
│   │   ├── contracts/
│   │   │   ├── auth.contract.test.ts
│   │   │   ├── users.contract.test.ts
│   │   │   └── roles.contract.test.ts
│   │   └── seeds/
│   │       ├── admin.ts
│   │       ├── tenant.ts
│   │       └── roles.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## 3. 单元测试

### 3.1 AuthService 单元测试

```
测试文件: packages/rbac/src/__tests__/unit/auth.service.test.ts
```

```typescript
import { describe, test, expect, beforeEach } from 'vitest'
import { AuthService } from '../../auth.service'
import { ErrorCode } from '@audebase/shared-types'

// 使用 mock DB provider 隔离数据库依赖
const mockDb = {
  query: {
    users: {
      findFirst: vi.fn(),
    },
  },
  insert: vi.fn(),
  update: vi.fn(),
}

describe('AuthService.login', () => {
  let authService: AuthService

  beforeEach(() => {
    vi.clearAllMocks()
    authService = new AuthService(mockDb as any, 'test-jwt-secret-at-least-32-chars!!!')
  })

  test('有效凭据返回 access_token + refresh_token', async () => {
    // Arrange
    // Arrange
    const hashedPw = '$2b$10$...' // bcrypt hash of 'Admin@123'
    mockDb.query.users.findFirst.mockResolvedValue({
      id: 'user-uuid-1',
      username: 'admin',
      password_hash: hashedPw,
      token_version: 0,
      is_active: true,
      must_change_password: false,
      tenant_id: null,
    })

    // Act
    const result = await authService.login('admin', 'Admin@123', '127.0.0.1', 'test-agent')

    // Assert
    expect(result.access_token).toBeTruthy()
    expect(result.refresh_token).toBeTruthy()
    expect(result.expires_in).toBe(900)  // 15 分钟
    expect(result.token_type).toBe('Bearer')
  })

  test('无效密码返回 AUTH_INVALID_CREDENTIALS', async () => {
    // Arrange & Act
    mockDb.query.users.findFirst.mockResolvedValue({
      id: 'user-uuid-1',
      username: 'admin',
      password_hash: '$2b$10$...',
      token_version: 0,
      is_active: true,
      must_change_password: false,
    })

    await expect(
      authService.login('admin', 'wrong-password', '127.0.0.1', 'test-agent'),
    ).rejects.toMatchObject({ code: ErrorCode.AUTH_INVALID_CREDENTIALS })
  })

  test('不存在的用户返回 AUTH_INVALID_CREDENTIALS', async () => {
    // Arrange & Act
    mockDb.query.users.findFirst.mockResolvedValue(undefined)

    await expect(
      authService.login('nobody', 'whatever', '127.0.0.1', 'test-agent'),
    ).rejects.toMatchObject({ code: ErrorCode.AUTH_INVALID_CREDENTIALS })
  })

  test('禁用用户返回 AUTH_INVALID_CREDENTIALS', async () => {
    // Arrange & Act
    mockDb.query.users.findFirst.mockResolvedValue({
      id: 'user-uuid-1',
      username: 'disabled-user',
      password_hash: '$2b$10$...',
      token_version: 0,
      is_active: false,
    })

    await expect(
      authService.login('disabled-user', 'Admin@123', '127.0.0.1', 'test-agent'),
    ).rejects.toMatchObject({ code: ErrorCode.AUTH_INVALID_CREDENTIALS })
  })

  test('首次登录强制修改密码返回 AUTH_MUST_CHANGE_PASSWORD', async () => {
    // Arrange & Act
    mockDb.query.users.findFirst.mockResolvedValue({
      id: 'user-uuid-1',
      username: 'new-admin',
      password_hash: '$2b$10$...',
      token_version: 0,
      is_active: true,
      must_change_password: true,
    })

    await expect(
      authService.login('new-admin', 'Admin@123', '127.0.0.1', 'test-agent'),
    ).rejects.toMatchObject({ code: ErrorCode.AUTH_MUST_CHANGE_PASSWORD })
  })

  test('记录登录审计日志', async () => {
    // Arrange & Act
    mockDb.query.users.findFirst.mockResolvedValue({
      id: 'user-uuid-1',
      username: 'admin',
      password_hash: '$2b$10$...',
      token_version: 0,
      is_active: true,
      must_change_password: false,
    })

    const auditSpy = vi.fn()
    authService.setAuditLogger(auditSpy)

    await authService.login('admin', 'Admin@123', '192.168.1.1', 'Mozilla/5.0')
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      action: 'login',
      actor_id: 'user-uuid-1',
      ip: '192.168.1.1',
      user_agent: 'Mozilla/5.0',
    }))
  })
})

describe('AuthService.refresh', () => {
  test('有效 refresh_token 返回新 access_token', async () => { /* Arrange & Act & Assert - TODO: expand stub */ })
  test('过期 refresh_token 返回 AUTH_TOKEN_EXPIRED', async () => { /* Arrange & Act & Assert - TODO: expand stub */ })
  test('已撤销 refresh_token 返回 AUTH_TOKEN_INVALID', async () => { /* Arrange & Act & Assert - TODO: expand stub */ })
  test('token_version 不匹配返回 AUTH_TOKEN_INVALID (token 撤回)', async () => { /* Arrange & Act & Assert - TODO: expand stub */ })
})

describe('AuthService.logout', () => {
  test('撤销当前 refresh_token', async () => { /* Arrange & Act & Assert - TODO: expand stub */ })
  test('token_version +1 使所有旧 token 失效', async () => { /* Arrange & Act & Assert - TODO: expand stub */ })
})
```

### 3.2 RBACService 单元测试

```
测试文件: packages/rbac/src/__tests__/unit/rbac.service.test.ts
```

```typescript
import { describe, test, expect, beforeEach } from 'vitest'
import { RBACService } from '../../service'
import { ErrorCode } from '@audebase/shared-types'

describe('RBACService.can', () => {
  let rbacService: RBACService

  beforeEach(() => {
    rbacService = new RBACService(mockDb as any)
  })

  test('admin 角色拥有所有权限', async () => {
    // Arrange & Act
    mockDb.query.role_permissions.findMany.mockResolvedValue([
      { permission: { action: 'manage', resource: '*' } },
    ])
    const result = await rbacService.can('user-uuid-1', 'manage', 'plugin')
    expect(result).toBe(true)
  })

  test('member 角色仅拥有 read 权限', async () => {
    // Arrange & Act
    mockDb.query.role_permissions.findMany.mockResolvedValue([
      { permission: { action: 'read', resource: 'user' } },
    ])
    const result = await rbacService.can('user-uuid-2', 'create', 'user')
    expect(result).toBe(false)
  })

  test('多角色权限取并集', async () => {
    // Arrange & Act
    mockDb.query.role_permissions.findMany.mockResolvedValue([
      { permission: { action: 'read', resource: 'audit_log' } },
      { permission: { action: 'read', resource: 'user' } },
    ])
    const canReadUser = await rbacService.can('user-uuid-3', 'read', 'user')
    const canReadAudit = await rbacService.can('user-uuid-3', 'read', 'audit_log')
    const canDelete = await rbacService.can('user-uuid-3', 'delete', 'user')
    expect(canReadUser).toBe(true)
    expect(canReadAudit).toBe(true)
    expect(canDelete).toBe(false)
  })

  test('无角色的用户无任何权限', async () => {
    // Arrange & Act
    mockDb.query.role_permissions.findMany.mockResolvedValue([])
    const result = await rbacService.can('user-uuid-4', 'read', 'user')
    expect(result).toBe(false)
  })
})

describe('RBACService.assignRole', () => {
  test('为用户分配角色', async () => { /* Arrange & Act & Assert - TODO: expand stub */ })
  test('重复分配同一角色幂等', async () => { /* Arrange & Act & Assert - TODO: expand stub */ })
  test('写入 rbac:assign_role 审计日志', async () => { /* Arrange & Act & Assert - TODO: expand stub */ })
})

describe('RBACService.revokeRole', () => {
  test('撤销用户角色', async () => { /* Arrange & Act & Assert - TODO: expand stub */ })
  test('撤销不存在角色不报错', async () => { /* Arrange & Act & Assert - TODO: expand stub */ })
  test('is_system 角色不可撤销（admin/member）', async () => { /* Arrange & Act & Assert - TODO: expand stub */ })
})
```

### 3.3 ACL 中间件单元测试

```
测试文件: packages/rbac/src/__tests__/unit/middleware.test.ts
```

```typescript
import { describe, test, expect, beforeEach } from 'vitest'
import { aclMiddleware } from '../../middleware'

describe('aclMiddleware', () => {
  let mockRequest: any
  let mockReply: any

  beforeEach(() => {
    mockReply = {
      code: vi.fn().mockReturnThis(),
      send: vi.fn(),
    }
  })

  test('无 Authorization 头返回 401', async () => {
    // Arrange & Act
    mockRequest = { headers: {}, routeConfig: { acl: { action: 'read', resource: 'user' } } }
    await aclMiddleware(mockRequest, mockReply)
    expect(mockReply.code).toHaveBeenCalledWith(401)
    expect(mockReply.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'AUTH_REQUIRED' }) }),
    )
  })

  test('无效 token 返回 401', async () => {
    // Arrange & Act
    mockRequest = {
      headers: { authorization: 'Bearer invalid-token' },
      routeConfig: { acl: { action: 'read', resource: 'user' } },
    }
    await aclMiddleware(mockRequest, mockReply)
    expect(mockReply.code).toHaveBeenCalledWith(401)
  })

  test('过期 token 返回 401', async () => {
    // Arrange & Act
    mockRequest = {
      headers: { authorization: 'Bearer expired-token' },
      routeConfig: { acl: { action: 'read', resource: 'user' } },
    }
    await aclMiddleware(mockRequest, mockReply)
    expect(mockReply.code).toHaveBeenCalledWith(401)
    expect(mockReply.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'AUTH_TOKEN_EXPIRED' }) }),
    )
  })

  test('有 token 但无权限返回 403', async () => {
    // Arrange & Act
    mockRequest = {
      headers: { authorization: 'Bearer valid-member-token' },
      routeConfig: { acl: { action: 'delete', resource: 'user' } },
      user: { id: 'user-uuid-member' },
    }
    // RBACService.can 返回 false
    mockRbacService.can.mockResolvedValue(false)
    await aclMiddleware(mockRequest, mockReply)
    expect(mockReply.code).toHaveBeenCalledWith(403)
    expect(mockReply.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'FORBIDDEN' }) }),
    )
  })

  test('有效 token + 有权限 → next()', async () => {
    // Arrange & Act
    const next = vi.fn()
    mockRequest = {
      headers: { authorization: 'Bearer valid-admin-token' },
      routeConfig: { acl: { action: 'manage', resource: 'plugin' } },
      user: { id: 'user-uuid-admin' },
    }
    mockRbacService.can.mockResolvedValue(true)
    await aclMiddleware(mockRequest, mockReply)
    // 应调用 next() 而非 reply.code()
    expect(next).toHaveBeenCalled()
  })
})
```

### 3.4 JWT Token 单元测试

```
测试文件: packages/rbac/src/__tests__/unit/token.test.ts
```

```typescript
import { describe, test, expect } from 'vitest'
import { signToken, verifyToken } from '../../token'

const TEST_SECRET = 'test-secret-at-least-32-characters-long-!!'

describe('JWT token 签名与验证', () => {
  test('签名后可验证', () => {
    // Arrange & Act
    const payload = { sub: 'user-uuid-1', token_version: 0, tenant_id: null }
    const token = signToken(payload, TEST_SECRET, '15m')
    const decoded = verifyToken(token, TEST_SECRET)
    expect(decoded.sub).toBe('user-uuid-1')
    expect(decoded.token_version).toBe(0)
  })

  test('错误密钥验证失败', () => {
    // Arrange & Act
    const payload = { sub: 'user-uuid-1', token_version: 0 }
    const token = signToken(payload, TEST_SECRET, '15m')
    expect(() => verifyToken(token, 'different-secret-at-least-32-chars')).toThrow()
  })

  test('过期 token 验证失败', async () => {
    // Arrange & Act
    const payload = { sub: 'user-uuid-1', token_version: 0 }
    const token = signToken(payload, TEST_SECRET, '0s')  // 立即过期
    // 等待 1ms 确保时钟差异无影响
    await new Promise(r => setTimeout(r, 100))
    expect(() => verifyToken(token, TEST_SECRET)).toThrow(/expired/i)
  })

  test('access_token 15 分钟过期', () => {
    // Arrange & Act
    const payload = { sub: 'user-uuid-1', token_version: 0 }
    const token = signToken(payload, TEST_SECRET, '15m')
    const decoded = verifyToken(token, TEST_SECRET)
    const issuedAt = decoded.iat!
    const expiresAt = decoded.exp!
    expect(expiresAt - issuedAt).toBe(900) // 15 * 60 = 900 秒
  })

  test('refresh_token 7 天过期', () => {
    // Arrange & Act
    const payload = { sub: 'user-uuid-1', token_version: 0 }
    const token = signToken(payload, TEST_SECRET, '7d')
    const decoded = verifyToken(token, TEST_SECRET)
    expect(decoded.exp! - decoded.iat!).toBe(7 * 24 * 60 * 60)
  })

  test('拒绝密钥长度 < 32 字符 (D8.1)', () => {
    // Arrange & Act
    expect(() => signToken({ sub: 'x' }, 'short', '15m')).toThrow(/密钥长度/i)
  })
})
```

---

## 4. 集成测试

### 4.1 Auth 集成测试

```
测试文件: packages/rbac/src/__tests__/integration/auth.integration.test.ts
```

测试真实 PostgreSQL + 完整 HTTP 请求/响应链路：

```typescript
import { describe, test, expect, beforeEach } from 'vitest'
import { withTestApp } from '../../../core/src/__tests__/helpers/db-lifecycle'
import { seedAdminUser } from '../seeds/admin'

describe('POST /api/auth/login (集成)', () => {
  test('正常登录 → 200 + access_token (含 DB 验证)', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      await seedAdminUser(app)
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'admin', password: 'Admin@123' },
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.access_token).toBeTruthy()
      expect(body.refresh_token).toBeTruthy()
      expect(body.expires_in).toBe(900)
    })
  })

  test('错误密码 → 401', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      await seedAdminUser(app)
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'admin', password: 'wrong' },
      })
      expect(res.statusCode).toBe(401)
      expect(res.json().error.code).toBe('AUTH_INVALID_CREDENTIALS')
    })
  })

  test('登录成功后 refresh_token 可刷新', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      await seedAdminUser(app)
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'admin', password: 'Admin@123' },
      })
      const { refresh_token } = loginRes.json()

      const refreshRes = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refresh_token },
      })
      expect(refreshRes.statusCode).toBe(200)
      expect(refreshRes.json().access_token).toBeTruthy()
    })
  })

  test('登出后 refresh_token 失效', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      await seedAdminUser(app)
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'admin', password: 'Admin@123' },
      })
      const { access_token, refresh_token } = loginRes.json()

      // 登出
      await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: { authorization: `Bearer ${access_token}` },
        payload: { refresh_token },
      })

      // 相同 refresh_token 不可再用
      const refreshRes = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refresh_token },
      })
      expect(refreshRes.statusCode).toBe(401)
    })
  })
})
```

### 4.2 Users 集成测试

```
测试文件: packages/rbac/src/__tests__/integration/users.integration.test.ts
```

```typescript
describe('用户管理集成测试', () => {
  test('创建用户 → 201 + DB 写入验证', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      const token = await loginAsAdmin(app)
      const res = await app.inject({
        method: 'POST',
        url: '/api/users',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          username: 'new-editor',
          password: 'SecurePass1!',
          role_slugs: ['member'],
        },
      })
      expect(res.statusCode).toBe(201)

      // 验证 DB 写入
      const user = await app.db.query.users.findFirst({
        where: eq(users.username, 'new-editor'),
      })
      expect(user).toBeTruthy()
      expect(user!.is_active).toBe(true)
      expect(user!.must_change_password).toBe(true)  // 首次登录强制改密
    })
  })

  test('创建用户时 username 重复 → 409', async () => { /* Arrange & Act & Assert - TODO: expand stub */ })
  test('分页列表 → 200 + meta 分页信息', async () => { /* Arrange & Act & Assert - TODO: expand stub */ })
  test('过滤 username → 精确匹配', async () => { /* Arrange & Act & Assert - TODO: expand stub */ })
  test('更新用户信息 → 200 + 字段变更 + 审计日志', async () => { /* Arrange & Act & Assert - TODO: expand stub */ })
  test('删除用户 → 204 + 软删除(is_active=false) + 审计日志', async () => { /* Arrange & Act & Assert - TODO: expand stub */ })
  test('无 token 访问 → 401', async () => { /* Arrange & Act & Assert - TODO: expand stub */ })
  test('member 创建用户 → 403', async () => { /* Arrange & Act & Assert - TODO: expand stub */ })
  test('多租户: tenant-A 用户不可见 tenant-B 用户', async () => { /* Arrange & Act & Assert - TODO: expand stub */ })
})
```

### 4.3 Roles 集成测试

```typescript
describe('角色管理集成测试', () => {
  test('创建角色 → 201 + 分配权限', async () => { /* Arrange & Act & Assert - TODO: expand stub */ })
  test('修改角色权限 → 200 + 权限变更', async () => { /* Arrange & Act & Assert - TODO: expand stub */ })
  test('is_system 角色不可删除 → 403', async () => { /* Arrange & Act & Assert - TODO: expand stub */ })
  test('角色列表包含 admin/member 系统角色', async () => { /* Arrange & Act & Assert - TODO: expand stub */ })
  test('删除角色后 user_roles 关联清理', async () => { /* Arrange & Act & Assert - TODO: expand stub */ })
  test('权限列表按 resource 分组', async () => { /* Arrange & Act & Assert - TODO: expand stub */ })
})
```

---

## 5. 契约测试

遵循 test-seed-strategy.md §7 契约格式：

```typescript
// packages/rbac/src/__tests__/contracts/auth.contract.test.ts
import { validateContract } from '../../../core/src/__tests__/helpers/contract'
import { loginSchema, tokenResponseSchema, errorResponseSchema } from '@audebase/shared-types'

describe('POST /api/auth/login 契约', () => {
  test('200 响应形状匹配 tokenResponseSchema', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      await seedAdminUser(app)
      await validateContract('POST', '/api/auth/login', {
        request: loginSchema,
        response: tokenResponseSchema,
        status: 200,
      })
    })
  })

  test('缺少 password → 400 + errorResponseSchema', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      await validateContract('POST', '/api/auth/login', {
        response: errorResponseSchema,
        status: 400,
      })
    })
  })

  test('无效凭据 → 401 + errorResponseSchema', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      await seedAdminUser(app)
      await validateContract('POST', '/api/auth/login', {
        response: errorResponseSchema,
        status: 401,
      })
    })
  })
})

// packages/rbac/src/__tests__/contracts/users.contract.test.ts
describe('GET /api/users 契约', () => {
  test('200 分页形状匹配 paginatedUsersSchema', async () => { /* Arrange & Act & Assert - TODO: expand stub */ })
  test('无 token → 401 + errorResponseSchema', async () => { /* Arrange & Act & Assert - TODO: expand stub */ })
})

// packages/rbac/src/__tests__/contracts/roles.contract.test.ts
describe('GET /api/roles 契约', () => {
  test('200 分页形状匹配 paginatedRolesSchema', async () => { /* Arrange & Act & Assert - TODO: expand stub */ })
  test('无 token → 401 + errorResponseSchema', async () => { /* Arrange & Act & Assert - TODO: expand stub */ })
})
```

---

## 6. E2E 测试 (Playwright)

参考 e2e-test-flows.md 已定义的流程：

| 流程 | 文件 | preSeed | 验证点 |
|------|------|------|--------|
| 认证 | `packages/admin-ui/__e2e__/auth.e2e.ts` | `{ admin: true }` | 登录/错误密码/速率限制/Token刷新 |
| 用户管理 | `packages/admin-ui/__e2e__/users.e2e.ts` | `{ admin: true, tenant: 'e2e-tenant', users: [...] }` | CRUD + 分页 |
| 角色管理 | `packages/admin-ui/__e2e__/roles.e2e.ts` | `{ admin: true, roles: ['admin', 'member'] }` | 创建/分配权限/列表 |
| 权限隔离 | `packages/admin-ui/__e2e__/rbac.e2e.ts` | `{ admin: true, tenant: 'e2e', users: [{ role: 'member' }] }` | admin 全菜单 vs member 部分菜单 |

---

## 7. 种子数据

```
packages/rbac/src/__tests__/seeds/
├── admin.ts        # seedAdminUser()
├── tenant.ts       # seedTestTenant()
├── roles.ts        # seedAdminRole() + seedMemberRole()
└── permissions.ts  # seedDefaultPermissions()
```

```typescript
// seeds/admin.ts
export async function seedAdminUser(testApp: TestApp) {
  // 先检查是否存在（幂等）
  const existing = await testApp.db.query.users.findFirst({
    where: eq(users.username, 'admin'),
  })
  if (existing) return existing

  return testApp.db.insert(users).values({
    username: 'admin',
    password_hash: await hash('Admin@123'),
    token_version: 0,
    is_active: true,
    must_change_password: false,
    tenant_id: null,
  }).returning().get()
}

// seeds/roles.ts
export async function seedAdminRole(testApp: TestApp) { /* Arrange & Act & Assert - TODO: expand stub */ }
export async function seedMemberRole(testApp: TestApp) { /* Arrange & Act & Assert - TODO: expand stub */ }
```

---

## 8. Mock 策略

| 依赖 | 单元测试 | 集成测试 |
|------|---------|---------|
| PostgreSQL | 不涉及（mock DB provider） | 真实 pg_tmp/Docker |
| Redis | ioredis-mock (token 黑名单无需 Redis) | 可选真实 Redis |
| AuditService | vi.fn() spy | 真实 audit 中间件 |
| bcrypt | 真实 bcrypt (单元测试无外部依赖) | 真实 bcrypt |

---

## 9. 覆盖率目标

| 指标 | 目标 | 关键覆盖路径 |
|------|:---:|------|
| 行覆盖率 | **85%+** | |
| 分支覆盖率 | **80%+** | 权限判断所有分支 (allow/deny) |
| 函数覆盖率 | **90%+** | AuthService/RBACService 所有公开方法 |
| Auth 路径 | 100% | 登录成功/失败/过期/撤回/首次改密 |
| RBAC 路径 | 100% | can/assignRole/revokeRole 所有分支 |
| 中间件 | 100% | 无token/无效token/过期/权限不足/通过 |

---

## 10. CI 集成

```yaml
rbac-test:
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
    - run: pnpm --filter @audebase/rbac test:unit
    - run: pnpm --filter @audebase/rbac test:integration
      env:
        DATABASE_URL: postgres://audebase:audebase_test@localhost:5432/audebase_test
        AUDE_JWT_SECRET: ci-test-secret-at-least-32-characters-long
    - run: pnpm --filter @audebase/rbac test:contract
      env:
        DATABASE_URL: postgres://audebase:audebase_test@localhost:5432/audebase_test
        AUDE_JWT_SECRET: ci-test-secret-at-least-32-characters-long
```

---

## 11. 用例汇总

| 测试层 | 文件 | 用例数 |
|--------|------|:---:|
| 单元 | `auth.service.test.ts` | 8 |
| 单元 | `rbac.service.test.ts` | 6 |
| 单元 | `middleware.test.ts` | 5 |
| 单元 | `token.test.ts` | 6 |
| 集成 | `auth.integration.test.ts` | 5 |
| 集成 | `users.integration.test.ts` | 9 |
| 集成 | `roles.integration.test.ts` | 6 |
| 契约 | `auth.contract.test.ts` | 3 |
| 契约 | `users.contract.test.ts` | 3 |
| 契约 | `roles.contract.test.ts` | 3 |
| E2E | `auth.e2e.ts` | 4 |
| E2E | `users.e2e.ts` | 4 |
| E2E | `roles.e2e.ts` | 3 |
| E2E | `rbac.e2e.ts` | 2 |
| **合计** | | **67+** |

---

## 12. 参考

- [api-specification.md](api-specification.md) §1-3 — 认证/用户/角色 端点定义
- [database-schema.md](database-schema.md) §3-8 — users/roles/permissions/user_roles/role_permissions/refresh_tokens 表结构
- [test-seed-strategy.md](test-seed-strategy.md) — 种子数据工厂约定 + 集成测试边界
- [e2e-test-flows.md](e2e-test-flows.md) — auth/users/roles/rbac E2E 流程
- [redis-mock-guide.md](redis-mock-guide.md) — createTestApp + ioredis-mock
- [../../.agents/memorys/decisions.md](../../.agents/memorys/decisions.md) — D8.1 JWT密钥、D10 Record Rules、D11 字段级权限
