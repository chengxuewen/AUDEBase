import { describe, it, expect } from 'vitest'
import {
  signToken,
  verifyToken,
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  assertJwtSecret,
} from '../index.js'

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
})

describe('verifyToken', () => {
  it('valid token returns payload', async () => {
    // Arrange
    const token = await signToken({ sub: 'abc', custom: 'val' }, TEST_SECRET, '1h')

    // Act
    const decoded = await verifyToken(token, TEST_SECRET)

    // Assert
    expect(decoded.sub).toBe('abc')
    expect(decoded.iat).toBeDefined()
    expect(decoded.exp).toBeDefined()
  })

  it('invalid token throws', async () => {
    // Arrange & Act & Assert
    await expect(verifyToken('not.a.valid.token', TEST_SECRET)).rejects.toThrow()
  })
})

describe('generateAccessToken', () => {
  it('returns JWT with sub, token_version, tenant_id, type=access, exp', async () => {
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
    expect(decoded.exp - decoded.iat).toBe(900) // 15m
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

  it('same input produces same hash', () => {
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
})
