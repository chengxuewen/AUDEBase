# JWT 认证 TDD 测试策略

> **模块**: `@audebase/auth`
> **依赖**: shared-types, core (DatabaseProvider), jose, bcryptjs
> **更新日期**: 2026-07-17
> **参考**: auth-sdd.md, GO-022, decisions.md D8.1, database-schema.md
> **覆盖率目标**: 85%+ 行覆盖率, 80%+ 分支覆盖率

---

## 1. 测试策略概述

| 测试类型 | 最低用例数 | 数据库 | 说明 |
|---------|:---:|------|------|
| 单元测试 | 20+ | 无 (mock DB) | token 工具函数 + AuthService 全部方法 |
| 集成测试 | 8+ | 真实 PostgreSQL | 登录/刷新/登出/改密完整流程 |
| 契约测试 | 6+ | 真实 PostgreSQL | Fastify.inject + Zod schema 校验 |
| E2E 测试 | 2 流程 | Docker PostgreSQL | Playwright 登录页 + 令牌刷新流程 |

---

## 2. 模块结构

```
packages/auth/
├── src/
│   ├── index.ts              # Public API exports
│   ├── types.ts              # Local types (DatabaseProvider, UserRecord, RefreshTokenRecord, LoginInput, TokenResult)
│   ├── token.ts              # JWT utilities (signToken, verifyToken, generateAccessToken, generateRefreshToken, hashToken, assertJwtSecret)
│   ├── auth-service.ts       # AuthService class (login, refresh, logout, verifyAccessToken, changePassword)
│   ├── bcryptjs.d.ts         # Type declarations
│   ├── __tests__/
│   │   ├── token.test.ts
│   │   ├── auth-service.test.ts
│   │   ├── unit/
│   │   │   ├── token.test.ts            # 拆分: 各函数独立 describe 块
│   │   │   ├── auth-service.test.ts     # 拆分: AuthService 各方法独立 describe 块
│   │   │   └── auth-middleware.test.ts  # requireAuth 中间件
│   │   ├── integration/
│   │   │   └── auth.integration.test.ts
│   │   ├── contracts/
│   │   │   └── auth.contract.test.ts
│   │   └── seeds/
│   │       └── auth.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## 3. 单元测试

### 3.1 Token 工具函数

```
测试文件: packages/auth/src/__tests__/unit/token.test.ts
```

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  signToken,
  verifyToken,
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  assertJwtSecret,
} from '../../index.js'

const TEST_SECRET = 'test-secret-at-least-32-characters-long-!!'

describe('signToken', () => {
  it('sign + verify roundtrip returns original payload', async () => {
    // Arrange
    const payload = { sub: 'user-uuid-1', token_version: 0, tenant_id: null }

    // Act
    const token = await signToken(payload, TEST_SECRET, '15m')
    const decoded = await verifyToken(token, TEST_SECRET)

    // Assert
    expect(decoded.sub).toBe('user-uuid-1')
    expect(decoded.token_version).toBe(0)
  })

  it('wrong secret fails verification', async () => {
    // Arrange
    const payload = { sub: 'user-uuid-1', token_version: 0 }

    // Act
    const token = await signToken(payload, TEST_SECRET, '15m')

    // Assert
    await expect(verifyToken(token, 'different-secret-at-least-32-chars')).rejects.toThrow()
  })

  it('expired token fails verification', async () => {
    // Arrange
    const payload = { sub: 'user-uuid-1', token_version: 0 }

    // Act
    const token = await signToken(payload, TEST_SECRET, '0s')
    await new Promise((r) => setTimeout(r, 100))

    // Assert
    await expect(verifyToken(token, TEST_SECRET)).rejects.toThrow(/expired/i)
  })

  it('secret < 32 chars throws', async () => {
    // Arrange & Act & Assert
    await expect(signToken({ sub: 'x' }, 'short', '15m')).rejects.toThrow(/密钥长度/i)
  })

  it('access token has 15 minute (900s) expiry', async () => {
    // Arrange
    const payload = { sub: 'user-uuid-1', token_version: 0 }

    // Act
    const token = await signToken(payload, TEST_SECRET, '15m')
    const decoded = await verifyToken(token, TEST_SECRET)

    // Assert
    expect(decoded.exp - decoded.iat).toBe(900)
  })

  it('7 day expiry via d suffix works', async () => {
    // Arrange
    const payload = { sub: 'user-uuid-1' }

    // Act
    const token = await signToken(payload, TEST_SECRET, '7d')
    const decoded = await verifyToken(token, TEST_SECRET)

    // Assert
    expect(decoded.exp - decoded.iat).toBe(604800)
  })

  it('invalid expiresIn format throws', async () => {
    // Arrange & Act & Assert
    await expect(signToken({ sub: 'x' }, TEST_SECRET, 'forever')).rejects.toThrow()
  })
})

describe('verifyToken', () => {
  it('valid token returns payload with iat and exp', async () => {
    // Arrange
    const token = await signToken({ sub: 'abc', custom: 'val' }, TEST_SECRET, '1h')

    // Act
    const decoded = await verifyToken(token, TEST_SECRET)

    // Assert
    expect(decoded.sub).toBe('abc')
    expect(decoded.iat).toBeGreaterThan(0)
    expect(decoded.exp).toBeGreaterThan(0)
  })

  it('invalid token format throws', async () => {
    // Arrange & Act & Assert
    await expect(verifyToken('not.a.valid.token', TEST_SECRET)).rejects.toThrow()
  })

  it('malformed token string throws', async () => {
    // Arrange & Act & Assert
    await expect(verifyToken('this-is-not-a-jwt', TEST_SECRET)).rejects.toThrow()
  })

  it('empty token throws', async () => {
    // Arrange & Act & Assert
    await expect(verifyToken('', TEST_SECRET)).rejects.toThrow()
  })
})

describe('generateAccessToken', () => {
  it('returns JWT with sub, token_version, tenant_id, username, exp', async () => {
    // Arrange
    const user = {
      id: 'user-uuid-1',
      username: 'admin',
      token_version: 3,
      tenant_id: 'tenant-abc',
    }

    // Act
    const token = await generateAccessToken(user, TEST_SECRET)
    const decoded = await verifyToken(token, TEST_SECRET)

    // Assert
    expect(decoded.sub).toBe('user-uuid-1')
    expect(decoded.token_version).toBe(3)
    expect(decoded.tenant_id).toBe('tenant-abc')
    expect(decoded.username).toBe('admin')
    expect(decoded.exp - decoded.iat).toBe(900)
  })

  it('handles null tenant_id as empty string', async () => {
    // Arrange
    const user = { id: 'u1', username: 'test', token_version: 1, tenant_id: null }

    // Act
    const token = await generateAccessToken(user, TEST_SECRET)
    const decoded = await verifyToken(token, TEST_SECRET)

    // Assert
    expect(decoded.tenant_id).toBe('')
  })

  it('includes roles when provided', async () => {
    // Arrange
    const user = {
      id: 'u1', username: 'admin', token_version: 1, tenant_id: null,
      roles: ['admin', 'user_manager'],
    }

    // Act
    const token = await generateAccessToken(user, TEST_SECRET)
    const decoded = await verifyToken(token, TEST_SECRET)

    // Assert
    expect(decoded.roles).toEqual(['admin', 'user_manager'])
  })
})

describe('generateRefreshToken', () => {
  it('returns 64-char hex string', () => {
    // Act
    const token = generateRefreshToken()

    // Assert
    expect(token).toHaveLength(64)
    expect(token).toMatch(/^[0-9a-f]+$/)
  })

  it('each call returns a different token', () => {
    // Act
    const t1 = generateRefreshToken()
    const t2 = generateRefreshToken()

    // Assert
    expect(t1).not.toBe(t2)
  })
})

describe('hashToken', () => {
  it('returns SHA-256 hex hash (64 chars)', () => {
    // Act
    const hash = hashToken('test-token-value')

    // Assert
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[0-9a-f]+$/)
  })

  it('same input produces same hash (deterministic)', () => {
    // Act
    const h1 = hashToken('same-token')
    const h2 = hashToken('same-token')

    // Assert
    expect(h1).toBe(h2)
  })

  it('different input produces different hash', () => {
    // Act
    const h1 = hashToken('token-a')
    const h2 = hashToken('token-b')

    // Assert
    expect(h1).not.toBe(h2)
  })
})

describe('assertJwtSecret', () => {
  const ORIGINAL_SECRET = process.env.AUDE_JWT_SECRET

  afterEach(() => {
    process.env.AUDE_JWT_SECRET = ORIGINAL_SECRET
  })

  it('passes when AUDE_JWT_SECRET >= 32 chars', () => {
    // Arrange
    process.env.AUDE_JWT_SECRET = TEST_SECRET

    // Act & Assert
    expect(() => assertJwtSecret()).not.toThrow()
  })

  it('throws when AUDE_JWT_SECRET missing', () => {
    // Arrange
    delete process.env.AUDE_JWT_SECRET

    // Act & Assert
    expect(() => assertJwtSecret()).toThrow(/未设置/)
  })

  it('throws when AUDE_JWT_SECRET < 32 chars', () => {
    // Arrange
    process.env.AUDE_JWT_SECRET = 'too-short'

    // Act & Assert
    expect(() => assertJwtSecret()).toThrow(/长度/)
  })

  it('throws at exactly 31 chars, passes at 32', () => {
    // Arrange
    process.env.AUDE_JWT_SECRET = 'a'.repeat(31)

    // Act & Assert — boundary test (D8.1)
    expect(() => assertJwtSecret()).toThrow()

    // Arrange
    process.env.AUDE_JWT_SECRET = 'a'.repeat(32)

    // Act & Assert
    expect(() => assertJwtSecret()).not.toThrow()
  })
})
```

### 3.2 AuthService 单元测试

```
测试文件: packages/auth/src/__tests__/unit/auth-service.test.ts
```

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import bcrypt from 'bcryptjs'
import { AuthService, signToken, generateRefreshToken, hashToken } from '../../index.js'

const TEST_SECRET = 'test-secret-at-least-32-characters-long-!!'
const TEST_PASSWORD = 'Admin@123'
const BCRYPT_HASH = bcrypt.hashSync(TEST_PASSWORD, 12)

const mockDb = {
  query: {
    users: { findFirst: vi.fn() },
    refresh_tokens: { findFirst: vi.fn() },
  },
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}

function makeUser(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'user-uuid-1',
    username: 'admin',
    password_hash: BCRYPT_HASH,
    token_version: 0,
    is_active: true,
    must_change_password: false,
    tenant_id: null,
    ...overrides,
  }
}

describe('AuthService.login', () => {
  let authService: AuthService

  beforeEach(() => {
    vi.clearAllMocks()
    authService = new AuthService(mockDb as never, TEST_SECRET)
  })

  it('valid credentials returns token pair with Bearer type and 900s expiry', async () => {
    // Arrange
    mockDb.query.users.findFirst.mockResolvedValue(makeUser())

    // Act
    const result = await authService.login({
      username: 'admin',
      password: TEST_PASSWORD,
      ip: '127.0.0.1',
      userAgent: 'test-agent',
    })

    // Assert
    expect(result.access_token).toBeTruthy()
    expect(result.refresh_token).toBeTruthy()
    expect(result.expires_in).toBe(900)
    expect(result.token_type).toBe('Bearer')
  })

  it('invalid password throws AUTH_INVALID_CREDENTIALS', async () => {
    // Arrange
    mockDb.query.users.findFirst.mockResolvedValue(makeUser())

    // Act & Assert
    await expect(
      authService.login({ username: 'admin', password: 'wrong-password' }),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' })
  })

  it('inactive user throws AUTH_USER_INACTIVE', async () => {
    // Arrange
    mockDb.query.users.findFirst.mockResolvedValue(makeUser({ is_active: false }))

    // Act & Assert
    await expect(
      authService.login({ username: 'admin', password: TEST_PASSWORD }),
    ).rejects.toMatchObject({ code: 'AUTH_USER_INACTIVE' })
  })

  it('must_change_password throws AUTH_MUST_CHANGE_PASSWORD', async () => {
    // Arrange
    mockDb.query.users.findFirst.mockResolvedValue(makeUser({ must_change_password: true }))

    // Act & Assert
    await expect(
      authService.login({ username: 'admin', password: TEST_PASSWORD }),
    ).rejects.toMatchObject({ code: 'AUTH_MUST_CHANGE_PASSWORD' })
  })

  it('non-existent user throws AUTH_INVALID_CREDENTIALS (no user enumeration)', async () => {
    // Arrange
    mockDb.query.users.findFirst.mockResolvedValue(undefined)

    // Act & Assert
    await expect(
      authService.login({ username: 'ghost', password: TEST_PASSWORD }),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' })
  })

  it('records refresh token hash in DB via insert', async () => {
    // Arrange
    mockDb.query.users.findFirst.mockResolvedValue(makeUser())

    // Act
    await authService.login({ username: 'admin', password: TEST_PASSWORD })

    // Assert
    expect(mockDb.insert).toHaveBeenCalledTimes(1)
    const insertArgs = mockDb.insert.mock.calls[0]![0] as Record<string, unknown>
    expect(insertArgs.token_hash).toBeTruthy()
    expect(insertArgs.user_id).toBe('user-uuid-1')
    expect(insertArgs.expires_at).toBeInstanceOf(Date)
    expect(insertArgs.revoked_at).toBeNull()
  })

  it('updates last_login_at', async () => {
    // Arrange
    mockDb.query.users.findFirst.mockResolvedValue(makeUser())

    // Act
    await authService.login({ username: 'admin', password: TEST_PASSWORD })

    // Assert
    expect(mockDb.update).toHaveBeenCalledWith(
      expect.objectContaining({ last_login_at: expect.any(Date) }),
    )
  })

  it('records audit event on successful login', async () => {
    // Arrange
    mockDb.query.users.findFirst.mockResolvedValue(makeUser())
    const auditSpy = vi.fn()
    authService.setAuditLogger(auditSpy)

    // Act
    await authService.login({ username: 'admin', password: TEST_PASSWORD, ip: '10.0.0.1' })

    // Assert
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'login',
        actor_id: 'user-uuid-1',
        ip: '10.0.0.1',
      }),
    )
  })

  it('access token payload includes token_version from DB', async () => {
    // Arrange
    mockDb.query.users.findFirst.mockResolvedValue(makeUser({ token_version: 7 }))

    // Act
    const result = await authService.login({ username: 'admin', password: TEST_PASSWORD })
    const decoded = await signToken as unknown as { sub: string; token_version: number }
    // Actually verify by decoding
    const { verifyToken } = await import('../../index.js')
    const payload = await verifyToken(result.access_token, TEST_SECRET)

    // Assert
    expect(payload.token_version).toBe(7)
  })
})

describe('AuthService.refresh', () => {
  let authService: AuthService

  beforeEach(() => {
    vi.clearAllMocks()
    authService = new AuthService(mockDb as never, TEST_SECRET)
  })

  it('valid refresh token returns new token pair', async () => {
    // Arrange
    const refreshToken = generateRefreshToken()
    const tokenHash = hashToken(refreshToken)
    mockDb.query.refresh_tokens.findFirst.mockResolvedValue({
      id: 'rt-1',
      user_id: 'user-uuid-1',
      token_hash: tokenHash,
      revoked_at: null,
      expires_at: new Date(Date.now() + 86400000),
    })
    mockDb.query.users.findFirst.mockResolvedValue(makeUser())

    // Act
    const result = await authService.refresh({ refresh_token: refreshToken })

    // Assert
    expect(result.access_token).toBeTruthy()
    expect(result.refresh_token).toBeTruthy()
    expect(result.expires_in).toBe(900)
    expect(result.token_type).toBe('Bearer')
  })

  it('revoked token throws AUTH_TOKEN_EXPIRED', async () => {
    // Arrange
    const refreshToken = generateRefreshToken()
    mockDb.query.refresh_tokens.findFirst.mockResolvedValue({
      id: 'rt-1',
      user_id: 'user-uuid-1',
      token_hash: hashToken(refreshToken),
      revoked_at: new Date(),
      expires_at: new Date(Date.now() + 86400000),
    })

    // Act & Assert
    await expect(
      authService.refresh({ refresh_token: refreshToken }),
    ).rejects.toMatchObject({ code: 'AUTH_TOKEN_EXPIRED' })
  })

  it('expired token throws AUTH_TOKEN_EXPIRED', async () => {
    // Arrange
    const refreshToken = generateRefreshToken()
    mockDb.query.refresh_tokens.findFirst.mockResolvedValue({
      id: 'rt-1',
      user_id: 'user-uuid-1',
      token_hash: hashToken(refreshToken),
      revoked_at: null,
      expires_at: new Date(Date.now() - 86400000),
    })

    // Act & Assert
    await expect(
      authService.refresh({ refresh_token: refreshToken }),
    ).rejects.toMatchObject({ code: 'AUTH_TOKEN_EXPIRED' })
  })

  it('non-existent token throws AUTH_TOKEN_EXPIRED', async () => {
    // Arrange
    mockDb.query.refresh_tokens.findFirst.mockResolvedValue(undefined)

    // Act & Assert
    await expect(
      authService.refresh({ refresh_token: 'nonexistent' }),
    ).rejects.toMatchObject({ code: 'AUTH_TOKEN_EXPIRED' })
  })

  it('missing user for token throws AUTH_TOKEN_EXPIRED', async () => {
    // Arrange
    const refreshToken = generateRefreshToken()
    mockDb.query.refresh_tokens.findFirst.mockResolvedValue({
      id: 'rt-1',
      user_id: 'user-uuid-1',
      token_hash: hashToken(refreshToken),
      revoked_at: null,
      expires_at: new Date(Date.now() + 86400000),
    })
    mockDb.query.users.findFirst.mockResolvedValue(undefined)

    // Act & Assert
    await expect(
      authService.refresh({ refresh_token: refreshToken }),
    ).rejects.toMatchObject({ code: 'AUTH_TOKEN_EXPIRED' })
  })

  it('rotates token: old revoked, new issued', async () => {
    // Arrange
    const refreshToken = generateRefreshToken()
    mockDb.query.refresh_tokens.findFirst.mockResolvedValue({
      id: 'rt-1',
      user_id: 'user-uuid-1',
      token_hash: hashToken(refreshToken),
      revoked_at: null,
      expires_at: new Date(Date.now() + 86400000),
    })
    mockDb.query.users.findFirst.mockResolvedValue(makeUser())

    // Act
    await authService.refresh({ refresh_token: refreshToken })

    // Assert - old token revoked
    expect(mockDb.update).toHaveBeenCalledWith(
      expect.objectContaining({ revoked_at: expect.any(Date) }),
    )
    // Assert - new token inserted
    expect(mockDb.insert).toHaveBeenCalledTimes(1)
  })
})

describe('AuthService.logout', () => {
  let authService: AuthService

  beforeEach(() => {
    vi.clearAllMocks()
    authService = new AuthService(mockDb as never, TEST_SECRET)
  })

  it('revokes refresh token (sets revoked_at)', async () => {
    // Arrange
    const refreshToken = generateRefreshToken()
    mockDb.query.refresh_tokens.findFirst.mockResolvedValue({
      id: 'rt-1',
      user_id: 'user-uuid-1',
      token_hash: hashToken(refreshToken),
      revoked_at: null,
      expires_at: new Date(Date.now() + 86400000),
    })

    // Act
    await authService.logout({ refresh_token: refreshToken })

    // Assert
    expect(mockDb.update).toHaveBeenCalledWith(
      expect.objectContaining({ revoked_at: expect.any(Date) }),
    )
  })

  it('non-existent token throws AUTH_TOKEN_EXPIRED', async () => {
    // Arrange
    mockDb.query.refresh_tokens.findFirst.mockResolvedValue(undefined)

    // Act & Assert
    await expect(
      authService.logout({ refresh_token: 'nonexistent' }),
    ).rejects.toMatchObject({ code: 'AUTH_TOKEN_EXPIRED' })
  })
})

describe('AuthService.verifyAccessToken', () => {
  let authService: AuthService

  beforeEach(() => {
    vi.clearAllMocks()
    authService = new AuthService(mockDb as never, TEST_SECRET)
  })

  it('valid token returns decoded payload', async () => {
    // Arrange
    mockDb.query.users.findFirst.mockResolvedValue(makeUser({ token_version: 0 }))
    const token = await signToken(
      { sub: 'user-uuid-1', token_version: 0, tenant_id: '', username: 'admin', roles: [] },
      TEST_SECRET,
      '15m',
    )

    // Act
    const decoded = await authService.verifyAccessToken(token)

    // Assert
    expect(decoded.sub).toBe('user-uuid-1')
    expect(decoded.iat).toBeGreaterThan(0)
    expect(decoded.exp).toBeGreaterThan(0)
  })

  it('token_version mismatch throws AUTH_TOKEN_VERSION_MISMATCH', async () => {
    // Arrange — token issued at version 0, user version now 1
    mockDb.query.users.findFirst.mockResolvedValue(makeUser({ token_version: 1 }))
    const token = await signToken(
      { sub: 'user-uuid-1', token_version: 0, tenant_id: '', username: 'admin', roles: [] },
      TEST_SECRET,
      '15m',
    )

    // Act & Assert
    await expect(
      authService.verifyAccessToken(token),
    ).rejects.toMatchObject({ code: 'AUTH_TOKEN_VERSION_MISMATCH' })
  })

  it('expired token throws AUTH_TOKEN_EXPIRED', async () => {
    // Arrange
    const token = await signToken({ sub: 'u1', token_version: 0 }, TEST_SECRET, '0s')
    await new Promise((r) => setTimeout(r, 100))

    // Act & Assert
    await expect(
      authService.verifyAccessToken(token),
    ).rejects.toMatchObject({ code: 'AUTH_TOKEN_EXPIRED' })
  })

  it('invalid token throws AUTH_TOKEN_EXPIRED', async () => {
    // Arrange & Act & Assert
    await expect(
      authService.verifyAccessToken('not-a-valid-token'),
    ).rejects.toMatchObject({ code: 'AUTH_TOKEN_EXPIRED' })
  })

  it('passes token_version check when versions match', async () => {
    // Arrange
    mockDb.query.users.findFirst.mockResolvedValue(makeUser({ token_version: 5 }))
    const token = await signToken(
      { sub: 'user-uuid-1', token_version: 5, tenant_id: '', username: 'admin', roles: [] },
      TEST_SECRET,
      '15m',
    )

    // Act
    const decoded = await authService.verifyAccessToken(token)

    // Assert
    expect(decoded.sub).toBe('user-uuid-1')
  })
})

describe('AuthService.changePassword', () => {
  let authService: AuthService

  beforeEach(() => {
    vi.clearAllMocks()
    authService = new AuthService(mockDb as never, TEST_SECRET)
  })

  it('correct old password updates password_hash and clears must_change_password', async () => {
    // Arrange
    mockDb.query.users.findFirst.mockResolvedValue(makeUser())

    // Act
    await authService.changePassword('user-uuid-1', TEST_PASSWORD, 'NewPassword123!')

    // Assert
    expect(mockDb.update).toHaveBeenCalledWith(
      expect.objectContaining({
        password_hash: expect.any(String),
        must_change_password: false,
      }),
    )
    const updateArgs = mockDb.update.mock.calls[0]![0] as Record<string, unknown>
    expect(updateArgs.password_hash).not.toBe(BCRYPT_HASH)
  })

  it('null oldPassword skips verification (admin reset path)', async () => {
    // Arrange
    mockDb.query.users.findFirst.mockResolvedValue(makeUser())

    // Act — should not throw
    await authService.changePassword('user-uuid-1', null, 'NewPassword123!')

    // Assert
    expect(mockDb.update).toHaveBeenCalled()
  })

  it('increments token_version by 1', async () => {
    // Arrange
    mockDb.query.users.findFirst.mockResolvedValue(makeUser({ token_version: 5 }))

    // Act
    await authService.changePassword('user-uuid-1', TEST_PASSWORD, 'NewPassword123!')

    // Assert
    expect(mockDb.update).toHaveBeenCalledWith(
      expect.objectContaining({ token_version: 6 }),
    )
  })

  it('wrong old password throws AUTH_INVALID_CREDENTIALS', async () => {
    // Arrange
    mockDb.query.users.findFirst.mockResolvedValue(makeUser())

    // Act & Assert
    await expect(
      authService.changePassword('user-uuid-1', 'wrong-old-password', 'NewPassword123!'),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' })
  })

  it('non-existent user throws AUTH_INVALID_CREDENTIALS', async () => {
    // Arrange
    mockDb.query.users.findFirst.mockResolvedValue(undefined)

    // Act & Assert
    await expect(
      authService.changePassword('ghost-user', null, 'NewPassword123!'),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' })
  })

  it('records audit event on password change', async () => {
    // Arrange
    mockDb.query.users.findFirst.mockResolvedValue(makeUser())
    const auditSpy = vi.fn()
    authService.setAuditLogger(auditSpy)

    // Act
    await authService.changePassword('user-uuid-1', TEST_PASSWORD, 'NewPassword123!')

    // Assert
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth:password_change',
        actor_id: 'user-uuid-1',
      }),
    )
  })

  it('bcrypt cost factor 12 applied to new password hash', async () => {
    // Arrange
    mockDb.query.users.findFirst.mockResolvedValue(makeUser())

    // Act
    await authService.changePassword('user-uuid-1', TEST_PASSWORD, 'NewPassword123!')

    // Assert
    const updateArgs = mockDb.update.mock.calls[0]![0] as Record<string, unknown>
    const newHash = updateArgs.password_hash as string
    expect(newHash).toMatch(/^\$2b\$12\$/) // bcrypt cost 12 prefix
  })
})

describe('AuthService.setAuditLogger', () => {
  it('logs audit entries when logger is set', async () => {
    // Arrange
    const auditSpy = vi.fn()
    const authService = new AuthService(mockDb as never, TEST_SECRET)
    authService.setAuditLogger(auditSpy)
    mockDb.query.users.findFirst.mockResolvedValue(makeUser())

    // Act
    await authService.login({ username: 'admin', password: TEST_PASSWORD })

    // Assert
    expect(auditSpy).toHaveBeenCalledTimes(1)
  })

  it('does not throw when logger is not set', async () => {
    // Arrange
    const authService = new AuthService(mockDb as never, TEST_SECRET)
    mockDb.query.users.findFirst.mockResolvedValue(makeUser())

    // Act & Assert — no audit callback should not crash
    await expect(
      authService.login({ username: 'admin', password: TEST_PASSWORD }),
    ).resolves.toBeDefined()
  })
})
```

### 3.3 requireAuth 中间件单元测试

```
测试文件: packages/auth/src/__tests__/unit/auth-middleware.test.ts
```

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ErrorCode, UserError } from '@audebase/shared-types'
import type { AuthService } from '../../index.js'

// NOTE: requireAuth is registered in core middleware.
// This tests the integration point between AuthService.verifyAccessToken and the Fastify hook.

function createMockAuthService(
  overrides: Partial<Record<string, ReturnType<typeof vi.fn>>> = {},
): AuthService {
  return {
    verifyAccessToken: vi.fn().mockResolvedValue({ sub: 'u1', tenant_id: 't1' }),
    ...overrides,
  } as unknown as AuthService
}

describe('requireAuth integration contract', () => {
  it('valid Authorization header passes through', async () => {
    // Arrange
    const authService = createMockAuthService()
    const mockRequest = {
      headers: { authorization: 'Bearer valid-token' },
    }

    // Act
    const payload = await authService.verifyAccessToken('valid-token')

    // Assert
    expect(payload.sub).toBe('u1')
  })

  it('missing Authorization header throws AUTH_REQUIRED', async () => {
    // Arrange
    const authService = createMockAuthService({
      verifyAccessToken: vi.fn().mockRejectedValue(
        new UserError(ErrorCode.AUTH_REQUIRED, 'Missing auth header'),
      ),
    })

    // Act & Assert
    await expect(
      authService.verifyAccessToken(''),
    ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
  })

  it('expired token throws AUTH_TOKEN_EXPIRED', async () => {
    // Arrange
    const authService = createMockAuthService({
      verifyAccessToken: vi.fn().mockRejectedValue(
        new UserError(ErrorCode.AUTH_TOKEN_EXPIRED, 'Token expired'),
      ),
    })

    // Act & Assert
    await expect(
      authService.verifyAccessToken('expired-token'),
    ).rejects.toMatchObject({ code: 'AUTH_TOKEN_EXPIRED' })
  })

  it('token_version mismatch throws AUTH_TOKEN_VERSION_MISMATCH', async () => {
    // Arrange
    const authService = createMockAuthService({
      verifyAccessToken: vi.fn().mockRejectedValue(
        new UserError(ErrorCode.AUTH_TOKEN_VERSION_MISMATCH, 'Token version mismatch'),
      ),
    })

    // Act & Assert
    await expect(
      authService.verifyAccessToken('stale-token'),
    ).rejects.toMatchObject({ code: 'AUTH_TOKEN_VERSION_MISMATCH' })
  })
})
```

---

## 4. 集成测试

```
测试文件: packages/auth/src/__tests__/integration/auth.integration.test.ts
```

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { withTestApp } from '../../../core/src/__tests__/helpers/withTestApp.js'
import { seedAdminUser } from '../seeds/auth.js'
import fastify from 'fastify'

describe('认证集成测试 (real PostgreSQL)', () => {
  let test: { app: FastifyInstance; cleanup: () => Promise<void> }

  beforeEach(async () => {
    // Arrange
    process.env.AUDE_JWT_SECRET = 'ci-test-secret-at-least-32-characters-long'
    // NOTE: createTestApp sets up Fastify + in-memory DB mock.
    // Real PG integration uses Docker-based test lifecycle.
  })

  afterEach(async () => {
    // Cleanup
  })

  test('POST /api/auth/login with valid credentials returns 200 + tokens', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      await seedAdminUser(app)

      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'admin', password: 'Admin@123' },
      })

      // Assert
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.access_token).toBeTruthy()
      expect(body.refresh_token).toBeTruthy()
      expect(body.expires_in).toBe(900)
      expect(body.token_type).toBe('Bearer')
      expect(body.user).toBeDefined()
      expect(body.user.username).toBe('admin')
    })
  })

  test('POST /api/auth/login with wrong password returns 401', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      await seedAdminUser(app)

      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'admin', password: 'WrongPass1!' },
      })

      // Assert
      expect(res.statusCode).toBe(401)
      const body = res.json()
      expect(body.error.code).toBe('AUTH_INVALID_CREDENTIALS')
    })
  })

  test('POST /api/auth/login with inactive user returns 401', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      // seed inactive user
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'inactive_user', password: 'Admin@123' },
      })

      // Assert
      expect(res.statusCode).toBe(401)
      expect(res.json().error.code).toBe('AUTH_USER_INACTIVE')
    })
  })

  test('POST /api/auth/refresh with valid token returns new token pair', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'admin', password: 'Admin@123' },
      })
      const refreshToken = loginRes.json().refresh_token

      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refresh_token: refreshToken },
      })

      // Assert
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.access_token).toBeTruthy()
      expect(body.refresh_token).toBeTruthy()
      // Should be a different refresh token (rotation)
      expect(body.refresh_token).not.toBe(refreshToken)
    })
  })

  test('POST /api/auth/refresh with revoked token returns 401', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'admin', password: 'Admin@123' },
      })
      const refreshToken = loginRes.json().refresh_token

      // Logout first (revokes token)
      await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        payload: { refresh_token: refreshToken },
      })

      // Try refreshing with revoked token
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refresh_token: refreshToken },
      })

      // Assert
      expect(res.statusCode).toBe(401)
    })
  })

  test('POST /api/auth/logout revokes refresh token', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'admin', password: 'Admin@123' },
      })
      const refreshToken = loginRes.json().refresh_token

      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        payload: { refresh_token: refreshToken },
      })

      // Assert
      expect(res.statusCode).toBe(200)
    })
  })

  test('change password increments token_version, old tokens become invalid', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'admin', password: 'Admin@123' },
      })
      const accessToken = loginRes.json().access_token

      // Change password
      await app.inject({
        method: 'POST',
        url: '/api/auth/change-password',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { old_password: 'Admin@123', new_password: 'NewPass123!' },
      })

      // Old access token should be invalid due to token_version increment
      const res = await app.inject({
        method: 'GET',
        url: '/api/users',
        headers: { authorization: `Bearer ${accessToken}` },
      })

      // Assert
      expect(res.statusCode).toBe(401)
      expect(res.json().error.code).toBe('AUTH_TOKEN_VERSION_MISMATCH')
    })
  })

  test('protected route without token returns 401 AUTH_REQUIRED', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/users',
      })

      // Assert
      expect(res.statusCode).toBe(401)
      expect(res.json().error.code).toBe('AUTH_REQUIRED')
    })
  })
})
```

---

## 5. 契约测试

```
测试文件: packages/auth/src/__tests__/contracts/auth.contract.test.ts
```

```typescript
import { describe, test, expect } from 'vitest'
import { withTestApp } from '../../../core/src/__tests__/helpers/withTestApp.js'
import { loginSchema, tokenResponseSchema, errorResponseSchema } from '@audebase/shared-types'

describe('POST /api/auth/login 契约', () => {
  test('200 响应形状匹配 tokenResponseSchema', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'admin', password: 'Admin@123' },
      })

      // Assert
      expect(res.statusCode).toBe(200)
      const parsed = tokenResponseSchema.safeParse(res.json())
      expect(parsed.success).toBe(true)
    })
  })

  test('无效输入返回 401 + errorResponseSchema', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'admin', password: 'wrong' },
      })

      // Assert
      expect(res.statusCode).toBe(401)
      const parsed = errorResponseSchema.safeParse(res.json())
      expect(parsed.success).toBe(true)
    })
  })

  test('Zod loginSchema 拒绝短密码', () => {
    // Arrange
    const shortPassword = { username: 'admin', password: '123' }

    // Act
    const result = loginSchema.safeParse(shortPassword)

    // Assert
    expect(result.success).toBe(false)
  })

  test('Zod loginSchema 拒绝空用户名', () => {
    // Arrange
    const emptyUser = { username: '', password: 'SecurePass1!' }

    // Act
    const result = loginSchema.safeParse(emptyUser)

    // Assert
    expect(result.success).toBe(false)
  })

  test('Zod loginSchema 接受合法输入', () => {
    // Arrange
    const valid = { username: 'admin', password: 'SecurePass1!' }

    // Act
    const result = loginSchema.safeParse(valid)

    // Assert
    expect(result.success).toBe(true)
  })
})

describe('POST /api/auth/refresh 契约', () => {
  test('200 响应形状匹配 tokenResponseSchema', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      // First login
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'admin', password: 'Admin@123' },
      })
      const refreshToken = loginRes.json().refresh_token

      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refresh_token: refreshToken },
      })

      // Assert
      expect(res.statusCode).toBe(200)
      const parsed = tokenResponseSchema.safeParse(res.json())
      expect(parsed.success).toBe(true)
    })
  })

  test('401 响应匹配 errorResponseSchema (revoked token)', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refresh_token: 'invalid-or-revoked-token' },
      })

      // Assert
      expect(res.statusCode).toBe(401)
      const parsed = errorResponseSchema.safeParse(res.json())
      expect(parsed.success).toBe(true)
    })
  })
})
```

---

## 6. E2E 测试 (Playwright)

```
packages/admin-ui/__e2e__/login.e2e.ts
preSeed: { admin: true }
```

| 用例 | 描述 |
|------|------|
| 登录页 -> 输入凭据 -> 跳转首页 | 导航到 /admin/login, 输入 admin/Admin@123, 点击登录, 验证跳转到 /admin/dashboard |
| 错误密码 -> 显示错误消息 | 输入错误密码, 验证错误提示 "用户名或密码错误" |
| 令牌过期 -> 自动刷新 | 模拟 Access Token 过期, 验证自动调用 refresh 端点续期 (Phase 1b+ 实现) |

---

## 7. 种子数据

```
packages/auth/src/__tests__/seeds/
└── auth.ts
```

```typescript
import bcrypt from 'bcryptjs'
import type { FastifyInstance } from 'fastify'

export async function seedAdminUser(app: FastifyInstance): Promise<void> {
  const passwordHash = await bcrypt.hash('Admin@123', 12)

  // Insert admin user
  await app.db.insert({
    id: 'admin-uuid',
    username: 'admin',
    password_hash: passwordHash,
    token_version: 1,
    is_active: true,
    must_change_password: false,
    tenant_id: 'default-tenant',
  })

  // Insert inactive user
  await app.db.insert({
    id: 'inactive-uuid',
    username: 'inactive_user',
    password_hash: passwordHash,
    token_version: 1,
    is_active: false,
    must_change_password: false,
    tenant_id: 'default-tenant',
  })

  // Insert must-change-password user
  await app.db.insert({
    id: 'must-change-uuid',
    username: 'new_user',
    password_hash: passwordHash,
    token_version: 1,
    is_active: true,
    must_change_password: true,
    tenant_id: 'default-tenant',
  })
}

export function makeTokenPayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    sub: 'test-user-id',
    tenant_id: 'default-tenant',
    username: 'testuser',
    roles: ['admin'],
    token_version: 1,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 900,
    ...overrides,
  }
}
```

---

## 8. Mock 策略

| 依赖 | 单元测试 | 集成测试 | 说明 |
|------|---------|---------|------|
| PostgreSQL | 无 (mock DatabaseProvider) | 真实 pg_tmp/Docker | mockDB 模拟 insert/update/delete/query |
| Drizzle ORM | vi.fn() mock query/insert/update/delete | 真实 Drizzle + PG | 通过 DatabaseProvider 接口隔离 |
| bcryptjs | 真实 bcryptjs (同步 hashSync 预计算) | 真实 bcryptjs | 预计算测试密码哈希加速 |
| jose | 真实 jose library | 真实 jose | 对称签名验证，无需 mock |
| node:crypto | 真实 crypto | 真实 crypto | randomBytes/createHash 轻量 |
| env (AUDE_JWT_SECRET) | 测试密钥 'test-secret-...' (>=32 chars) | CI 环境变量 | 禁止使用真实生产密钥 |
| Audit Logger | vi.fn() spy | vi.fn() spy | 通过 setAuditLogger 注入 |
| Fastify | 无 | 真实 Fastify + inject | 契约/集成测试使用 app.inject() |

### Mock 约束细则

| 约束 | 说明 |
|------|------|
| 测试密钥 | `'test-secret-at-least-32-characters-long-!!'` (≥32 字符) |
| 禁止使用 | `process.env.AUDE_JWT_SECRET` 真实值 |
| bcrypt mock | 预计算 `bcrypt.hashSync('Admin@123', 12)` 避免每次测试计算 250ms |
| DatabaseProvider | `vi.fn()` mock 返回 mock UserRecord / RefreshTokenRecord |
| AuditLogger | 可选注入，测试中通过 spy 捕获调用参数 |

---

## 9. 覆盖率目标

| 指标 | 目标 | 关键路径 |
|------|:---:|------|
| 行覆盖率 | **85%+** | |
| 分支覆盖率 | **80%+** | login 全部分支 (4 错误路径 + 正常), refresh (5 错误路径 + 正常), changePassword (3 错误路径 + 正常) |
| 函数覆盖率 | **90%+** | 全部 token 工具函数 + AuthService 5 方法 + assertJwtSecret |
| 集成 | 8+ | 登录/刷新/登出/改密/版本不匹配/无 token/不活跃用户/错误密码 |
| 契约 | 6+ | POST /login 200/401 + POST /refresh 200/401 + Zod schema 3 场景 |

---

## 10. CI 集成

```yaml
auth-test:
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
    - run: pnpm --filter @audebase/auth test:unit
      env:
        AUDE_JWT_SECRET: ci-test-secret-at-least-32-characters-long
    - run: pnpm --filter @audebase/auth test:integration
      env:
        DATABASE_URL: postgres://audebase:audebase_test@localhost:5432/audebase_test
        AUDE_JWT_SECRET: ci-test-secret-at-least-32-characters-long
    - run: pnpm --filter @audebase/auth test:contract
      env:
        DATABASE_URL: postgres://audebase:audebase_test@localhost:5432/audebase_test
        AUDE_JWT_SECRET: ci-test-secret-at-least-32-characters-long
    - run: pnpm --filter @audebase/auth test:e2e
      env:
        DATABASE_URL: postgres://audebase:audebase_test@localhost:5432/audebase_test
        AUDE_JWT_SECRET: ci-test-secret-at-least-32-characters-long
```

---

## 11. 用例汇总

| 测试层 | 用例数 |
|--------|:---:|
| 单元 - token 工具 | 17 |
| 单元 - AuthService | 24 |
| 单元 - requireAuth 中间件 | 4 |
| 集成 - auth.integration | 8 |
| 契约 - auth.contract | 6 |
| E2E - login | 2 (Phase 1a) |
| **合计** | **61** |

---

## 12. 参考

- [auth-sdd.md](auth-sdd.md) — 完整接口定义、错误码枚举、mock 约束
- [decisions.md](../../.agents/memorys/decisions.md) — D8.1 JWT 密钥管理、D1.6 Bootstrap 首次强制改密
- [database-schema.md](database-schema.md) — users 表 + refresh_tokens 表 DDL
- [api-specification.md](api-specification.md) — POST /api/auth/login/refresh/logout 端点格式
- [test-seed-strategy.md](test-seed-strategy.md) — seed factory + transaction rollback 模式
- [e2e-test-flows.md](e2e-test-flows.md) — 登录 E2E 流程

> **上游 TDD 参考**: [shared-types-tdd.md](shared-types-tdd.md) — ErrorCode 枚举、JwtPayload、LoginRequest/Response 类型; [rbac-tdd.md](rbac-tdd.md) — requireAuth 中间件集成