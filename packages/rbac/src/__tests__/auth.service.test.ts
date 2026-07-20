// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AuthService } from '../index.js'

// 使用 mock DB provider 隔离数据库依赖
const mockDb = {
  query: {
    users: {
      findFirst: vi.fn(),
    },
    refresh_tokens: {
      findFirst: vi.fn(),
    },
  },
  insert: vi.fn(),
  update: vi.fn(),
}

const TEST_JWT_SECRET = 'test-jwt-secret-at-least-32-chars!!!'

describe('AuthService.login', () => {
  let authService: AuthService

  beforeEach(() => {
    vi.clearAllMocks()
    authService = new AuthService(mockDb as never, TEST_JWT_SECRET)
  })

  it('有效凭据返回 access_token + refresh_token', async () => {
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
    const result = await authService.login({
      username: 'admin',
      password: 'Admin@123',
      ip: '127.0.0.1',
      userAgent: 'test-agent',
    })

    // Assert
    expect(result.access_token).toBeTruthy()
    expect(result.refresh_token).toBeTruthy()
    expect(result.expires_in).toBe(900)  // 15 分钟
    expect(result.token_type).toBe('Bearer')
  })

  it('无效密码返回 AUTH_INVALID_CREDENTIALS', async () => {
    // Arrange
    mockDb.query.users.findFirst.mockResolvedValue({
      id: 'user-uuid-1',
      username: 'admin',
      password_hash: '$2b$10$...',
      token_version: 0,
      is_active: true,
      must_change_password: false,
    })

    // Act & Assert
    await expect(
      authService.login({
        username: 'admin',
        password: 'wrong-password',
        ip: '127.0.0.1',
        userAgent: 'test-agent',
      }),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' })
  })

  it('不存在的用户返回 AUTH_INVALID_CREDENTIALS', async () => {
    // Arrange
    mockDb.query.users.findFirst.mockResolvedValue(undefined)

    // Act & Assert
    await expect(
      authService.login({
        username: 'nobody',
        password: 'whatever',
        ip: '127.0.0.1',
        userAgent: 'test-agent',
      }),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' })
  })

  it('禁用用户返回 AUTH_INVALID_CREDENTIALS', async () => {
    // Arrange
    mockDb.query.users.findFirst.mockResolvedValue({
      id: 'user-uuid-1',
      username: 'disabled-user',
      password_hash: '$2b$10$...',
      token_version: 0,
      is_active: false,
    })

    // Act & Assert
    await expect(
      authService.login({
        username: 'disabled-user',
        password: 'Admin@123',
        ip: '127.0.0.1',
        userAgent: 'test-agent',
      }),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' })
  })

  it('首次登录强制修改密码返回 AUTH_MUST_CHANGE_PASSWORD', async () => {
    // Arrange
    mockDb.query.users.findFirst.mockResolvedValue({
      id: 'user-uuid-1',
      username: 'new-admin',
      password_hash: '$2b$10$...',
      token_version: 0,
      is_active: true,
      must_change_password: true,
    })

    // Act & Assert
    await expect(
      authService.login({
        username: 'new-admin',
        password: 'Admin@123',
        ip: '127.0.0.1',
        userAgent: 'test-agent',
      }),
    ).rejects.toMatchObject({ code: 'AUTH_MUST_CHANGE_PASSWORD' })
  })

  it('记录登录审计日志', async () => {
    // Arrange
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

    // Act
    await authService.login({
      username: 'admin',
      password: 'Admin@123',
      ip: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
    })

    // Assert
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      action: 'login',
      actor_id: 'user-uuid-1',
      ip: '192.168.1.1',
      user_agent: 'Mozilla/5.0',
    }))
  })
})

describe('AuthService.refresh', () => {
  let authService: AuthService

  beforeEach(() => {
    vi.clearAllMocks()
    authService = new AuthService(mockDb as never, TEST_JWT_SECRET)
  })

  it('有效 refresh_token 返回新 access_token', async () => {
    // Arrange
    mockDb.query.refresh_tokens.findFirst.mockResolvedValue({
      id: 'rt-uuid-1',
      user_id: 'user-uuid-1',
      token_hash: 'hashed-token',
      revoked_at: null,
      expires_at: new Date(Date.now() + 86400000),
    })
    mockDb.query.users.findFirst.mockResolvedValue({
      id: 'user-uuid-1',
      username: 'admin',
      token_version: 0,
      is_active: true,
    })

    // Act
    const result = await authService.refresh({ refresh_token: 'valid-refresh-token' })

    // Assert
    expect(result.access_token).toBeTruthy()
  })

  it('过期 refresh_token 返回 AUTH_TOKEN_EXPIRED', async () => {
    // Arrange
    mockDb.query.refresh_tokens.findFirst.mockResolvedValue({
      id: 'rt-uuid-1',
      user_id: 'user-uuid-1',
      token_hash: 'hashed-token',
      revoked_at: null,
      expires_at: new Date(Date.now() - 86400000), // expired
    })

    // Act & Assert
    await expect(
      authService.refresh({ refresh_token: 'expired-refresh-token' }),
    ).rejects.toMatchObject({ code: 'AUTH_TOKEN_EXPIRED' })
  })

  it('已撤销 refresh_token 返回 AUTH_TOKEN_INVALID', async () => {
    // Arrange
    mockDb.query.refresh_tokens.findFirst.mockResolvedValue({
      id: 'rt-uuid-1',
      user_id: 'user-uuid-1',
      token_hash: 'hashed-token',
      revoked_at: new Date(), // revoked
      expires_at: new Date(Date.now() + 86400000),
    })

    // Act & Assert
    await expect(
      authService.refresh({ refresh_token: 'revoked-refresh-token' }),
    ).rejects.toMatchObject({ code: 'AUTH_TOKEN_INVALID' })
  })

  it('token_version 不匹配返回 AUTH_TOKEN_INVALID (token 撤回)', async () => {
    // Arrange
    mockDb.query.refresh_tokens.findFirst.mockResolvedValue({
      id: 'rt-uuid-1',
      user_id: 'user-uuid-1',
      token_hash: 'hashed-token',
      revoked_at: null,
      expires_at: new Date(Date.now() + 86400000),
    })
    mockDb.query.users.findFirst.mockResolvedValue({
      id: 'user-uuid-1',
      username: 'admin',
      token_version: 2, // token was invalidated by password change
      is_active: true,
    })

    // Act & Assert
    await expect(
      authService.refresh({ refresh_token: 'old-refresh-token' }),
    ).rejects.toMatchObject({ code: 'AUTH_TOKEN_INVALID' })
  })
})

describe('AuthService.logout', () => {
  let authService: AuthService

  beforeEach(() => {
    vi.clearAllMocks()
    authService = new AuthService(mockDb as never, TEST_JWT_SECRET)
  })

  it('撤销当前 refresh_token', async () => {
    // Arrange
    mockDb.query.refresh_tokens.findFirst.mockResolvedValue({
      id: 'rt-uuid-1',
      user_id: 'user-uuid-1',
      token_hash: 'hashed-token',
      revoked_at: null,
    })

    // Act
    await authService.logout({ refresh_token: 'valid-refresh-token' })

    // Assert - update should have been called to set revoked_at
    expect(mockDb.update).toHaveBeenCalled()
  })

  it('token_version +1 使所有旧 token 失效', async () => {
    // Arrange
    mockDb.query.users.findFirst.mockResolvedValue({
      id: 'user-uuid-1',
      username: 'admin',
      token_version: 0,
    })

    // Act
    await authService.changePassword('user-uuid-1', null, 'NewPassword123!')

    // Assert - token_version should have been incremented
    expect(mockDb.update).toHaveBeenCalledWith(
      expect.objectContaining({ token_version: expect.any(Number) }),
    )
  })
})
