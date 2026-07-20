/**
 * @audebase/rate-limit - Fastify-compatible middleware
 *
 * Blocks over-limit requests with 429 + RATE_LIMIT_EXCEEDED.
 * Uses structural typing for request/reply — no fastify import.
 */

import { ErrorCode } from '@audebase/shared-types'
import type { RateLimiter } from './rate-limiter.js'
import type { MiddlewareOptions } from './types.js'

/** Minimal request shape needed by the middleware */
interface RateLimitRequest {
  ip?: string
  headers?: Record<string, string | string[] | undefined>
}

/** Minimal reply shape (Fastify-style chainable API) */
interface RateLimitReply {
  code(status: number): RateLimitReply
  header(name: string, value: string): RateLimitReply
  send(body: unknown): RateLimitReply
}

/**
 * Create a rate-limit middleware function.
 *
 * Usage:
 *   const limiter = new RateLimiter({ windowMs: 60_000, max: 100 })
 *   const middleware = createRateLimitMiddleware(limiter)
 *   fastify.addHook('onRequest', middleware)
 */
export function createRateLimitMiddleware(
  limiter: RateLimiter,
  options?: MiddlewareOptions,
): (request: unknown, reply: unknown) => void {
  const keyGenerator = options?.keyGenerator ?? defaultKeyGenerator

  return (request: unknown, reply: unknown): void => {
    const key = keyGenerator(request)
    const result = limiter.check(key)

    if (result.allowed) {
      return
    }

    // Blocked — send 429
    const r = reply as RateLimitReply
    r.code(429)
    r.header('Retry-After', String(result.retryAfter))
    r.header('X-RateLimit-Limit', String(limiter.getMax()))
    r.header('X-RateLimit-Remaining', '0')
    r.header('X-RateLimit-Reset', String(Math.floor(result.resetAt / 1000)))
    r.send({
      error: {
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
        message: '请求过于频繁，请稍后再试',
      },
    })
  }
}

/** Default key generator: extracts IP from request-like object */
function defaultKeyGenerator(request: unknown): string {
  const r = request as RateLimitRequest
  return r.ip ?? 'unknown'
}
