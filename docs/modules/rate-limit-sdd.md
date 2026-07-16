# SDD: Rate Limit Module

**Module**: `@audebase/rate-limit`
**Package Path**: `packages/rate-limit/`
**Phase**: Phase 1a (#14)
**Status**: SDD Complete
**Decision References**: GO-024, architecture.md §速率限制, phase-planning.md #14

---

## 1. 概要

### 模块定位

Rate Limit 模块为 AUDEBase 平台提供 HTTP 请求频率限制能力。作为横切关注点中间件，在 Fastify 请求处理管线中拦截超频请求，返回 429 状态码 + `RATE_LIMIT_EXCEEDED` 错误码。

### 职责边界

| 范围 | 说明 |
|------|------|
| **负责** | 内存计数器（fixed window）、请求频率检查、429 响应生成、Retry-After 头 |
| **不负责** | Redis 分布式限流（Phase 1b）、RBAC 权限判断、请求路由、业务逻辑 |

### 设计目标

1. **零外部依赖** - Phase 1a 仅使用内存 Map，不依赖 Redis 或外部库
2. **可插拔** - 通过接口抽象，Phase 1b 可替换为 Redis 后端
3. **Fastify 兼容** - 中间件签名匹配 Fastify hook 约定，但仅通过 structural typing 引用，不硬依赖 fastify
4. **多租户感知** - key 生成器支持按 IP / 用户 / 租户维度限流
5. **配置驱动** - window 大小、max 请求数、key 生成函数均可配置

---

## 2. 接口定义

### RateLimitOptions

```typescript
interface RateLimitOptions {
  /** Time window in milliseconds */
  windowMs: number
  /** Max requests per window */
  max: number
  /** Custom key generator (default: IP-based). Receives request object. */
  keyGenerator?: (request: unknown) => string
}
```

### RateLimitResult

```typescript
interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean
  /** Seconds until the client should retry (0 if allowed) */
  retryAfter: number
  /** Remaining requests in current window */
  remaining: number
  /** Unix timestamp (ms) when the window resets */
  resetAt: number
}
```

### RateLimiter Class

```typescript
class RateLimiter {
  constructor(options: RateLimitOptions)

  /**
   * Check if a request with the given key should be allowed.
   * Increments the counter if allowed.
   */
  check(key: string): RateLimitResult

  /** Reset all entries */
  reset(): void

  /** Get current count for a key (without incrementing) */
  getCount(key: string): number
}
```

### createRateLimitMiddleware Function

```typescript
interface MiddlewareOptions {
  /** Custom key generator for the middleware layer */
  keyGenerator?: (request: unknown) => string
}

/**
 * Create a Fastify-compatible rate limit middleware.
 * Returns a function (request, reply) => void that blocks over-limit requests.
 */
function createRateLimitMiddleware(
  limiter: RateLimiter,
  options?: MiddlewareOptions,
): (request: unknown, reply: unknown) => void
```

### Public Exports (index.ts)

```typescript
export { RateLimiter } from './rate-limiter.js'
export { createRateLimitMiddleware } from './middleware.js'
export type { RateLimitOptions, RateLimitResult, MiddlewareOptions } from './types.js'
```

---

## 3. 生命周期

### 初始化

```
Core 启动
  -> new RateLimiter({ windowMs: 60000, max: 100 })
  -> createRateLimitMiddleware(limiter, { keyGenerator: ipKeyGenerator })
  -> fastify.addHook('onRequest', middleware)
```

### 请求处理流程

```
Request 进入
  -> middleware 提取 key (IP / userId / tenantId)
  -> limiter.check(key)
  -> allowed?
     YES -> return (请求继续)
     NO  -> reply.code(429)
            reply.header('Retry-After', retryAfter)
            reply.send({ error: { code: 'RATE_LIMIT_EXCEEDED', message: '...' } })
```

### 关闭

无特殊关闭逻辑。内存计数器随进程退出自动释放。

---

## 4. 依赖关系

| 依赖 | 类型 | 用途 |
|------|------|------|
| `@audebase/shared-types` | workspace | `ErrorCode.RATE_LIMIT_EXCEEDED` |

**无运行时依赖**。不依赖 fastify（中间件通过 structural typing 接口 request/reply）。

### Phase 1b 预留接口

```typescript
// Phase 1b: Redis backend (not implemented in Phase 1a)
interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>
  reset(key: string): Promise<void>
}

// InMemoryStore implements RateLimitStore (Phase 1a)
// RedisStore implements RateLimitStore (Phase 1b)
```

---

## 5. 错误码与错误处理

| 错误码 | HTTP | 场景 | 恢复策略 |
|--------|------|------|----------|
| `RATE_LIMIT_EXCEEDED` | 429 | 请求频率超过窗口限制 | 客户端等待 Retry-After 秒后重试 |

### 429 响应格式

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "请求过于频繁，请稍后再试"
  }
}
```

### 响应头

| Header | 说明 |
|--------|------|
| `Retry-After` | 重试等待秒数（整数） |
| `X-RateLimit-Limit` | 窗口最大请求数 |
| `X-RateLimit-Remaining` | 剩余请求数 |
| `X-RateLimit-Reset` | 窗口重置 Unix 时间戳（秒） |

---

## 6. 安全考虑

### 防暴力破解

- `/api/auth/login` 端点配置 5 次/分钟 per-IP 限制
- 全局 100 次/分钟 per-IP 限制
- 超限时返回 429，不泄露内部状态

### 多租户隔离

- Key 生成器可按 `tenant_id` 维度限流，确保单租户不影响其他租户
- 默认 per-IP 限流，防止跨租户攻击

### 内存安全

- 惰性清理过期条目（访问时清理）
- Map 大小不设硬上限（Phase 1a 单进程，请求量可控）
- Phase 1b Redis 后端天然解决分布式内存问题

### 信息泄露防护

- 429 响应仅返回错误码 + 通用消息，不暴露内部计数器状态
- `X-RateLimit-*` 头仅返回聚合信息，不泄露其他 key 的数据

---

## 7. Mock 约束

### 测试中 RateLimiter 的 mock 约束

| 约束 | 说明 |
|------|------|
| 同步 API | `check()` 是同步方法，返回 `RateLimitResult` |
| 真实计数 | 测试使用真实 `RateLimiter` 实例（非 mock），通过控制时间验证窗口行为 |
| 时间控制 | 使用 `vi.useFakeTimers()` + `vi.advanceTimersByTime()` 模拟窗口过期 |
| Map 隔离 | 每个 `RateLimiter` 实例有独立 Map，测试间无共享状态 |

### 测试中 request/reply 的 mock 约束

| 约束 | 说明 |
|------|------|
| Structural typing | 测试构造 `{ ip, headers }` 作为 request，`{ code, header, send }` 作为 reply |
| 方法记录 | reply mock 记录被调用的参数，测试断言 status/header/body |
| 无异步 | 中间件是同步函数（Phase 1a 内存存储无需 async） |

---

## 8. 变更记录

| 日期 | 变更 |
|------|------|
| 2026-07-16 | 初始 SDD 创建 - Phase 1a 内存限流，fixed window 算法 |
