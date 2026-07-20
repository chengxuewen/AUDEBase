/**
 * @audebase/rate-limit - Type definitions
 *
 * Structural types only. No fastify dependency.
 */

export interface RateLimitOptions {
  /** Time window in milliseconds */
  readonly windowMs: number
  /** Max requests per window */
  readonly max: number
  /** Custom key generator (default: IP-based). Receives request object. */
  readonly keyGenerator?: (request: unknown) => string
}

export interface RateLimitResult {
  /** Whether the request is allowed */
  readonly allowed: boolean
  /** Seconds until the client should retry (0 if allowed) */
  readonly retryAfter: number
  /** Remaining requests in current window */
  readonly remaining: number
  /** Unix timestamp (ms) when the window resets */
  readonly resetAt: number
}

export interface MiddlewareOptions {
  /** Custom key generator for the middleware layer */
  readonly keyGenerator?: (request: unknown) => string
}
