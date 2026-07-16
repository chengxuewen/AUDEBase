/**
 * @audebase/rate-limit - Middleware unit tests
 *
 * AAA pattern. Mocks request/reply objects via structural typing.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { RateLimiter, createRateLimitMiddleware } from '../index.js'
import { ErrorCode } from '@audebase/shared-types'

/** Minimal reply mock that records calls */
function createMockReply() {
  const calls: {
    code?: number
    headers: Record<string, string>
    sentBody?: unknown
  } = { headers: {} }

  return {
    code(status: number) {
      calls.code = status
      return this
    },
    header(name: string, value: string) {
      calls.headers[name] = value
      return this
    },
    send(body: unknown) {
      calls.sentBody = body
      return this
    },
    _calls: calls,
  }
}

/** Minimal request mock */
function createMockRequest(ip: string = '127.0.0.1') {
  return { ip, headers: {} }
}

describe('createRateLimitMiddleware', () => {
  let limiter: RateLimiter

  beforeEach(() => {
    limiter = new RateLimiter({ windowMs: 60_000, max: 3 })
  })

  it('allows request under limit (returns undefined)', () => {
    // Arrange
    const middleware = createRateLimitMiddleware(limiter)
    const request = createMockRequest('1.2.3.4')
    const reply = createMockReply()

    // Act
    const result = middleware(request, reply)

    // Assert
    expect(result).toBeUndefined()
    expect(reply._calls.code).toBeUndefined()
    expect(reply._calls.sentBody).toBeUndefined()
  })

  it('blocks request over limit (sets 429 status)', () => {
    // Arrange
    const middleware = createRateLimitMiddleware(limiter)
    const request = createMockRequest('1.2.3.4')
    const reply = createMockReply()

    // Exhaust the limit
    middleware(request, createMockReply())
    middleware(request, createMockReply())
    middleware(request, createMockReply())

    // Act - 4th request
    middleware(request, reply)

    // Assert
    expect(reply._calls.code).toBe(429)
  })

  it('sets Retry-After header when blocked', () => {
    // Arrange
    const middleware = createRateLimitMiddleware(limiter)
    const request = createMockRequest('1.2.3.4')

    // Exhaust limit
    middleware(request, createMockReply())
    middleware(request, createMockReply())
    middleware(request, createMockReply())

    // Act
    const reply = createMockReply()
    middleware(request, reply)

    // Assert
    expect(reply._calls.headers['Retry-After']).toBeDefined()
    const retryAfter = parseInt(reply._calls.headers['Retry-After']!, 10)
    expect(retryAfter).toBeGreaterThan(0)
    expect(retryAfter).toBeLessThanOrEqual(60)
  })

  it('sends RATE_LIMIT_EXCEEDED error code in response body', () => {
    // Arrange
    const middleware = createRateLimitMiddleware(limiter)
    const request = createMockRequest('1.2.3.4')

    // Exhaust limit
    middleware(request, createMockReply())
    middleware(request, createMockReply())
    middleware(request, createMockReply())

    // Act
    const reply = createMockReply()
    middleware(request, reply)

    // Assert
    expect(reply._calls.sentBody).toBeDefined()
    const body = reply._calls.sentBody as { error: { code: string; message: string } }
    expect(body.error.code).toBe(ErrorCode.RATE_LIMIT_EXCEEDED)
    expect(body.error.message).toBeDefined()
  })

  it('uses custom keyGenerator to extract key from request', () => {
    // Arrange
    const limiter2 = new RateLimiter({ windowMs: 60_000, max: 1 })
    const middleware = createRateLimitMiddleware(limiter2, {
      keyGenerator: (req: unknown) => {
        const r = req as { user?: { id?: string } }
        return r.user?.id ?? 'anonymous'
      },
    })

    const requestUserA = { ip: '1.1.1.1', headers: {}, user: { id: 'user-a' } }
    const requestUserB = { ip: '2.2.2.2', headers: {}, user: { id: 'user-b' } }

    // Act - user-a exhausts their limit, user-b should still be allowed
    middleware(requestUserA, createMockReply())
    const replyB = createMockReply()
    const resultB = middleware(requestUserB, replyB)

    // Assert
    expect(resultB).toBeUndefined()
    expect(replyB._calls.code).toBeUndefined()

    // user-a is now blocked
    const replyA2 = createMockReply()
    middleware(requestUserA, replyA2)
    expect(replyA2._calls.code).toBe(429)
  })

  it('sets X-RateLimit-* headers on blocked requests', () => {
    // Arrange
    const middleware = createRateLimitMiddleware(limiter)
    const request = createMockRequest('1.2.3.4')

    // Exhaust limit
    middleware(request, createMockReply())
    middleware(request, createMockReply())
    middleware(request, createMockReply())

    // Act
    const reply = createMockReply()
    middleware(request, reply)

    // Assert
    expect(reply._calls.headers['X-RateLimit-Limit']).toBeDefined()
    expect(reply._calls.headers['X-RateLimit-Remaining']).toBe('0')
    expect(reply._calls.headers['X-RateLimit-Reset']).toBeDefined()
  })
})
