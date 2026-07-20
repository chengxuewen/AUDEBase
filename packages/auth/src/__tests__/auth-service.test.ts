import { describe, it, expect, beforeEach, vi } from 'vitest'
import bcrypt from 'bcryptjs'
import { AuthService } from '../index.js'
import { signToken, generateRefreshToken, hashToken } from '../index.js'

const TEST_SECRET = 'test-secret-at-least-32-characters-long-!!'
const TEST_PASSWORD = 'Admin@123'

// Pre-compute bcrypt hash so tests are fast and deterministic
const BCRYPT_HASH = bcrypt.hashSync(TEST_PASSWORD, 12)

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

  it('valid credentials returns token pair', async () => {
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

  it('invalid credentials throws AUTH_INVALID_CREDENTIALS', async () => {
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

  it('records refresh token in DB (insert called)', async () => {
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

    // Assert - update called to revoke old token
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

  it('revokes refresh token', async () => {
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
  })

  it('token_version mismatch throws AUTH_TOKEN_VERSION_MISMATCH', async () => {
    // Arrange - token was issued at version 0, but user's version is now 1
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
})

describe('AuthService.changePassword', () => {
  let authService: AuthService

  beforeEach(() => {
    vi.clearAllMocks()
    authService = new AuthService(mockDb as never, TEST_SECRET)
  })

  it('correct old password updates hash', async () => {
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
    // New hash should differ from old
    const updateArgs = mockDb.update.mock.calls[0]![0] as Record<string, unknown>
    expect(updateArgs.password_hash).not.toBe(BCRYPT_HASH)
  })

  it('null old password skips verification (admin reset)', async () => {
    // Arrange
    mockDb.query.users.findFirst.mockResolvedValue(makeUser())

    // Act - should not throw even though oldPassword is null
    await authService.changePassword('user-uuid-1', null, 'NewPassword123!')

    // Assert
    expect(mockDb.update).toHaveBeenCalled()
  })

  it('increments token_version', async () => {
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
})
