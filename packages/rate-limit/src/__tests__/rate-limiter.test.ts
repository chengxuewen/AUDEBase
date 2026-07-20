/**
 * @audebase/rate-limit - Rate Limiter unit tests
 *
 * AAA pattern. Uses fake timers to control window expiry.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { RateLimiter } from '../index.js'

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  describe('check() - basic behavior', () => {
    it('allows requests under the limit', () => {
      // Arrange
      const limiter = new RateLimiter({ windowMs: 60_000, max: 5 })

      // Act
      const result = limiter.check('192.168.1.1')

      // Assert
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(4)
    })

    it('blocks requests over the limit', () => {
      // Arrange
      const limiter = new RateLimiter({ windowMs: 60_000, max: 3 })

      // Act
      limiter.check('ip1')
      limiter.check('ip1')
      limiter.check('ip1')
      const result = limiter.check('ip1')

      // Assert
      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
    })

    it('returns correct remaining count', () => {
      // Arrange
      const limiter = new RateLimiter({ windowMs: 60_000, max: 5 })

      // Act & Assert
      expect(limiter.check('k1').remaining).toBe(4)
      expect(limiter.check('k1').remaining).toBe(3)
      expect(limiter.check('k1').remaining).toBe(2)
      expect(limiter.check('k1').remaining).toBe(1)
      expect(limiter.check('k1').remaining).toBe(0)
    })
  })

  describe('check() - retryAfter', () => {
    it('returns retryAfter (seconds) when blocked', () => {
      // Arrange
      const limiter = new RateLimiter({ windowMs: 60_000, max: 1 })
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))

      // Act
      limiter.check('ip1') // exhaust the limit
      const result = limiter.check('ip1') // this one is blocked

      // Assert
      expect(result.allowed).toBe(false)
      expect(result.retryAfter).toBe(60) // 60s = windowMs / 1000
    })

    it('returns retryAfter=0 when allowed', () => {
      // Arrange
      const limiter = new RateLimiter({ windowMs: 60_000, max: 5 })

      // Act
      const result = limiter.check('ip1')

      // Assert
      expect(result.allowed).toBe(true)
      expect(result.retryAfter).toBe(0)
    })
  })

  describe('reset()', () => {
    it('clears all entries', () => {
      // Arrange
      const limiter = new RateLimiter({ windowMs: 60_000, max: 3 })
      limiter.check('ip1')
      limiter.check('ip2')

      // Act
      limiter.reset()

      // Assert
      expect(limiter.getCount('ip1')).toBe(0)
      expect(limiter.getCount('ip2')).toBe(0)
    })
  })

  describe('getCount()', () => {
    it('returns current count for a key', () => {
      // Arrange
      const limiter = new RateLimiter({ windowMs: 60_000, max: 5 })

      // Act
      limiter.check('ip1')
      limiter.check('ip1')
      limiter.check('ip1')

      // Assert
      expect(limiter.getCount('ip1')).toBe(3)
    })

    it('returns 0 for unknown key', () => {
      // Arrange
      const limiter = new RateLimiter({ windowMs: 60_000, max: 5 })

      // Act & Assert
      expect(limiter.getCount('unknown')).toBe(0)
    })
  })

  describe('window reset', () => {
    it('allows new requests after window expires', () => {
      // Arrange
      const limiter = new RateLimiter({ windowMs: 10_000, max: 2 })
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))

      // Act
      limiter.check('ip1')
      limiter.check('ip1')
      expect(limiter.check('ip1').allowed).toBe(false) // blocked

      // Advance time past window
      vi.advanceTimersByTime(10_001)

      // Assert
      const result = limiter.check('ip1')
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(1)
    })
  })

  describe('different keys', () => {
    it('tracks different keys independently', () => {
      // Arrange
      const limiter = new RateLimiter({ windowMs: 60_000, max: 2 })

      // Act
      limiter.check('ip1')
      limiter.check('ip1')
      const r1 = limiter.check('ip1') // blocked for ip1

      const r2 = limiter.check('ip2') // still allowed for ip2

      // Assert
      expect(r1.allowed).toBe(false)
      expect(r2.allowed).toBe(true)
      expect(r2.remaining).toBe(1)
    })
  })

  describe('lazy eviction', () => {
    it('evicts expired entries on access', () => {
      // Arrange
      const limiter = new RateLimiter({ windowMs: 5_000, max: 1 })
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))

      // Act
      limiter.check('ip1') // count=1, resetAt=T+5s
      vi.advanceTimersByTime(5_001) // window expired

      // Assert - getCount returns 0 because entry was evicted
      expect(limiter.getCount('ip1')).toBe(0)

      // And check creates a fresh window
      const result = limiter.check('ip1')
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(0) // max=1, just used it
    })
  })

  describe('key tracking', () => {
    it('tracks same key across multiple check calls', () => {
      // Arrange
      const limiter = new RateLimiter({ windowMs: 60_000, max: 2 })

      // Act - all checks use the same key
      limiter.check('fixed-key')
      limiter.check('fixed-key')
      const result = limiter.check('fixed-key')

      // Assert
      expect(result.allowed).toBe(false) // 3rd request on 'fixed-key' with max=2
    })
  })

  describe('resetAt', () => {
    it('returns resetAt as unix timestamp in ms', () => {
      // Arrange
      const now = new Date('2026-01-01T00:00:00Z')
      vi.setSystemTime(now)
      const limiter = new RateLimiter({ windowMs: 30_000, max: 5 })

      // Act
      const result = limiter.check('ip1')

      // Assert
      expect(result.resetAt).toBe(now.getTime() + 30_000)
    })
  })
})
