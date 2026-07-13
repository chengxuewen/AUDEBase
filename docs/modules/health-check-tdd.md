# Health Check TDD 测试策略

> **模块**: `@audebase/core`（health 子系统）  
> **依赖**: PostgreSQL, Redis (可选)  
> **更新日期**: 2026-07-13  
> **参考**: D1.13 (健康检查)、api-specification.md §6、test-seed-strategy.md §6.4

---

## 1. 测试范围

健康检查模块提供 `GET /health`（完整状态）和 `GET /health/ready`（Kubernetes readiness probe）两个端点。Phase 1a 无需认证，无需授权。

| 测试类型 | 最低用例数 | 数据库 |
|---------|:---:|------|
| 单元测试 | 5+ | 无 |
| 集成测试 | 4+ | 真实 PostgreSQL |
| 契约测试 | 3+ | 真实 PostgreSQL |
| E2E 测试 | 0 | 无需浏览器 |

---

## 2. 模块结构

```
packages/health-check/src/
├── health/
│   ├── routes.ts             # GET /health + GET /health/ready
│   └── service.ts            # HealthService (checkDB, checkRedis, getUptime)
├── __tests__/
│   ├── unit/
│   │   └── health.test.ts
│   ├── integration/
│   │   └── health.integration.test.ts
│   └── contracts/
│       └── health.contract.test.ts
```

---

## 3. 单元测试

```
测试文件: packages/health-check/src/__tests__/unit/health.test.ts
```

```typescript
import { describe, test, expect, vi } from 'vitest'
import { HealthService } from '../../health/service'

describe('HealthService', () => {
  test('DB 连接成功 → db: true', async () => {
    // Arrange
    const mockDb = { execute: vi.fn().mockResolvedValue(undefined) }

    // Act
    const health = new HealthService(mockDb as any, null)
    const result = await health.check()

    // Assert
    expect(result.db).toBe(true)
  })

  test('DB 连接失败 → db: false', async () => {
    // Arrange
    const mockDb = { execute: vi.fn().mockRejectedValue(new Error('timeout')) }

    // Act
    const health = new HealthService(mockDb as any, null)
    const result = await health.check()

    // Assert
    expect(result.db).toBe(false)
  })

  test('Redis 连接成功 → redis: true', async () => {
    // Arrange
    const mockRedis = { ping: vi.fn().mockResolvedValue('PONG') }
    const mockDb = { execute: vi.fn().mockResolvedValue(undefined) }

    // Act
    const health = new HealthService(mockDb as any, mockRedis as any)
    const result = await health.check()

    // Assert
    expect(result.redis).toBe(true)
  })

  test('无 Redis 时 (mock 模式) → redis 字段不存在', async () => {
    // Arrange
    const mockDb = { execute: vi.fn().mockResolvedValue(undefined) }

    // Act
    const health = new HealthService(mockDb as any, null)
    const result = await health.check()

    // Assert
    expect(result.redis).toBeUndefined()
  })

  test('uptime ≥ 0', async () => {
    // Arrange
    const mockDb = { execute: vi.fn().mockResolvedValue(undefined) }

    // Act
    const health = new HealthService(mockDb as any, null)
    const result = await health.check()

    // Assert
    expect(result.uptime).toBeGreaterThanOrEqual(0)
    expect(Number.isInteger(result.uptime)).toBe(true)
  })

  test('status 始终为 ok (当 DB 可用)', async () => {
    // Arrange
    const mockDb = { execute: vi.fn().mockResolvedValue(undefined) }

    // Act
    const health = new HealthService(mockDb as any, null)
    const result = await health.check()

    // Assert
    expect(result.status).toBe('ok')
  })
})
```

---

## 4. 集成测试

```
测试文件: packages/health-check/src/__tests__/integration/health.integration.test.ts
```

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { createTestApp, type TestApp } from '../helpers/createTestApp'
import { withTestApp } from '../helpers/db-lifecycle'

describe('GET /health 集成', () => {
  let test: TestApp

  beforeEach(async () => {
    test = await createTestApp()
  })

  afterEach(async () => {
    await test.cleanup()
  })

  test('正常 DB 连接 → 200 + db:true', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      const res = await app.inject({ method: 'GET', url: '/health' })

      // Assert
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.status).toBe('ok')
      expect(body.db).toBe(true)
      expect(body.uptime).toBeGreaterThanOrEqual(0)
    })
  })

  test('包含 version 和 timestamp', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      const res = await app.inject({ method: 'GET', url: '/health' })

      // Assert
      const body = res.json()
      expect(body.version).toBeDefined()
      expect(body.timestamp).toBeDefined()
      expect(new Date(body.timestamp).getTime()).not.toBeNaN()
    })
  })

  test('Redis 可用时 redis: true', async () => {
    // Arrange
    const { app } = await createTestApp({ withRedis: true })

    // Act
    const res = await app.inject({ method: 'GET', url: '/health' })

    // Assert
    expect(res.json().redis).toBe(true)
  })

  test('无需认证即可访问', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      const res = await app.inject({
        method: 'GET',
        url: '/health',
        // 无 Authorization header
      })

      // Assert
      expect(res.statusCode).toBe(200)
    })
  })
})

describe('GET /health/ready 集成', () => {
  test('DB 就绪 → 200', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      const res = await app.inject({ method: 'GET', url: '/health/ready' })

      // Assert
      expect(res.statusCode).toBe(200)
      expect(res.json().status).toBe('ready')
    })
  })

  test('无需认证即可访问', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      const res = await app.inject({ method: 'GET', url: '/health/ready' })

      // Assert
      expect(res.statusCode).toBe(200)
    })
  })
})
```

---

## 5. 契约测试

```
测试文件: packages/health-check/src/__tests__/contracts/health.contract.test.ts
```

```typescript
import { describe, test } from 'vitest'
import { withTestApp } from '../helpers/db-lifecycle'
import { validateContract } from '../helpers/contract'
import { healthResponseSchema, readyResponseSchema } from '@audebase/shared-types'

describe('GET /health 契约', () => {
  test('200 响应形状匹配 healthResponseSchema', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      // Assert
      await validateContract('GET', '/health', {
        response: healthResponseSchema,
        status: 200,
      })
    })
  })
})

describe('GET /health/ready 契约', () => {
  test('200 响应形状匹配 readyResponseSchema', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      // Assert
      await validateContract('GET', '/health/ready', {
        response: readyResponseSchema,
        status: 200,
      })
    })
  })

  test('DB 不可用 → 503', async () => {
    // Arrange
    // 模拟 DB 连接失败（使用无效连接串启动 app）
    const { app } = await createTestApp({ dbUrl: 'postgres://invalid:5432/nonexistent' })
    try {
      // Act
      const res = await app.inject({ method: 'GET', url: '/health/ready' })

      // Assert
      expect(res.statusCode).toBe(503)
      expect(res.json().status).toBe('not_ready')
    } finally {
      await app.close()
    }
  })
})
```

---

## 6. E2E 测试

健康检查不直接面向用户，但作为基础流程包含在 e2e-test-flows.md §5 flow 中：

```
GET /health → 200 + { status: "ok", db: true }
GET /health/ready → 200 + { status: "ready" }
```

验证 ProLayout 骨架渲染时隐含验证健康检查通过（否则前端无法加载）。

---

## 7. Mock 策略

| 依赖 | 单元测试 | 集成测试 |
|------|---------|---------|
| PostgreSQL | mock `db.execute()` | 真实 pg_tmp/Docker |
| Redis | mock `redis.ping()` | ioredis-mock |
| Fastify | 不涉及 | 真实 Fastify |

---

## 8. 覆盖率目标

| 指标 | 目标 | 关键路径 |
|------|:---:|------|
| 行覆盖率 | **85%+** | |
| 分支覆盖率 | **80%+** | DB 正常/失败、Redis 存在/不存在 |
| 函数覆盖率 | **100%** | HealthService.check()、路由处理函数 |
| 集成 | 4+ | /health + /health/ready + DB up/down |

---

## 9. 用例汇总

| 测试层 | 文件 | 用例数 |
|--------|------|:---:|
| 单元 | `health.test.ts` | 6 |
| 集成 | `health.integration.test.ts` | 6 |
| 契约 | `health.contract.test.ts` | 3 |
| E2E | (包含在 health.e2e.ts) | 0 |
| **合计** | | **15** |

---

## 10. 参考

- [api-specification.md](api-specification.md) §6 — GET /health + GET /health/ready
- [test-seed-strategy.md](test-seed-strategy.md) §6.4 — core 集成测试目标
- [../../.agents/memorys/decisions.md](../../.agents/memorys/decisions.md) — D1.13 健康检查
- **上游 TDD 参考**: [shared-types-tdd.md](shared-types-tdd.md) — healthResponseSchema / readyResponseSchema 定义
