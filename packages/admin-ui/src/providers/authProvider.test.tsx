import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock localStorage
const storage = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => storage.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => { storage.set(key, value) }),
  removeItem: vi.fn((key: string) => { storage.delete(key) }),
})

describe('authProvider', () => {
  beforeEach(() => {
    storage.clear()
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ─── check ───────────────────────────────────────────────

  test('check returns authenticated=true when token exists', async () => {
    // Arrange
    storage.set('token', 'fake-jwt')

    // Act
    const { authProvider } = await import('./authProvider')
    const result = await authProvider.check!({})

    // Assert
    expect(result.authenticated).toBe(true)
    expect(result.redirectTo).toBeUndefined()
  })

  test('check returns authenticated=false with redirect when no token', async () => {
    // Arrange: no token in storage

    // Act
    const { authProvider } = await import('./authProvider')
    const result = await authProvider.check!({})

    // Assert
    expect(result.authenticated).toBe(false)
    expect(result.redirectTo).toBe('/login')
    expect(result.logout).toBe(true)
  })

  // ─── login ───────────────────────────────────────────────

  test('login stores token on success', async () => {
    // Arrange
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { token: 'new-jwt-token' } }),
    } as Response)

    // Act
    const { authProvider } = await import('./authProvider')
    const result = await authProvider.login({ email: 'admin@test.com', password: 'secret' })

    // Assert
    expect(result.success).toBe(true)
    expect(storage.get('token')).toBe('new-jwt-token')
  })

  test('login returns success=false on failure', async () => {
    // Arrange
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Invalid credentials' } }),
    } as Response)

    // Act
    const { authProvider } = await import('./authProvider')
    const result = await authProvider.login({ email: 'bad@test.com', password: 'wrong' })

    // Assert
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    expect(storage.has('token')).toBe(false)
  })

  // ─── logout ──────────────────────────────────────────────

  test('logout removes token', async () => {
    // Arrange
    storage.set('token', 'existing-jwt')

    // Act
    const { authProvider } = await import('./authProvider')
    const result = await authProvider.logout({})

    // Assert
    expect(result.success).toBe(true)
    expect(storage.has('token')).toBe(false)
  })

  // ─── getPermissions ─────────────────────────────────────

  test('getPermissions returns permissions array from /api/v1/auth/me', async () => {
    // Arrange
    storage.set('token', 'valid-jwt')
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { permissions: ['users:read', 'roles:write'] } }),
    } as Response)

    // Act
    const { authProvider } = await import('./authProvider')
    const permissions = await authProvider.getPermissions!()

    // Assert
    expect(permissions).toEqual(['users:read', 'roles:write'])
  })

  test('getPermissions returns empty array when no token', async () => {
    // Arrange: no token

    // Act
    const { authProvider } = await import('./authProvider')
    const permissions = await authProvider.getPermissions!()

    // Assert
    expect(permissions).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  // ─── onError ─────────────────────────────────────────────

  test('onError clears token and redirects on 401', async () => {
    // Arrange
    storage.set('token', 'expired-jwt')

    // Act
    const { authProvider } = await import('./authProvider')
    const result = await authProvider.onError!({ statusCode: 401 })

    // Assert
    expect(result.redirectTo).toBe('/login')
    expect(result.logout).toBe(true)
    expect(storage.has('token')).toBe(false)
  })

  test('onError passes through non-401 errors', async () => {
    // Arrange
    const error = { statusCode: 500, message: 'Server error' }

    // Act
    const { authProvider } = await import('./authProvider')
    const result = await authProvider.onError!(error)

    // Assert
    expect(result.error).toBe(error)
    expect(result.redirectTo).toBeUndefined()
    expect(result.logout).toBeUndefined()
  })
})
