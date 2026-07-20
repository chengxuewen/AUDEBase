# Rate Limit TDD 测试策略

> **模块**: `@audebase/rate-limit`
> **依赖**: `@audebase/shared-types`
> **更新日期**: 2026-07-17
> **参考**: rate-limit-sdd.md, GO-024, decisions.md D1.13, architecture.md §速率限制
> **覆盖率目标**: 85%+ 行覆盖率, 80%+ 分支覆盖率

---

## 1. 测试范围

速率限制模块为 AUDEBase 平台提供 HTTP 请求频率限制能力。核心为固定窗口计数器算法，通过 Fastify 兼容中间件在请求管线中拦截超频请求，返回 429 状态码。

| 测试类型 | 最低用例数 | 数据库 |
|---------|:---:|------|
| 单元测试 | 12+ | 无（内存 Map） |
| 集成测试 | 4+ | 无（内存限流） |
| 契约测试 | 4+ | 无（Fastify.inject） |
| E2E 测试 | 2 流程 | 无 |

---

## 2. 模块结构

```
packages/rate-limit/
├── src/
│   ├── index.ts              # 公开导出 RateLimiter, createRateLimitMiddleware, 类型
│   ├── rate-limiter.ts        # RateLimiter 类（固定窗口计数器，内存 Map 存储）
│   ├── middleware.ts          # createRateLimitMiddleware（Fastify 兼容中间件）
│   ├── types.ts               # RateLimitOptions, RateLimitResult, MiddlewareOptions
│   ├── __tests__/
│   │   ├── unit/
│   │   │   ├── rate-limiter.test.ts
│   │   │   └── middleware.test.ts
│   │   ├── integration/
│   │   │   └── rate-limit.integration.test.ts
│   │   ├── contracts/
│   │   │   └── rate-limit.contract.test.ts
│   │   └── seeds/
│   │       └── rate-limit-fixtures.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## 3. 单元测试

### 3.1 RateLimiter 单元测试

```
测试文件: packages/rate-limit/src/__tests__/unit/rate-limiter.test.ts
```

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { RateLimiter } from '../../rate-limiter'

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
      expect(result.retryAfter).toBe(0)
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

    it('returns correct remaining count decrementing with each request', () => {
      // Arrange
      const limiter = new RateLimiter({ windowMs: 60_000, max: 5 })

      // Act & Assert
      expect(limiter.check('k1').remaining).toBe(4)
      expect(limiter.check('k1').remaining).toBe(3)
      expect(limiter.check('k1').remaining).toBe(2)
      expect(limiter.check('k1').remaining).toBe(1)
      expect(limiter.check('k1').remaining).toBe(0)
    })

    it('blocks at exactly the limit boundary (max+1th request)', () => {
      // Arrange
      const limiter = new RateLimiter({ windowMs: 10_000, max: 1 })

      // Act
      const first = limiter.check('ip1')
      const second = limiter.check('ip1')

      // Assert
      expect(first.allowed).toBe(true)
      expect(second.allowed).toBe(false)
    })
  })

  describe('check() - retryAfter', () => {
    it('returns retryAfter in seconds when blocked', () => {
      // Arrange
      const limiter = new RateLimiter({ windowMs: 60_000, max: 1 })
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))

      // Act
      limiter.check('ip1') // exhaust the limit
      const result = limiter.check('ip1') // blocked

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

    it('retryAfter decreases as window approaches expiry', () => {
      // Arrange
      const limiter = new RateLimiter({ windowMs: 10_000, max: 1 })
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      limiter.check('ip1')

      // Act - advance 5s into the window
      vi.advanceTimersByTime(5_000)
      const result = limiter.check('ip1')

      // Assert
      expect(result.retryAfter).toBe(5) // 5s remaining
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

    it('allows requests after reset even if previously blocked', () => {
      // Arrange
      const limiter = new RateLimiter({ windowMs: 60_000, max: 1 })
      limiter.check('ip1')
      expect(limiter.check('ip1').allowed).toBe(false)

      // Act
      limiter.reset()
      const result = limiter.check('ip1')

      // Assert
      expect(result.allowed).toBe(true)
    })
  })

  describe('getCount()', () => {
    it('returns current count for a key without incrementing', () => {
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

    it('getCount does not modify the count', () => {
      // Arrange
      const limiter = new RateLimiter({ windowMs: 60_000, max: 5 })
      limiter.check('ip1')

      // Act
      limiter.getCount('ip1')
      limiter.getCount('ip1')

      // Assert
      expect(limiter.getCount('ip1')).toBe(1) // still 1
    })
  })

  describe('window expiry', () => {
    it('allows new requests after window expires (full reset)', () => {
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
      expect(result.remaining).toBe(1) // fresh window, max=2, consumed 1
    })

    it('handles request at exactly window boundary (edge case)', () => {
      // Arrange
      const limiter = new RateLimiter({ windowMs: 10_000, max: 1 })
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      limiter.check('ip1') // count=1, resetAt=T+10000

      // Act - at exactly T+10000, entry is expired
      vi.advanceTimersByTime(10_000)
      const result = limiter.check('ip1')

      // Assert - expired, so fresh window
      expect(result.allowed).toBe(true)
    })

    it('lazy eviction: expired entry returns 0 on getCount', () => {
      // Arrange
      const limiter = new RateLimiter({ windowMs: 5_000, max: 1 })
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      limiter.check('ip1')

      // Act
      vi.advanceTimersByTime(5_001) // window expired

      // Assert
      expect(limiter.getCount('ip1')).toBe(0)
      const result = limiter.check('ip1')
      expect(result.allowed).toBe(true) // fresh window
    })
  })

  describe('key isolation', () => {
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

    it('supports per-user key tracking', () => {
      // Arrange
      const limiter = new RateLimiter({ windowMs: 60_000, max: 3 })

      // Act
      limiter.check('user:user-a')
      limiter.check('user:user-a')
      const rA = limiter.check('user:user-a') // 3rd
      const rB = limiter.check('user:user-b') // user-b, different key

      // Assert
      expect(rA.allowed).toBe(false)
      expect(rB.allowed).toBe(true)
    })

    it('supports per-tenant key tracking', () => {
      // Arrange
      const limiter = new RateLimiter({ windowMs: 60_000, max: 2 })

      // Act
      limiter.check('tenant:t1:ip1')
      limiter.check('tenant:t1:ip1')
      const rT1 = limiter.check('tenant:t1:ip1') // blocked
      const rT2 = limiter.check('tenant:t2:ip1') // same IP, different tenant

      // Assert
      expect(rT1.allowed).toBe(false)
      expect(rT2.allowed).toBe(true)
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

    it('resetAt stays consistent for the same window', () => {
      // Arrange
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      const limiter = new RateLimiter({ windowMs: 60_000, max: 5 })

      // Act
      const r1 = limiter.check('ip1')
      const r2 = limiter.check('ip1')

      // Assert
      expect(r2.resetAt).toBe(r1.resetAt)
    })
  })

  describe('getMax()', () => {
    it('returns the configured max value', () => {
      // Arrange
      const limiter = new RateLimiter({ windowMs: 10_000, max: 50 })

      // Act
      const max = limiter.getMax()

      // Assert
      expect(max).toBe(50)
    })
  })
})
```

### 3.2 Middleware 单元测试

```
测试文件: packages/rate-limit/src/__tests__/unit/middleware.test.ts
```

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { RateLimiter } from '../../rate-limiter'
import { createRateLimitMiddleware } from '../../middleware'
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

    // Exhaust the limit
    middleware(request, createMockReply())
    middleware(request, createMockReply())
    middleware(request, createMockReply())

    // Act - 4th request
    const reply = createMockReply()
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

  it('sets X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset on blocked requests', () => {
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

    const limit = parseInt(reply._calls.headers['X-RateLimit-Limit']!, 10)
    expect(limit).toBe(3)

    const reset = parseInt(reply._calls.headers['X-RateLimit-Reset']!, 10)
    expect(reset).toBeGreaterThan(0)
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

  it('default key generator uses request.ip', () => {
    // Arrange
    const middleware = createRateLimitMiddleware(limiter)
    const requestA = createMockRequest('10.0.0.1')
    const requestB = createMockRequest('10.0.0.2')

    // Act - exhaust requestA limit
    middleware(requestA, createMockReply())
    middleware(requestA, createMockReply())
    middleware(requestA, createMockReply())

    // Assert - requestA blocked, requestB still allowed
    const replyA = createMockReply()
    middleware(requestA, replyA)
    expect(replyA._calls.code).toBe(429)

    const replyB = createMockReply()
    middleware(requestB, replyB)
    expect(replyB._calls.code).toBeUndefined()
  })

  it('default key generator falls back to "unknown" when ip is missing', () => {
    // Arrange
    const middleware = createRateLimitMiddleware(limiter)
    const request = { headers: {} } // no ip

    // Act
    const reply = createMockReply()
    const result = middleware(request, reply)

    // Assert - should not throw, uses "unknown" as key
    expect(result).toBeUndefined()
  })

  it('does not set error headers when request is allowed', () => {
    // Arrange
    const middleware = createRateLimitMiddleware(limiter)
    const request = createMockRequest('1.2.3.4')
    const reply = createMockReply()

    // Act
    middleware(request, reply)

    // Assert
    expect(reply._calls.headers['Retry-After']).toBeUndefined()
    expect(reply._calls.headers['X-RateLimit-Limit']).toBeUndefined()
    expect(reply._calls.headers['X-RateLimit-Remaining']).toBeUndefined()
    expect(reply._calls.headers['X-RateLimit-Reset']).toBeUndefined()
  })
})
```

---

## 4. 集成测试

```
测试文件: packages/rate-limit/src/__tests__/integration/rate-limit.integration.test.ts
```

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { RateLimiter } from '../../rate-limiter'
import { createRateLimitMiddleware } from '../../middleware'

describe('Rate Limit 集成测试', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('逐次消耗限额直到触发限流', () => {
    // Arrange
    const limiter = new RateLimiter({ windowMs: 60_000, max: 5 })
    const middleware = createRateLimitMiddleware(limiter)
    const key = '192.168.1.100'

    // Act - 连续 7 次请求
    const results = Array.from({ length: 7 }, () => {
      const reply = { code: vi.fn().mockReturnThis(), header: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() }
      const request = { ip: key, headers: {} }
      middleware(request, reply)
      return { code: reply.code.mock.calls[0]?.[0] ?? 200 }
    })

    // Assert
    expect(results[0].code).toBe(200) // 第 1 次：允许
    expect(results[1].code).toBe(200) // 第 2 次：允许
    expect(results[2].code).toBe(200) // 第 3 次：允许
    expect(results[3].code).toBe(200) // 第 4 次：允许
    expect(results[4].code).toBe(200) // 第 5 次：允许
    expect(results[5].code).toBe(429) // 第 6 次：超限
    expect(results[6].code).toBe(429) // 第 7 次：超限
  })

  it('窗口过期后重新允许请求', () => {
    // Arrange
    const limiter = new RateLimiter({ windowMs: 10_000, max: 2 })
    const middleware = createRateLimitMiddleware(limiter)
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))

    // Act - 消耗限额
    const key = '10.0.0.1'
    const req = { ip: key, headers: {} }

    const reply1 = { code: vi.fn().mockReturnThis(), header: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() }
    middleware(req, reply1)
    const reply2 = { code: vi.fn().mockReturnThis(), header: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() }
    middleware(req, reply2)
    const reply3 = { code: vi.fn().mockReturnThis(), header: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() }
    middleware(req, reply3)
    expect(reply3.code).toHaveBeenCalledWith(429) // blocked

    // 窗口过期
    vi.advanceTimersByTime(10_001)

    // Assert
    const reply4 = { code: vi.fn().mockReturnThis(), header: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() }
    middleware(req, reply4)
    expect(reply4.code).not.toHaveBeenCalledWith(429) // allowed again
  })

  it('不同 IP 独立计数', () => {
    // Arrange
    const limiter = new RateLimiter({ windowMs: 60_000, max: 2 })
    const middleware = createRateLimitMiddleware(limiter)

    // Act - ip1 消耗完限额，ip2 不受影响
    const req1 = { ip: '10.0.0.1', headers: {} }
    const req2 = { ip: '10.0.0.2', headers: {} }

    middleware(req1, { code: vi.fn().mockReturnThis(), header: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() })
    middleware(req1, { code: vi.fn().mockReturnThis(), header: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() })

    const reply1Blocked = { code: vi.fn().mockReturnThis(), header: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() }
    middleware(req1, reply1Blocked) // ip1 被限

    const reply2Allowed = { code: vi.fn().mockReturnThis(), header: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() }
    middleware(req2, reply2Allowed) // ip2 正常

    // Assert
    expect(reply1Blocked.code).toHaveBeenCalledWith(429)
    expect(reply2Allowed.code).not.toHaveBeenCalledWith(429)
  })

  it('大量突发请求后窗口过期恢复正常', () => {
    // Arrange
    const limiter = new RateLimiter({ windowMs: 30_000, max: 10 })
    const middleware = createRateLimitMiddleware(limiter)
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))

    // Act - 突发 20 个请求
    let blocked = 0
    for (let i = 0; i < 20; i++) {
      const reply = { code: vi.fn().mockReturnThis(), header: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() }
      middleware({ ip: '10.0.0.1', headers: {} }, reply)
      if (reply.code.mock.calls[0]?.[0] === 429) blocked++
    }

    // Assert - 前 10 个允许，后 10 个被限
    expect(blocked).toBe(10)

    // 窗口过期
    vi.advanceTimersByTime(30_001)

    // 恢复正常
    const replyAfter = { code: vi.fn().mockReturnThis(), header: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() }
    middleware({ ip: '10.0.0.1', headers: {} }, replyAfter)
    expect(replyAfter.code).not.toHaveBeenCalledWith(429)
  })
})
```

---

## 5. 契约测试

```
测试文件: packages/rate-limit/src/__tests__/contracts/rate-limit.contract.test.ts
```

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { RateLimiter } from '../../rate-limiter'
import { createRateLimitMiddleware } from '../../middleware'
import { ErrorCode } from '@audebase/shared-types'

describe('Rate Limit 响应契约', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('429 响应包含 RATE_LIMIT_EXCEEDED 错误码', () => {
    // Arrange
    const limiter = new RateLimiter({ windowMs: 60_000, max: 1 })
    const middleware = createRateLimitMiddleware(limiter)
    const request = { ip: '1.2.3.4', headers: {} }

    // Act - 消耗限额
    let sentBody: unknown
    const reply1 = { code: vi.fn().mockReturnThis(), header: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() }
    middleware(request, reply1) // allowed

    const reply2 = {
      code: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis(),
      send: (body: unknown) => { sentBody = body },
    }
    middleware(request, reply2) // blocked

    // Assert
    expect(reply2.code).toHaveBeenCalledWith(429)
    expect(sentBody).toBeDefined()
    const err = (sentBody as { error: { code: string } }).error
    expect(err.code).toBe(ErrorCode.RATE_LIMIT_EXCEEDED)
  })

  it('X-RateLimit-* 头格式正确', () => {
    // Arrange
    const limiter = new RateLimiter({ windowMs: 10_000, max: 5 })
    const middleware = createRateLimitMiddleware(limiter)
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const request = { ip: '1.2.3.4', headers: {} }

    // Act
    const headers: Record<string, string> = {}
    const reply = {
      code: vi.fn().mockReturnThis(),
      header: (name: string, value: string) => { headers[name] = value; return reply },
      send: vi.fn().mockReturnThis(),
    }
    middleware(request, reply)

    // Assert - X-RateLimit-Limit 是整数
    expect(headers['X-RateLimit-Limit']).toBe('5')
    // X-RateLimit-Remaining 是整数
    expect(headers['X-RateLimit-Remaining']).toBeUndefined() // allowed 时不设置
  })

  it('被限流时 X-RateLimit-Remaining 为 0', () => {
    // Arrange
    const limiter = new RateLimiter({ windowMs: 60_000, max: 1 })
    const middleware = createRateLimitMiddleware(limiter)
    const request = { ip: '1.2.3.4', headers: {} }

    // Act
    middleware(request, { code: vi.fn().mockReturnThis(), header: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() })

    const headers: Record<string, string> = {}
    const reply = {
      code: vi.fn().mockReturnThis(),
      header: (name: string, value: string) => { headers[name] = value; return reply },
      send: vi.fn().mockReturnThis(),
    }
    middleware(request, reply)

    // Assert
    expect(headers['X-RateLimit-Remaining']).toBe('0')
  })

  it('X-RateLimit-Reset 是 Unix 时间戳（秒）', () => {
    // Arrange
    const limiter = new RateLimiter({ windowMs: 60_000, max: 1 })
    const middleware = createRateLimitMiddleware(limiter)
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const request = { ip: '1.2.3.4', headers: {} }

    // Act
    middleware(request, { code: vi.fn().mockReturnThis(), header: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() })

    const headers: Record<string, string> = {}
    const reply = {
      code: vi.fn().mockReturnThis(),
      header: (name: string, value: string) => { headers[name] = value; return reply },
      send: vi.fn().mockReturnThis(),
    }
    middleware(request, reply)

    // Assert
    expect(headers['X-RateLimit-Reset']).toBeDefined()
    const resetTime = parseInt(headers['X-RateLimit-Reset']!, 10)
    // 应该是秒级时间戳，不是毫秒 — 2026-01-01T00:01:00Z = 1767225660 (approx)
    expect(resetTime).toBeGreaterThan(1700000000)
    expect(resetTime).toBeLessThan(1800000000)
  })

  it('Retry-After 是整数秒', () => {
    // Arrange
    const limiter = new RateLimiter({ windowMs: 60_000, max: 1 })
    const middleware = createRateLimitMiddleware(limiter)
    const request = { ip: '1.2.3.4', headers: {} }

    // Act
    middleware(request, { code: vi.fn().mockReturnThis(), header: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() })

    const headers: Record<string, string> = {}
    const reply = {
      code: vi.fn().mockReturnThis(),
      header: (name: string, value: string) => { headers[name] = value; return reply },
      send: vi.fn().mockReturnThis(),
    }
    middleware(request, reply)

    // Assert
    expect(headers['Retry-After']).toBeDefined()
    const retryAfter = parseInt(headers['Retry-After']!, 10)
    expect(Number.isInteger(retryAfter)).toBe(true)
    expect(retryAfter).toBeGreaterThan(0)
  })
})
```

---

## 6. E2E 测试 (Playwright)

速率限制 E2E 属于 Phase 1a stretch goal，通过管理后台验证限流行为：

```
packages/admin-ui/__e2e__/rate-limit.e2e.ts
```

| 用例 | 描述 |
|------|------|
| 连续请求触发 429 | 快速发送多个请求到 API 端点，验证第 N+1 次返回 429 |
| 限流后恢复 | 等待 Retry-After 秒后重新请求，验证恢复正常 |

**注**: Phase 1a 速率限制是后端中间件，E2E 验证需配合 Core 启动。建议在 Admin UI 集成测试中覆盖限流场景。

---

## 7. 种子数据

```
packages/rate-limit/src/__tests__/seeds/rate-limit-fixtures.ts
```

Rate Limit 模块无数据库依赖，种子数据仅用于测试中的 `RateLimiter` 实例配置：

```typescript
/** 测试用限流器配置工厂 */
export function createDefaultLimiter(windowMs: number = 60_000, max: number = 100): RateLimiter {
  return new RateLimiter({ windowMs, max })
}

/** 登录限流配置（5 次/分钟） */
export function createLoginLimiter(): RateLimiter {
  return new RateLimiter({ windowMs: 60_000, max: 5 })
}

/** 严格限流配置（1 次/秒，用于边界测试） */
export function createStrictLimiter(): RateLimiter {
  return new RateLimiter({ windowMs: 1_000, max: 1 })
}
```

---

## 8. Mock 策略

| 依赖 | 单元测试 | 集成测试 |
|------|---------|---------|
| 内存 Map | 真实 `RateLimiter` 实例 | 真实 `RateLimiter` 实例 |
| Fastify request | `{ ip, headers }` 结构类型 mock | `{ ip, headers }` 结构类型 mock |
| Fastify reply | `{ code, header, send }` 链式调用 mock | `{ code, header, send }` 链式调用 mock |
| 时间 | `vi.useFakeTimers()` + `vi.advanceTimersByTime()` | `vi.useFakeTimers()` + `vi.advanceTimersByTime()` |
| 共享类型 | `ErrorCode.RATE_LIMIT_EXCEEDED` 真实导入 | `ErrorCode.RATE_LIMIT_EXCEEDED` 真实导入 |

### Mock 约束

| 约束 | 说明 |
|------|------|
| 同步 API | `check()` 是同步方法，返回 `RateLimitResult` |
| 真实计数 | 测试使用真实 `RateLimiter` 实例，通过控制时间验证窗口行为 |
| 时间控制 | 使用 `vi.useFakeTimers()` + `vi.advanceTimersByTime()` 模拟窗口过期 |
| Map 隔离 | 每个 `RateLimiter` 实例有独立 Map，测试间无共享状态 |
| 结构类型 | 测试构造 `{ ip, headers }` 作为 request，`{ code, header, send }` 作为 reply |
| 方法记录 | reply mock 记录被调用的参数，测试断言 status/header/body |
| 无异步 | 中间件是同步函数（Phase 1a 内存存储无需 async） |

---

## 9. 覆盖率目标

| 指标 | 目标 | 关键路径 |
|------|:---:|------|
| 行覆盖率 | **85%+** | |
| 分支覆盖率 | **80%+** | check() 三条分支：新窗口 / 窗口内增量 / 超限 |
| 函数覆盖率 | **90%+** | check / reset / getCount / getMax / middleware |
| 单元 | 12+ | RateLimiter 全部方法 + 边界 + 窗口过期 |
| 集成 | 4+ | 完整请求流程 + 多 IP + 突发 + 窗口恢复 |
| 契约 | 4+ | 429 响应格式 + 全部 X-RateLimit-* 头 |

---

## 10. CI 集成

```yaml
rate-limit-test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - run: pnpm install --frozen-lockfile
    - run: pnpm --filter @audebase/rate-limit test:unit
    - run: pnpm --filter @audebase/rate-limit test:integration
```

**注**: Rate Limit 模块无外部依赖（仅内存 Map），CI 无需启动 PostgreSQL 或 Redis 服务。

---

## 11. 用例汇总

| 测试层 | 用例数 |
|--------|:---:|
| 单元 - RateLimiter | 16 |
| 单元 - Middleware | 8 |
| 集成 - 完整流程 | 4 |
| 契约 - 响应头/格式 | 5 |
| E2E - 限流/恢复 | 2 |
| **合计** | **35** |

---

## 12. 参考

- [rate-limit-sdd.md](rate-limit-sdd.md) — 速率限制模块 SDD
- [shared-types-tdd.md](shared-types-tdd.md) — ErrorCode 枚举
- [../../.agents/memorys/decisions.md](../../.agents/memorys/decisions.md) — GO-024 速率限制
- [api-conventions.md](api-conventions.md) — 错误响应格式约定
- [test-seed-strategy.md](test-seed-strategy.md) — 集成测试策略

> **上游 TDD 参考**: [shared-types-tdd.md §3.1](shared-types-tdd.md) — ErrorCode 枚举; [core-tdd.md](core-tdd.md) — Fastify 中间件集成