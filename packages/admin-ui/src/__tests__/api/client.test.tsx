import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { apiPost, getToken, setTokens, clearTokens, getTenantId, setTenantId } from '../../api/client.js'

describe('API client', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should use relative URL (not hardcoded localhost) so Vite proxy works in remote access', async () => {
    // Arrange
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'tok', refresh_token: 'ref' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    // Act
    await apiPost('/api/auth/login', { username: 'admin', password: 'pass' })

    // Assert - URL must be relative (empty base), NOT http://localhost:3000
    const calledUrl = fetchSpy.mock.calls[0]?.[0] as string
    expect(calledUrl).toBe('/api/auth/login')
    expect(calledUrl).not.toContain('localhost')
    expect(calledUrl).not.toContain('http://')
  })

  it('should include X-Tenant-Id header from localStorage', async () => {
    // Arrange
    setTenantId('my-tenant')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    // Act
    await apiPost('/api/test')

    // Assert
    const opts = fetchSpy.mock.calls[0]?.[1] as RequestInit
    const headers = opts.headers as Record<string, string>
    expect(headers['X-Tenant-Id']).toBe('my-tenant')
  })

  it('should default tenant to "system" when not set', () => {
    // Arrange - localStorage is cleared in beforeEach
    // Act
    const tenant = getTenantId()
    // Assert
    expect(tenant).toBe('system')
  })

  it('should store and retrieve tokens in localStorage', () => {
    // Act
    setTokens('access123', 'refresh456')
    // Assert
    expect(getToken()).toBe('access123')
    expect(localStorage.getItem('aude_refresh_token')).toBe('refresh456')
  })

  it('should clear tokens from localStorage', () => {
    // Arrange
    setTokens('access123', 'refresh456')
    // Act
    clearTokens()
    // Assert
    expect(getToken()).toBeNull()
    expect(localStorage.getItem('aude_refresh_token')).toBeNull()
  })

  it('should send Authorization header when token is present', async () => {
    // Arrange
    setTokens('my-jwt-token', 'refresh')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    // Act
    await apiPost('/api/test')

    // Assert
    const opts = fetchSpy.mock.calls[0]?.[1] as RequestInit
    const headers = opts.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer my-jwt-token')
  })
})
