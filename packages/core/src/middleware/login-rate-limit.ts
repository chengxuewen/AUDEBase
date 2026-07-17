/**
 * Per-endpoint rate limiter for POST /api/auth/login.
 *
 * Separate from the global 100/min limiter.
 * Allows 5 login attempts per minute per IP.
 *
 * Usage in app.ts login route handler:
 *   import { checkLoginRateLimit } from './middleware/login-rate-limit.js'
 *   const limited = checkLoginRateLimit(request.ip)
 *   if (limited) return reply.code(429).header('Retry-After', ...).send(...)
 *
 * @audebase/core
 */

import { RateLimiter } from '@audebase/rate-limit'
import { ErrorCode } from '@audebase/shared-types'

const loginRateLimiter = new RateLimiter({ windowMs: 60_000, max: 10 })

export interface LoginRateLimitResult {
  readonly allowed: boolean
  readonly retryAfter: number
}

/**
 * Check the per-IP login rate limit.
 * Returns allowed=true if the request can proceed.
 * Returns allowed=false with retryAfter seconds if blocked.
 */
export function checkLoginRateLimit(ip: string): LoginRateLimitResult {
  const result = loginRateLimiter.check(ip)
  return {
    allowed: result.allowed,
    retryAfter: result.retryAfter,
  }
}

/** Build the 429 response body for a blocked login attempt. */
export function loginRateLimitBody() {
  return {
    error: {
      code: ErrorCode.RATE_LIMIT_EXCEEDED,
      message: 'Too many login attempts. Please try again later.',
    },
  }
}
