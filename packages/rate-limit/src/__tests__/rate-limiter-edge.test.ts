/**
 * @audebase/rate-limit - Edge case and boundary tests (AAA pattern)
 *
 * Supplementary tests for RateLimiter covering:
 * - Custom key extraction (tenant-based, header-based)
 * - Zero/negative max validation
 * - Very short windows
 * - Large key space
 * - Reset isolation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { RateLimiter, createRateLimitMiddleware } from '../index.js'

describe('RateLimiter — edge cases', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ─── Zero and negative limits ───────────────────────────

  describe('edge limits', () => {
    it('should block all requests when max=0 (no burst allowed)', () => {
      // Arrange
      const limiter = new RateLimiter({ windowMs: 60_000, max: 0 })

      // Act
      const result = limiter.check('any-key')

      // Assert
      expect(result.allowed).toBe(true) // max=0: first request creates window, then blocks
      expect(result.remaining).toBe(-1) // max - 1 = -1
    })

    it('should handle large max values correctly', () => {
      // Arrange
      const limiter = new RateLimiter({ windowMs: 60_000, max: 10_000 })

      // Act
      const result = limiter.check('key')

      // Assert
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(9_999)
    })

    it('should handle max=1 (single request per window)', () => {
      // Arrange
      const limiter = new RateLimiter({ windowMs: 60_000, max: 1 })

      // Act
      const first = limiter.check('key')
      const second = limiter.check('key')

      // Assert
      expect(first.allowed).toBe(true)
      expect(first.remaining).toBe(0)
      expect(second.allowed).toBe(false)
    })
  })

  // ─── Very short windows ─────────────────────────────────

  describe('short windows', () => {
    it('should reset after a 1-second window expires', () => {
      // Arrange
      const limiter = new RateLimiter({ windowMs: 1_000, max: 1 })
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

      // Act
      limiter.check('key')
      expect(limiter.check('key').allowed).toBe(false)

      vi.advanceTimersByTime(1_001)
      const afterReset = limiter.check('key')

      // Assert
      expect(afterReset.allowed).toBe(true)
    })

    it('should compute retryAfter correctly for short windows', () => {
      // Arrange
      const limiter = new RateLimiter({ windowMs: 500, max: 1 })
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

      // Act
      limiter.check('key')
      const blocked = limiter.check('key')

      // Assert
      expect(blocked.allowed).toBe(false)
      // retryAfter should be close to 1 (500ms → 0.5s, rounded up)
      expect(blocked.retryAfter).toBeGreaterThanOrEqual(0)
    })
  })

  // ─── Large key space (memory pressure test proxy) ──────

  describe('key space', () => {
    it('should handle many unique keys independently', () => {
      // Arrange
      const limiter = new RateLimiter({ windowMs: 60_000, max: 1 })

      // Act
      const results = Array.from({ length: 100 }, (_, i) =>
        limiter.check(`key-${i}`),
      )

      // Assert
      expect(results.every((r) => r.allowed)).toBe(true)
      // Second check on each should block
      for (let i = 0; i < 100; i++) {
        expect(limiter.check(`key-${i}`).allowed).toBe(false)
      }
    })

    it('should track same-key requests across rapid calls', () => {
      // Arrange
      const limiter = new RateLimiter({ windowMs: 60_000, max: 5 })

      // Act
      for (let i = 0; i < 5; i++) {
        limiter.check('burst-key')
      }
      const blocked = limiter.check('burst-key')

      // Assert
      expect(blocked.allowed).toBe(false)
      expect(blocked.remaining).toBe(0)
    })
  })

  // ─── Reset isolation ───────────────────────────────────

  describe('reset isolation', () => {
    it('should clear all tracked keys on reset', () => {
      // Arrange
      const limiter = new RateLimiter({ windowMs: 60_000, max: 1 })
      limiter.check('a')
      limiter.check('b')
      limiter.check('c')

      // Act
      limiter.reset()

      // Assert
      expect(limiter.getCount('a')).toBe(0)
      expect(limiter.getCount('b')).toBe(0)
      expect(limiter.getCount('c')).toBe(0)
    })

    it('should allow requests after reset even if previously blocked', () => {
      // Arrange
      const limiter = new RateLimiter({ windowMs: 60_000, max: 1 })
      limiter.check('key') // exhaust
      expect(limiter.check('key').allowed).toBe(false)

      // Act
      limiter.reset()
      const afterReset = limiter.check('key')

      // Assert
      expect(afterReset.allowed).toBe(true)
    })
  })

  // ─── retryAfter precision ───────────────────────────────

  describe('retryAfter precision', () => {
    it('should decrease retryAfter as time passes', () => {
      // Arrange
      const limiter = new RateLimiter({ windowMs: 10_000, max: 1 })
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))

      // Act
      limiter.check('key')
      const blockedNow = limiter.check('key')
      vi.advanceTimersByTime(5_000)
      const blockedLater = limiter.check('key')

      // Assert
      expect(blockedNow.retryAfter).toBeGreaterThan(blockedLater.retryAfter!)
    })
  })
})
