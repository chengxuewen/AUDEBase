// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect } from 'vitest'
import { signToken, verifyToken, generateAccessToken, generateRefreshToken, hashToken, assertJwtSecret } from '../index'

const TEST_SECRET = 'test-secret-at-least-32-characters-long-!!'

describe('JWT token 签名与验证', () => {
  it('签名后可验证', () => {
    // Arrange
    const payload = { sub: 'user-uuid-1', token_version: 0, tenant_id: null }

    // Act
    const token = signToken(payload, TEST_SECRET, '15m')
    const decoded = verifyToken(token, TEST_SECRET)

    // Assert
    expect(decoded.sub).toBe('user-uuid-1')
    expect(decoded.token_version).toBe(0)
  })

  it('错误密钥验证失败', () => {
    // Arrange
    const payload = { sub: 'user-uuid-1', token_version: 0 }

    // Act
    const token = signToken(payload, TEST_SECRET, '15m')

    // Assert
    expect(() => verifyToken(token, 'different-secret-at-least-32-chars')).toThrow()
  })

  it('过期 token 验证失败', async () => {
    // Arrange
    const payload = { sub: 'user-uuid-1', token_version: 0 }

    // Act
    const token = signToken(payload, TEST_SECRET, '0s')
    // 等待 1ms 确保时钟差异无影响
    await new Promise(r => setTimeout(r, 100))

    // Assert
    expect(() => verifyToken(token, TEST_SECRET)).toThrow(/expired/i)
  })

  it('access_token 15 分钟过期', () => {
    // Arrange
    const payload = { sub: 'user-uuid-1', token_version: 0 }

    // Act
    const token = signToken(payload, TEST_SECRET, '15m')
    const decoded = verifyToken(token, TEST_SECRET)

    // Assert
    const issuedAt = decoded.iat!
    const expiresAt = decoded.exp!
    expect(expiresAt - issuedAt).toBe(900) // 15 * 60 = 900 秒
  })

  it('refresh_token 7 天过期', () => {
    // Arrange
    const payload = { sub: 'user-uuid-1', token_version: 0 }

    // Act
    const token = signToken(payload, TEST_SECRET, '7d')
    const decoded = verifyToken(token, TEST_SECRET)

    // Assert
    expect(decoded.exp! - decoded.iat!).toBe(7 * 24 * 60 * 60)
  })

  it('拒绝密钥长度 < 32 字符 (D8.1)', () => {
    // Arrange & Act & Assert
    expect(() => signToken({ sub: 'x' }, 'short', '15m')).toThrow(/密钥长度/i)
  })
})

describe('generateAccessToken', () => {
  it('生成包含 sub, token_version, iat, exp 的 JWT', () => {
    // Arrange
    const user = {
      id: 'user-uuid-1',
      username: 'admin',
      token_version: 0,
      tenant_id: null,
      roles: ['admin'],
    }

    // Act
    const token = generateAccessToken(user, TEST_SECRET)
    const decoded = verifyToken(token, TEST_SECRET)

    // Assert
    expect(decoded.sub).toBe('user-uuid-1')
    expect(decoded.token_version).toBe(0)
  })
})

describe('generateRefreshToken', () => {
  it('生成 96 字符的 hex 字符串', () => {
    // Act
    const token = generateRefreshToken()

    // Assert
    expect(token).toHaveLength(96)
    expect(token).toMatch(/^[0-9a-f]+$/)
  })

  it('每次生成不同的 token', () => {
    // Act
    const token1 = generateRefreshToken()
    const token2 = generateRefreshToken()

    // Assert
    expect(token1).not.toBe(token2)
  })
})

describe('hashToken', () => {
  it('SHA-256 哈希为 64 字符 hex', () => {
    // Act
    const hash = hashToken('test-token-value')

    // Assert
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[0-9a-f]+$/)
  })

  it('相同输入产生相同哈希', () => {
    // Act
    const hash1 = hashToken('same-token')
    const hash2 = hashToken('same-token')

    // Assert
    expect(hash1).toBe(hash2)
  })

  it('不同输入产生不同哈希', () => {
    // Act
    const hash1 = hashToken('token-a')
    const hash2 = hashToken('token-b')

    // Assert
    expect(hash1).not.toBe(hash2)
  })
})

describe('assertJwtSecret', () => {
  it('密钥 >= 32 字符通过校验', () => {
    // Arrange & Act & Assert - should not throw
    process.env.AUDE_JWT_SECRET = TEST_SECRET
    expect(() => assertJwtSecret()).not.toThrow()
  })

  it('密钥 < 32 字符拒绝启动', () => {
    // Arrange
    process.env.AUDE_JWT_SECRET = 'too-short'

    // Act & Assert
    expect(() => assertJwtSecret()).toThrow()
  })

  it('密钥未设置拒绝启动', () => {
    // Arrange
    delete process.env.AUDE_JWT_SECRET

    // Act & Assert
    expect(() => assertJwtSecret()).toThrow()
  })
})
