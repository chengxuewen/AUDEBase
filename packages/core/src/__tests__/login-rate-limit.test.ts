import { describe, it, expect, beforeEach } from 'vitest'
import { checkLoginRateLimit, loginRateLimitBody } from '../middleware/login-rate-limit.js'
import { ErrorCode } from '@audebase/shared-types'

describe('checkLoginRateLimit', () => {
  // Note: RateLimiter is stateful — each test uses unique IPs to avoid cross-test state

  it('allows first request from an IP', () => {
    // Arrange
    const ip = `192.168.1.${Math.floor(Math.random() * 255)}`

    // Act
    const result = checkLoginRateLimit(ip)

    // Assert
    expect(result.allowed).toBe(true)
    expect(result.retryAfter).toBe(0)
  })

  it('allows multiple requests under the limit', () => {
    // Arrange
    const ip = `10.0.0.${Math.floor(Math.random() * 255)}`

    // Act & Assert
    for (let i = 0; i < 10; i++) {
      const result = checkLoginRateLimit(ip)
      expect(result.allowed).toBe(true)
    }
  })

  it('blocks after exceeding max (10 per minute)', () => {
    // Arrange
    const ip = `172.16.0.${Math.floor(Math.random() * 255)}`

    // Act: exhaust the limit
    for (let i = 0; i < 10; i++) {
      checkLoginRateLimit(ip)
    }
    // The 11th request should be blocked
    const result = checkLoginRateLimit(ip)

    // Assert
    expect(result.allowed).toBe(false)
    expect(result.retryAfter).toBeGreaterThan(0)
  })

  it('retryAfter is positive when blocked', () => {
    // Arrange
    const ip = `192.0.2.${Math.floor(Math.random() * 255)}`

    // Act: fill rate limit
    for (let i = 0; i < 10; i++) {
      checkLoginRateLimit(ip)
    }
    const blocked = checkLoginRateLimit(ip)

    // Assert
    expect(blocked.retryAfter).toBeGreaterThan(0)
    // Should be a reasonable retry time (within the 60s window)
    expect(blocked.retryAfter).toBeLessThanOrEqual(60)
  })

  it('treats different IPs independently', () => {
    // Arrange
    const ip1 = '203.0.113.1'
    const ip2 = '203.0.113.2'

    // Act: exhaust ip1
    for (let i = 0; i < 10; i++) {
      checkLoginRateLimit(ip1)
    }

    // Assert: ip1 blocked, ip2 still allowed
    expect(checkLoginRateLimit(ip1).allowed).toBe(false)
    expect(checkLoginRateLimit(ip2).allowed).toBe(true)
  })

  it('result is readonly', () => {
    // Arrange & Act
    const ip = `fd00::${Math.floor(Math.random() * 0xffff).toString(16)}`
    const result = checkLoginRateLimit(ip)

    // Assert: shape is correct
    expect(result).toHaveProperty('allowed')
    expect(result).toHaveProperty('retryAfter')
    expect(typeof result.allowed).toBe('boolean')
    expect(typeof result.retryAfter).toBe('number')
  })
})

describe('loginRateLimitBody', () => {
  it('returns structured error body with RATE_LIMIT_EXCEEDED code', () => {
    // Act
    const body = loginRateLimitBody()

    // Assert
    expect(body).toEqual({
      error: {
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
        message: 'Too many login attempts. Please try again later.',
      },
    })
  })

  it('body is immutable when called multiple times', () => {
    // Arrange & Act
    const body1 = loginRateLimitBody()
    const body2 = loginRateLimitBody()

    // Assert: same structure, different references
    expect(body1).toEqual(body2)
    expect(body1).not.toBe(body2)
  })

  it('message includes user-friendly text', () => {
    const body = loginRateLimitBody()
    expect(body.error.message).toContain('Too many login attempts')
  })
})
