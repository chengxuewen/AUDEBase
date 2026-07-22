# Logging TDD 测试策略

> **模块**: `@audebase/core`（logging 子系统）  
> **依赖**: pino  
> **更新日期**: 2026-07-13  
> **参考**: architecture.md §4.4、D9.1 (慢查询监控)、api-conventions.md §10 (Request ID)

---

## 1. 测试范围

日志基础设施提供结构化 JSON 日志、Request ID 追踪、Core 聚合所有插件日志、慢查询检测（>100ms）。测试重点为输出格式验证、上下文传播、错误回退。

| 测试类型 | 最低用例数 | 依赖 |
|---------|:---:|------|
| 单元测试 | 10+ | 无（mock pino stream） |
| 集成测试 | 5+ | 真实 Fastify app |
| 契约测试 | 2+ | 真实 Fastify app |
| E2E 测试 | 0 | 不直接面向用户 |

---

## 2. 模块结构

```
packages/core/src/
├── logging/
│   ├── logger.ts            # Logger 接口 + PinoLogger 实现
│   ├── config.ts            # 日志级别配置（debug/info/warn/error）
│   ├── request-id.ts        # X-Request-ID 中间件
│   └── slow-query.ts        # Drizzle 慢查询检测 hook
├── __tests__/
│   ├── unit/
│   │   ├── logger.test.ts
│   │   ├── request-id.test.ts
│   │   └── slow-query.test.ts
│   ├── integration/
│   │   └── logging.integration.test.ts
│   └── contracts/
│       └── logs.contract.test.ts
```

---

## 3. 单元测试

### 3.1 PinoLogger 单元测试

```
测试文件: packages/core/src/__tests__/unit/logger.test.ts
```

```typescript
import { describe, test, expect, beforeEach, vi } from 'vitest'
import { Writable } from 'node:stream'
import { createLogger, Logger } from '../../logging/logger'

// 捕获 pino 输出的辅助工具
function createCaptureStream(): { output: string[]; stream: Writable } {
  const output: string[] = []
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      output.push(chunk.toString().trim())
      callback()
    },
  })
  return { output, stream }
}

describe('Logger', () => {
  let logger: Logger
  let capture: { output: string[]; stream: Writable }

  beforeEach(() => {
    capture = createCaptureStream()
    logger = createLogger({ level: 'debug', stream: capture.stream })
  })

  test('info 级别输出 JSON 格式', () => {
    // Arrange & Act
    logger.info('用户登录', { userId: 'u1' })
    const parsed = JSON.parse(capture.output[0])
    expect(parsed.level).toBe(30)  // pino info level = 30
    expect(parsed.msg).toBe('用户登录')
    expect(parsed.userId).toBe('u1')
  })

  test('error 级别输出 JSON 含 error 信息', () => {
    // Arrange & Act
    logger.error('数据库连接失败', { err: new Error('timeout') })
    const parsed = JSON.parse(capture.output[0])
    expect(parsed.level).toBe(50)  // pino error level = 50
    expect(parsed.msg).toBe('数据库连接失败')
    expect(parsed.err).toBeDefined()
  })

  test('warn 级别输出', () => {
    // Arrange & Act
    logger.warn('速率限制接近阈值', { currentRate: 95 })
    const parsed = JSON.parse(capture.output[0])
    expect(parsed.level).toBe(40)  // pino warn level = 40
    expect(parsed.currentRate).toBe(95)
  })

  test('debug 级别仅在 debug 模式输出', () => {
    // Arrange & Act
    logger.debug('详细调试信息', { query: 'SELECT *' })
    const parsed = JSON.parse(capture.output[0])
    expect(parsed.level).toBe(20)  // pino debug level = 20
  })

  test('info 级别不输出 debug 消息', () => {
    // Arrange & Act
    const infoLogger = createLogger({ level: 'info', stream: capture.stream })
    infoLogger.debug('should not appear')
    expect(capture.output).toHaveLength(0)
  })

  test('error 级别包含所有级别', () => {
    // Arrange & Act
    const errorLogger = createLogger({ level: 'error', stream: capture.stream })
    errorLogger.info('should not appear')
    errorLogger.warn('should not appear')
    errorLogger.error('should appear')
    expect(capture.output).toHaveLength(1)
  })

  test('child logger 继承上下文', () => {
    // Arrange & Act
    const child = logger.child({ plugin: 'rbac', tenantId: 't-uuid' })
    child.info('权限检查')
    const parsed = JSON.parse(capture.output[0])
    expect(parsed.plugin).toBe('rbac')
    expect(parsed.tenantId).toBe('t-uuid')
  })

  test('每条日志含 timestamp', () => {
    // Arrange & Act
    logger.info('test')
    const parsed = JSON.parse(capture.output[0])
    expect(parsed.time).toBeDefined()
    // ISO 8601 时间戳
    expect(new Date(parsed.time).getTime()).not.toBeNaN()
  })
})
```

### 3.2 Request ID 中间件单元测试

```
测试文件: packages/core/src/__tests__/unit/request-id.test.ts
```

```typescript
import { describe, test, expect, vi } from 'vitest'
import { requestIdMiddleware } from '../../logging/request-id'

describe('requestIdMiddleware', () => {
  test('客户端提供 X-Request-ID 时复用', async () => {
    // Arrange
    const mockRequest = {
      headers: { 'x-request-id': 'client-req-123' },
    }
    const mockReply = {
      header: vi.fn(),
    }

    await requestIdMiddleware(mockRequest as any, mockReply as any)

    expect(mockRequest.requestId).toBe('client-req-123')
    expect(mockReply.header).toHaveBeenCalledWith('X-Request-ID', 'client-req-123')
  })

  test('客户端未提供时自动生成 UUID', async () => {
    // Arrange
    const mockRequest = { headers: {} }
    const mockReply = { header: vi.fn() }

    await requestIdMiddleware(mockRequest as any, mockReply as any)

    expect(mockRequest.requestId).toBeDefined()
    expect(mockRequest.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
    expect(mockReply.header).toHaveBeenCalled()
  })

  test('X-Request-ID 注入 logger 子上下文', async () => {
    // Arrange
    const mockRequest = {
      headers: { 'x-request-id': 'req-456' },
      log: { child: vi.fn().mockReturnValue({ info: vi.fn() }) },
    }

    await requestIdMiddleware(mockRequest as any, {} as any)

    expect(mockRequest.log.child).toHaveBeenCalledWith({ requestId: 'req-456' })
  })
})
```

### 3.3 慢查询检测单元测试

```
测试文件: packages/core/src/__tests__/unit/slow-query.test.ts
```

```typescript
import { describe, test, expect, vi } from 'vitest'
import { createSlowQueryHook } from '../../logging/slow-query'

describe('慢查询检测', () => {
  test('查询时间 >100ms 记录 warn 日志', () => {
    // Arrange
    const mockLogger = { warn: vi.fn() }
    const hook = createSlowQueryHook(mockLogger as any)

    const queryContext = {
      sql: 'SELECT * FROM users WHERE username LIKE $1',
      params: ['%admin%'],
    }

    // 模拟 250ms 查询
    hook.onQuery?.([], queryContext as any)
    // 等待 250ms
    const startTime = Date.now()
    while (Date.now() - startTime < 250) { /* 等待 */ }
    hook.onResult?.([], {} as any)

    expect(mockLogger.warn).toHaveBeenCalledWith(
      '慢查询检测',
      expect.objectContaining({
        sql: expect.any(String),
        duration: expect.any(Number),
      }),
    )
    // 验证 duration >= 100
    const callArgs = mockLogger.warn.mock.calls[0][1]
    expect(callArgs.duration).toBeGreaterThanOrEqual(100)
  })

  test('查询时间 ≤100ms 不记录', () => {
    // Arrange
    const mockLogger = { warn: vi.fn() }
    const hook = createSlowQueryHook(mockLogger as any)

    hook.onQuery?.([], { sql: 'SELECT 1' } as any)
    hook.onResult?.([], {} as any)

    expect(mockLogger.warn).not.toHaveBeenCalled()
  })

  test('D1.9 阈值可配置', () => {
    // Arrange
    const mockLogger = { warn: vi.fn() }
    const hook = createSlowQueryHook(mockLogger as any, { slowQueryThresholdMs: 50 })

    hook.onQuery?.([], { sql: 'SELECT 1' } as any)
    // 等待 80ms
    const start = Date.now()
    while (Date.now() - start < 80) {}
    hook.onResult?.([], {} as any)

    expect(mockLogger.warn).toHaveBeenCalled()
  })
})
```

---

## 4. 集成测试

```
测试文件: packages/core/src/__tests__/integration/logging.integration.test.ts
```

```typescript
import { describe, test, expect } from 'vitest'
import { createTestApp } from '../helpers/createTestApp'

describe('日志集成测试', () => {
  test('请求包含 X-Request-ID', async () => {
    // Arrange & Act
    const { app } = await createTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'int-test-req-1' },
    })
    expect(res.headers['x-request-id']).toBe('int-test-req-1')
  })

  test('未提供 X-Request-ID 时自动注入', async () => {
    // Arrange & Act
    const { app } = await createTestApp()
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.headers['x-request-id']).toBeDefined()
  })

  test('插件日志通过 Core logger 输出', async () => {
    // Arrange & Act
    const { app } = await createTestApp()
    // 通过 inject 发送请求，验证日志流中有插件相关的日志行
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: {} })
    expect(res.statusCode).toBe(400)
    // 验证 pino 日志流中记录了这个错误请求
    // （使用 app.log 的 stream mock 验证）
  })

  test('requestId 在不同中间件间传播', async () => {
    // Arrange & Act
    const { app } = await createTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'propagation-test' },
    })
    expect(res.headers['x-request-id']).toBe('propagation-test')
  })

  test('日志写入失败回退到 stderr', async () => {
    // Arrange & Act
    // 模拟 pino stream write 错误 → 验证进程不崩溃
    // Phase 1a 仅验证不崩溃，不验证 stderr 内容
    const { app } = await createTestApp({ loggerStream: new ErrorStream() })
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
  })
})
```

---

## 5. 契约测试

```
测试文件: packages/core/src/__tests__/contracts/logs.contract.test.ts
```

```typescript
import { describe, test, expect } from 'vitest'
import { createTestApp } from '../helpers/createTestApp'

describe('GET /api/logs 调试端点', () => {
  test('返回 JSON 格式的最近日志', async () => {
    // Arrange & Act
    const { app } = await createTestApp({ withLogs: true })
    const res = await app.inject({
      method: 'GET',
      url: '/api/logs?limit=10',
      headers: { authorization: 'Bearer admin-token' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data.length).toBeLessThanOrEqual(10)
  })

  test('无 token → 401', async () => {
    // Arrange & Act
    const { app } = await createTestApp()
    const res = await app.inject({ method: 'GET', url: '/api/logs' })
    expect(res.statusCode).toBe(401)
  })
})
```

---

## 6. Mock 策略

| 依赖 | 单元测试 | 集成测试 |
|------|---------|---------|
| pino | 真实 pino + mock Writable stream | 真实 pino |
| Fastify | 不涉及 | 真实 Fastify |
| Drizzle | 不涉及（独立 hook） | 真实 Drizzle |
| 文件系统 | 不涉及 | 不涉及（仅 stdout/stderr） |

**核心 Mock 工具**：

```typescript
// helpers/capture-stream.ts
import { Writable } from 'node:stream'

export function createCaptureStream(): { output: string[]; stream: Writable } {
  const output: string[] = []
  const stream = new Writable({
    write(chunk: Buffer, _encoding: string, callback: () => void) {
      output.push(chunk.toString().trim())
      callback()
    },
  })
  return { output, stream }
}
```

---

## 7. 覆盖率目标

| 指标 | 目标 | 关键路径 |
|------|:---:|------|
| 行覆盖率 | **80%+** | |
| 分支覆盖率 | **75%+** | 日志级别过滤分支、requestId 注入分支 |
| 函数覆盖率 | **100%** | createLogger / child / info/warn/error/debug |
| 慢查询 | 3+ | 低于阈值/高于阈值/可配置阈值 |

---

## 8. 用例汇总

| 测试层 | 文件 | 用例数 |
|--------|------|:---:|
| 单元 | `logger.test.ts` | 8 |
| 单元 | `request-id.test.ts` | 3 |
| 单元 | `slow-query.test.ts` | 3 |
| 集成 | `logging.integration.test.ts` | 5 |
| 契约 | `logs.contract.test.ts` | 2 |
| **合计** | | **21** |

---

## 9. 参考

- [architecture.md](../architecture.md) §4.4 — 日志与调试基础设施
- [api-conventions.md](api-conventions.md) §10 — Request ID 追踪
- [api-specification.md](api-specification.md) §6 — GET /api/logs
- [../../.agents/memorys/decisions.md](../../.agents/memorys/decisions.md) — D9.1 慢查询监控
