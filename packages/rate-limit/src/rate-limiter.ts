/**
 * @audebase/rate-limit - In-memory rate limiter (fixed window)
 *
 * Phase 1a: single-process in-memory counter.
 * Phase 1b: replace store with Redis backend (interface already defined in SDD).
 */

import type { RateLimitOptions, RateLimitResult } from './types.js'

interface WindowEntry {
  count: number
  resetAt: number
}

export class RateLimiter {
  private readonly windowMs: number
  private readonly max: number
  private readonly store: Map<string, WindowEntry> = new Map()

  constructor(options: RateLimitOptions) {
    this.windowMs = options.windowMs
    this.max = options.max
  }

  check(key: string): RateLimitResult {
    const now = Date.now()
    const entry = this.store.get(key)

    // Lazy eviction: expired or missing -> fresh window
    if (entry === undefined || now >= entry.resetAt) {
      const resetAt = now + this.windowMs
      this.store.set(key, { count: 1, resetAt })
      return {
        allowed: true,
        retryAfter: 0,
        remaining: this.max - 1,
        resetAt,
      }
    }

    // Within window: increment if under limit
    if (entry.count < this.max) {
      const newCount = entry.count + 1
      const updatedEntry: WindowEntry = { count: newCount, resetAt: entry.resetAt }
      this.store.set(key, updatedEntry)
      return {
        allowed: true,
        retryAfter: 0,
        remaining: this.max - newCount,
        resetAt: entry.resetAt,
      }
    }

    // Over limit
    const retryAfterMs = entry.resetAt - now
    return {
      allowed: false,
      retryAfter: Math.ceil(retryAfterMs / 1000),
      remaining: 0,
      resetAt: entry.resetAt,
    }
  }

  reset(): void {
    this.store.clear()
  }

  getCount(key: string): number {
    const entry = this.store.get(key)
    if (entry === undefined) {
      return 0
    }
    if (Date.now() >= entry.resetAt) {
      this.store.delete(key)
      return 0
    }
    return entry.count
  }

  /** Returns the configured max requests per window */
  getMax(): number {
    return this.max
  }
}
