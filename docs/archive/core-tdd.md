# Core 内核骨架 TDD 测试策略

> **模块**: `@audebase/core`
> **依赖**: `@audebase/shared-types`, `@audebase/plugin-core`, `@audebase/auth`, `@audebase/rbac`, `@audebase/audit`, `@audebase/health-check`, `@audebase/rate-limit`, `@audebase/logging-infra`
> **更新日期**: 2026-07-17
> **参考**: core-sdd.md, GO-021/003/005/008/025/029/030, decisions.md D5/D8/D8.1/D9/D9.1/D12/D1.13

---

## 1. 测试策略概述

Core 内核是 AUDEBase 平台的启动入口和运行时基础设施。它负责创建 Fastify 应用实例、注册中间件链、管理数据库连接、协调插件生命周期、提供全局错误处理和优雅关闭。

| 测试类型 | 最低用例数 | 数据库 | 重点覆盖 |
|---------|:---:|------|---------|
| 单元测试 | 45+ | 无（mock DB / mock Redis） | CoreApp 生命周期、配置校验、中间件链、错误处理器、DatabaseProvider、DataProxy、CORS、速率限制、优雅关闭 |
| 集成测试 | 12+ | 真实 PostgreSQL 16 | 启动/关闭流程、路由注册、中间件串联、健康检查、请求 ID 传播 |
| 契约测试 | 6+ | 真实 PostgreSQL 16 | 健康检查端点响应形状、错误响应格式 |
| E2E 测试 | 1 流程 | Docker PostgreSQL + Valkey | 完整启动到健康检查到请求到关闭 |

**测试金字塔原则**:
- 单元测试 mock 所有外部依赖，专注于单一逻辑和状态机验证
- 集成测试启动真实 Fastify 实例 + PostgreSQL 数据库
- 契约测试确保 API 响应形状与 shared-types schema 一致
- 所有测试遵循 AAA 模式（Arrange / Act / Assert）

---

## 2. 模块结构

```
packages/core/
├── src/
│   ├── index.ts                    # 统一导出
│   ├── app.ts                      # CoreApp 应用入口
│   ├── config.ts                   # 环境变量 Zod schema + loadConfig
│   ├── logger.ts                   # pino logger 封装
│   ├── db/
│   │   ├── connection.ts           # pg-pool 连接池创建
│   │   ├── schema.ts               # Drizzle schema 定义
│   │   ├── provider.ts             # DatabaseProvider 接口 + 实现
│   │   └── data-proxy.ts           # DataProxy 数据代理实现
│   ├── middleware/
│   │   ├── request-id.ts           # X-Request-ID 注入中间件
│   │   ├── cors.ts                 # CORS 配置
│   │   ├── error-handler.ts        # 全局错误处理器
│   │   ├── rate-limit.ts           # 速率限制配置
│   │   ├── tenant.ts               # 租户上下文中间件
│   │   └── audit.ts                # 审计日志中间件（桥接到 audit 模块）
│   ├── hooks/
│   │   └── slow-query.ts           # 慢查询检测 Hook
│   ├── health/
│   │   ├── service.ts              # HealthService 健康检查
│   │   └── routes.ts               # 健康检查路由注册
│   ├── logs/
│   │   └── log-routes.ts           # 日志查询路由
│   ├── routes/
│   │   ├── auth.routes.ts          # 认证路由（待 auth 模块）
│   │   ├── user.routes.ts          # 用户管理路由
│   │   ├── role.routes.ts          # 角色管理路由
│   │   ├── plugin.routes.ts        # 插件管理路由
│   │   └── audit-log.routes.ts     # 审计日志查询路由
│   └── __tests__/
│       ├── helpers/
│       │   ├── createTestApp.ts    # TestApp 工厂
│       │   ├── db-lifecycle.ts     # 数据库生命周期管理
│       │   ├── mocks.ts            # 通用 mock 工厂
│       │   └── contract.ts         # 契约验证辅助
│       ├── seeds/
│       │   └── admin.ts            # admin 用户种子
│       ├── unit/
│       │   ├── app.test.ts         # CoreApp 生命周期
│       │   ├── config.test.ts      # 环境变量校验
│       │   ├── logger.test.ts      # Logger 单元测试
│       │   ├── health.test.ts      # 健康检查服务
│       │   ├── error-handler.test.ts
│       │   ├── cors.test.ts
│       │   ├── rate-limit.test.ts
│       │   ├── request-id.test.ts
│       │   ├── slow-query.test.ts
│       │   ├── tenant.test.ts
│       │   ├── db-provider.test.ts
│       │   └── data-proxy.test.ts
│       ├── integration/
│       │   ├── core.integration.test.ts
│       │   ├── middleware.integration.test.ts
│       │   └── routes.integration.test.ts
│       └── contracts/
│           └── health.contract.test.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## 3. 单元测试

### 3.1 CoreApp 生命周期

```
测试文件: packages/core/src/__tests__/unit/app.test.ts
```

```typescript
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { CoreApp } from '../../app'
import { createMockDb, createMockRedis } from '../helpers/mocks'

describe('CoreApp.bootstrap', () => {
  let app: CoreApp

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await app?.stop().catch(() => {})
  })

  test('bootstrap 成功创建 Fastify 实例并注册中间件链', async () => {
    // Arrange
    const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), child: vi.fn() }
    const mockDb = createMockDb()
    const mockRedis = createMockRedis()
    app = new CoreApp({ logger: mockLogger as any })

    // Act
    await app.bootstrap({ db: mockDb, redis: mockRedis })

    // Assert
    expect(app.fastify).toBeDefined()
    expect(app.db).toBe(mockDb)
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ port: expect.any(Number) }),
      expect.any(String),
    )
  })

  test('bootstrap 时数据库连接失败抛出 DB_UNAVAILABLE', async () => {
    // Arrange
    const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), child: vi.fn() }
    const failingDb = createMockDb({ pingRejects: true })
    app = new CoreApp({ logger: mockLogger as any })

    // Act & Assert
    await expect(
      app.bootstrap({ db: failingDb, redis: null }),
    ).rejects.toThrow('DB_UNAVAILABLE')
  })

  test('bootstrap 时 Redis 连接失败不阻塞启动（Redis 可选）', async () => {
    // Arrange
    const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), child: vi.fn() }
    const mockDb = createMockDb()
    const failingRedis = createMockRedis({ pingRejects: true })
    app = new CoreApp({ logger: mockLogger as any })

    // Act
    await app.bootstrap({ db: mockDb, redis: failingRedis })

    // Assert
    expect(app.fastify).toBeDefined()
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Redis'),
      expect.any(Object),
    )
  })
})

describe('CoreApp.start', () => {
  test('start 监听配置端口并注册信号处理器', async () => {
    // Arrange
    const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), child: vi.fn() }
    const mockDb = createMockDb()
    const app = new CoreApp({ logger: mockLogger as any })
    await app.bootstrap({ db: mockDb, redis: null })
    const listenSpy = vi.spyOn(app.fastify, 'listen').mockResolvedValue(undefined)

    // Act
    await app.start()

    // Assert
    expect(listenSpy).toHaveBeenCalledWith(expect.objectContaining({ port: 3000 }))
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('started'))
  })
})

describe('CoreApp.stop', () => {
  test('stop 按顺序关闭 HTTP -> 数据库 -> Redis', async () => {
    // Arrange
    const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), child: vi.fn() }
    const mockDb = createMockDb()
    const mockRedis = createMockRedis()
    const app = new CoreApp({ logger: mockLogger as any })
    await app.bootstrap({ db: mockDb, redis: mockRedis })
    await app.start()

    // Act
    await app.stop()

    // Assert
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Shutting down'))
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('complete'))
  })

  test('stop 在空闲时 30 秒内完成（不触发强制退出超时）', async () => {
    // Arrange
    const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), child: vi.fn() }
    const mockDb = createMockDb()
    const app = new CoreApp({ logger: mockLogger as any })
    await app.bootstrap({ db: mockDb, redis: null })

    // Act
    const startTime = Date.now()
    await app.stop()
    const elapsed = Date.now() - startTime

    // Assert
    expect(elapsed).toBeLessThan(30000)
  })

  test('多次 stop 调用幂等', async () => {
    // Arrange
    const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), child: vi.fn() }
    const mockDb = createMockDb()
    const app = new CoreApp({ logger: mockLogger as any })
    await app.bootstrap({ db: mockDb, redis: null })

    // Act & Assert
    await expect(app.stop()).resolves.not.toThrow()
    await expect(app.stop()).resolves.not.toThrow()
  })

  test('SIGTERM 信号触发 stop 流程', async () => {
    // Arrange
    const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), child: vi.fn() }
    const mockDb = createMockDb()
    const app = new CoreApp({ logger: mockLogger as any })
    await app.bootstrap({ db: mockDb, redis: null })
    const stopSpy = vi.spyOn(app, 'stop')

    // Act - 模拟 SIGTERM
    process.emit('SIGTERM' as any)

    // Assert
    expect(stopSpy).toHaveBeenCalled()
  })

  test('SIGINT 信号触发 stop 流程', async () => {
    // Arrange
    const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), child: vi.fn() }
    const mockDb = createMockDb()
    const app = new CoreApp({ logger: mockLogger as any })
    await app.bootstrap({ db: mockDb, redis: null })
    const stopSpy = vi.spyOn(app, 'stop')

    // Act - 模拟 SIGINT
    process.emit('SIGINT' as any)

    // Assert
    expect(stopSpy).toHaveBeenCalled()
  })
})
```
### 3.2 环境变量配置校验

```
测试文件: packages/core/src/__tests__/unit/config.test.ts
```

```typescript
import { describe, test, expect } from 'vitest'
import { loadConfig } from '../../config'

describe('loadConfig', () => {
  test('所有必需环境变量合法时返回完整配置', () => {
    // Arrange
    const env = {
      AUDE_JWT_SECRET: 'a'.repeat(32),
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
      PORT: '4000',
      NODE_ENV: 'development',
    }

    // Act
    const config = loadConfig(env)

    // Assert
    expect(config.AUDE_JWT_SECRET).toBe('a'.repeat(32))
    expect(config.DATABASE_URL).toBe('postgres://user:pass@localhost:5432/db')
    expect(config.PORT).toBe(4000)
    expect(config.NODE_ENV).toBe('development')
  })

  test('AUDE_JWT_SECRET 少于 32 字符时抛出 ZodError', () => {
    // Arrange
    const env = {
      AUDE_JWT_SECRET: 'short',
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
    }

    // Act & Assert
    expect(() => loadConfig(env)).toThrow()
  })

  test('AUDE_JWT_SECRET 为空时抛出 ZodError', () => {
    // Arrange
    const env = {
      AUDE_JWT_SECRET: '',
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
    }

    // Act & Assert
    expect(() => loadConfig(env)).toThrow()
  })

  test('DATABASE_URL 非 postgres:// 开头时抛出 ZodError', () => {
    // Arrange
    const env = {
      AUDE_JWT_SECRET: 'a'.repeat(32),
      DATABASE_URL: 'mysql://user:pass@localhost:3306/db',
    }

    // Act & Assert
    expect(() => loadConfig(env)).toThrow()
  })

  test('PORT 缺失时默认 3000', () => {
    // Arrange & Act
    const config = loadConfig({
      AUDE_JWT_SECRET: 'a'.repeat(32),
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
    })
    expect(config.PORT).toBe(3000)
  })

  test('NODE_ENV 缺失时默认 development', () => {
    // Arrange & Act
    const config = loadConfig({
      AUDE_JWT_SECRET: 'a'.repeat(32),
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
    })
    expect(config.NODE_ENV).toBe('development')
  })

  test('AUDE_LOG_LEVEL 缺失时默认 info', () => {
    // Arrange & Act
    const config = loadConfig({
      AUDE_JWT_SECRET: 'a'.repeat(32),
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
    })
    expect(config.AUDE_LOG_LEVEL).toBe('info')
  })

  test('AUDE_SLOW_QUERY_THRESHOLD_MS 缺失时默认 100', () => {
    // Arrange & Act
    const config = loadConfig({
      AUDE_JWT_SECRET: 'a'.repeat(32),
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
    })
    expect(config.AUDE_SLOW_QUERY_THRESHOLD_MS).toBe(100)
  })

  test('AUDE_DB_POOL_MAX 缺失时默认 10', () => {
    // Arrange & Act
    const config = loadConfig({
      AUDE_JWT_SECRET: 'a'.repeat(32),
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
    })
    expect(config.AUDE_DB_POOL_MAX).toBe(10)
  })

  test('AUDE_JWT_ACCESS_TTL 缺失时默认 900', () => {
    // Arrange & Act
    const config = loadConfig({
      AUDE_JWT_SECRET: 'a'.repeat(32),
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
    })
    expect(config.AUDE_JWT_ACCESS_TTL).toBe(900)
  })

  test('AUDE_JWT_REFRESH_TTL 缺失时默认 604800', () => {
    // Arrange & Act
    const config = loadConfig({
      AUDE_JWT_SECRET: 'a'.repeat(32),
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
    })
    expect(config.AUDE_JWT_REFRESH_TTL).toBe(604800)
  })

  test('AUDE_BCRYPT_COST 缺失时默认 12', () => {
    // Arrange & Act
    const config = loadConfig({
      AUDE_JWT_SECRET: 'a'.repeat(32),
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
    })
    expect(config.AUDE_BCRYPT_COST).toBe(12)
  })

  test('REDIS_URL 可选 -- 缺失时不报错', () => {
    // Arrange & Act & Assert
    expect(() => loadConfig({
      AUDE_JWT_SECRET: 'a'.repeat(32),
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
    })).not.toThrow()
  })

  test('NODE_ENV 为 production 时 loadConfig 成功', () => {
    // Arrange & Act
    const config = loadConfig({
      NODE_ENV: 'production',
      AUDE_JWT_SECRET: 'a'.repeat(32),
      DATABASE_URL: 'postgres://user:pass@prod-host:5432/db',
      PORT: '8080',
    })
    expect(config.NODE_ENV).toBe('production')
    expect(config.PORT).toBe(8080)
  })

  test('NODE_ENV 为 test 时 loadConfig 成功', () => {
    // Arrange & Act
    const config = loadConfig({
      NODE_ENV: 'test',
      AUDE_JWT_SECRET: 'a'.repeat(32),
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db_test',
    })
    expect(config.NODE_ENV).toBe('test')
  })

  test('NODE_ENV 非法值时抛出 ZodError', () => {
    // Arrange & Act & Assert
    expect(() => loadConfig({
      NODE_ENV: 'staging',
      AUDE_JWT_SECRET: 'a'.repeat(32),
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
    })).toThrow()
  })

  test('PORT 为 0 时抛出 ZodError', () => {
    // Arrange & Act & Assert
    expect(() => loadConfig({
      AUDE_JWT_SECRET: 'a'.repeat(32),
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
      PORT: '0',
    })).toThrow()
  })

  test('AUDE_DB_POOL_MAX 为 0 时抛出 ZodError', () => {
    // Arrange & Act & Assert
    expect(() => loadConfig({
      AUDE_JWT_SECRET: 'a'.repeat(32),
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
      AUDE_DB_POOL_MAX: '0',
    })).toThrow()
  })

  test('AUDE_BCRYPT_COST 为 9 时抛出 ZodError（低于最小值 10）', () => {
    // Arrange & Act & Assert
    expect(() => loadConfig({
      AUDE_JWT_SECRET: 'a'.repeat(32),
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
      AUDE_BCRYPT_COST: '9',
    })).toThrow()
  })

  test('AUDE_BCRYPT_COST 为 16 时抛出 ZodError（超过最大值 15）', () => {
    // Arrange & Act & Assert
    expect(() => loadConfig({
      AUDE_JWT_SECRET: 'a'.repeat(32),
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
      AUDE_BCRYPT_COST: '16',
    })).toThrow()
  })
})
```

### 3.3 Logger 单元测试

```
测试文件: packages/core/src/__tests__/unit/logger.test.ts
```

```typescript
import { describe, test, expect, vi } from 'vitest'
import { Writable } from 'stream'
import { createLogger } from '../../logger'

describe('createLogger', () => {
  test('使用 pino 创建 logger 实例', () => {
    // Arrange
    const stream = new Writable({ write: vi.fn() })

    // Act
    const logger = createLogger({ level: 'info', stream })

    // Assert
    expect(logger.info).toBeDefined()
    expect(logger.error).toBeDefined()
    expect(logger.warn).toBeDefined()
    expect(logger.debug).toBeDefined()
  })

  test('child() 返回带 bindings 的子 logger', () => {
    // Arrange
    const stream = new Writable({ write: vi.fn() })
    const logger = createLogger({ level: 'info', stream })

    // Act
    const child = logger.child({ plugin: 'test-plugin' })

    // Assert
    expect(child.info).toBeDefined()
  })

  test('debug 级别低于配置时不输出', () => {
    // Arrange
    const writeMock = vi.fn()
    const stream = new Writable({ write: writeMock })
    const logger = createLogger({ level: 'warn', stream })

    // Act
    logger.debug('should not appear')

    // Assert
    expect(writeMock).not.toHaveBeenCalled()
  })

  test('warn 级别等于配置时输出', () => {
    // Arrange
    const writeMock = vi.fn()
    const stream = new Writable({ write: writeMock })
    const logger = createLogger({ level: 'warn', stream })

    // Act
    logger.warn({ msg: 'warning' }, 'warning message')

    // Assert
    expect(writeMock).toHaveBeenCalled()
  })

  test('info 输出包含 ISO 时间戳', () => {
    // Arrange
    const chunks: Buffer[] = []
    const stream = new Writable({ write: (chunk: Buffer) => chunks.push(chunk) })
    const logger = createLogger({ level: 'info', stream })

    // Act
    logger.info({ key: 'value' }, 'test message')

    // Assert
    const output = JSON.parse(chunks[0].toString())
    expect(output.time).toBeDefined()
    expect(() => new Date(output.time)).not.toThrow()
  })
})
```

### 3.4 健康检查服务

```
测试文件: packages/core/src/__tests__/unit/health.test.ts
```

```typescript
import { describe, test, expect, vi } from 'vitest'
import { HealthService } from '../../health/service'

describe('HealthService.check', () => {
  test('DB 和 Redis 均可用时返回 status=ok', async () => {
    // Arrange
    const mockDb = { execute: vi.fn().mockResolvedValue([{ 1: 1 }]) }
    const mockRedis = { ping: vi.fn().mockResolvedValue('PONG') }
    const service = new HealthService(mockDb as any, mockRedis as any)

    // Act
    const result = await service.check()

    // Assert
    expect(result.status).toBe('ok')
    expect(result.db).toBe(true)
    expect(result.redis).toBe(true)
  })

  test('DB 不可用时返回 status=degraded, db=false', async () => {
    // Arrange
    const mockDb = { execute: vi.fn().mockRejectedValue(new Error('connection refused')) }
    const mockRedis = { ping: vi.fn().mockResolvedValue('PONG') }
    const service = new HealthService(mockDb as any, mockRedis as any)

    // Act
    const result = await service.check()

    // Assert
    expect(result.status).toBe('degraded')
    expect(result.db).toBe(false)
    expect(result.redis).toBe(true)
  })

  test('Redis 为 null 时结果中省略 redis 字段', async () => {
    // Arrange
    const mockDb = { execute: vi.fn().mockResolvedValue([{ 1: 1 }]) }
    const service = new HealthService(mockDb as any, null)

    // Act
    const result = await service.check()

    // Assert
    expect(result.status).toBe('ok')
    expect(result.db).toBe(true)
    expect(result.redis).toBeUndefined()
  })

  test('uptime 在构造后随时间增加', async () => {
    // Arrange
    const mockDb = { execute: vi.fn().mockResolvedValue([{ 1: 1 }]) }
    const service = new HealthService(mockDb as any, null)

    // Act
    const result1 = await service.check()
    await new Promise(r => setTimeout(r, 10))
    const result2 = await service.check()

    // Assert
    expect(result2.uptime).toBeGreaterThanOrEqual(result1.uptime)
  })

  test('返回结果包含 version 和 timestamp', async () => {
    // Arrange
    const mockDb = { execute: vi.fn().mockResolvedValue([{ 1: 1 }]) }
    const service = new HealthService(mockDb as any, null)

    // Act
    const result = await service.check()

    // Assert
    expect(result.version).toBeDefined()
    expect(result.timestamp).toBeDefined()
    expect(() => new Date(result.timestamp)).not.toThrow()
  })
})
```
### 3.5 全局错误处理器

```
测试文件: packages/core/src/__tests__/unit/error-handler.test.ts
```

```typescript
import { describe, test, expect, vi } from 'vitest'
import { globalErrorHandler } from '../../middleware/error-handler'
import { UserError, SystemError, ErrorCode } from '@audebase/shared-types'

describe('globalErrorHandler', () => {
  function createMockReply() {
    return { status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() }
  }

  function createMockRequest(requestId = 'req-123') {
    return { requestId, log: { warn: vi.fn(), error: vi.fn() } }
  }

  test('UserError 返回 4xx 状态码 + 用户可读错误消息', async () => {
    // Arrange
    const error = new UserError(ErrorCode.VALIDATION_ERROR, '参数校验失败')
    const req = createMockRequest()
    const reply = createMockReply()

    // Act
    await globalErrorHandler(error, req as any, reply as any)

    // Assert
    expect(reply.status).toHaveBeenCalledWith(400)
    expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: ErrorCode.VALIDATION_ERROR, message: '参数校验失败' }),
    }))
  })

  test('AUTH_INVALID_CREDENTIALS 映射到 401', async () => {
    // Arrange
    const error = new UserError(ErrorCode.AUTH_INVALID_CREDENTIALS, '用户名或密码错误')
    const reply = createMockReply()

    // Act
    await globalErrorHandler(error, createMockRequest() as any, reply as any)

    // Assert
    expect(reply.status).toHaveBeenCalledWith(401)
  })

  test('AUTH_TOKEN_EXPIRED 映射到 401', async () => {
    // Arrange
    const error = new UserError(ErrorCode.AUTH_TOKEN_EXPIRED, 'Token 过期')
    const reply = createMockReply()

    // Act
    await globalErrorHandler(error, createMockRequest() as any, reply as any)

    // Assert
    expect(reply.status).toHaveBeenCalledWith(401)
  })

  test('AUTH_REQUIRED 映射到 401', async () => {
    // Arrange
    const error = new UserError(ErrorCode.AUTH_REQUIRED, '需要认证')
    const reply = createMockReply()

    // Act
    await globalErrorHandler(error, createMockRequest() as any, reply as any)

    // Assert
    expect(reply.status).toHaveBeenCalledWith(401)
  })

  test('FORBIDDEN 映射到 403', async () => {
    // Arrange
    const error = new UserError(ErrorCode.FORBIDDEN, '权限不足')
    const reply = createMockReply()

    // Act
    await globalErrorHandler(error, createMockRequest() as any, reply as any)

    // Assert
    expect(reply.status).toHaveBeenCalledWith(403)
  })

  test('AUTH_MUST_CHANGE_PASSWORD 映射到 403', async () => {
    // Arrange
    const error = new UserError(ErrorCode.AUTH_MUST_CHANGE_PASSWORD, '需先修改密码')
    const reply = createMockReply()

    // Act
    await globalErrorHandler(error, createMockRequest() as any, reply as any)

    // Assert
    expect(reply.status).toHaveBeenCalledWith(403)
  })

  test('RATE_LIMIT_EXCEEDED 映射到 429', async () => {
    // Arrange
    const error = new UserError(ErrorCode.RATE_LIMIT_EXCEEDED, '请求过于频繁')
    const reply = createMockReply()

    // Act
    await globalErrorHandler(error, createMockRequest() as any, reply as any)

    // Assert
    expect(reply.status).toHaveBeenCalledWith(429)
  })

  test('NOT_FOUND 映射到 404', async () => {
    // Arrange
    const error = new UserError(ErrorCode.NOT_FOUND, '资源不存在')
    const reply = createMockReply()

    // Act
    await globalErrorHandler(error, createMockRequest() as any, reply as any)

    // Assert
    expect(reply.status).toHaveBeenCalledWith(404)
  })

  test('CONFLICT 映射到 409', async () => {
    // Arrange
    const error = new UserError(ErrorCode.CONFLICT, '资源冲突')
    const reply = createMockReply()

    // Act
    await globalErrorHandler(error, createMockRequest() as any, reply as any)

    // Assert
    expect(reply.status).toHaveBeenCalledWith(409)
  })

  test('SystemError 返回 500 + 固定错误消息（不泄露内部细节）', async () => {
    // Arrange
    const error = new SystemError(ErrorCode.DB_UNAVAILABLE, '数据库连接超时', new Error('connection timeout'))
    const req = createMockRequest()
    const reply = createMockReply()

    // Act
    await globalErrorHandler(error, req as any, reply as any)

    // Assert
    expect(reply.status).toHaveBeenCalledWith(500)
    expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: ErrorCode.INTERNAL_ERROR, message: '服务器内部错误' }),
    }))
  })

  test('DB_UNAVAILABLE SystemError 映射到 503', async () => {
    // Arrange
    const error = new SystemError(ErrorCode.DB_UNAVAILABLE, 'db connection failed', new Error('timeout'))
    const reply = createMockReply()

    // Act
    await globalErrorHandler(error, createMockRequest() as any, reply as any)

    // Assert
    expect(reply.status).toHaveBeenCalledWith(503)
  })

  test('REDIS_UNAVAILABLE SystemError 映射到 503', async () => {
    // Arrange
    const error = new SystemError(ErrorCode.REDIS_UNAVAILABLE, 'redis connection failed', new Error('timeout'))
    const reply = createMockReply()

    // Act
    await globalErrorHandler(error, createMockRequest() as any, reply as any)

    // Assert
    expect(reply.status).toHaveBeenCalledWith(503)
  })

  test('未知 Error 封装为 INTERNAL_ERROR + 500', async () => {
    // Arrange
    const error = new Error('something unexpected')
    const req = createMockRequest()
    const reply = createMockReply()

    // Act
    await globalErrorHandler(error, req as any, reply as any)

    // Assert
    expect(reply.status).toHaveBeenCalledWith(500)
    expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: ErrorCode.INTERNAL_ERROR }),
    }))
  })

  test('UserError 带 details 时返回 details 字段', async () => {
    // Arrange
    const details = { field: 'username', reason: 'already taken' }
    const error = new UserError(ErrorCode.VALIDATION_ERROR, '校验失败', details)
    const reply = createMockReply()

    // Act
    await globalErrorHandler(error, createMockRequest() as any, reply as any)

    // Assert
    expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ details }),
    }))
  })

  test('UserError 时 logger.warn 被调用', async () => {
    // Arrange
    const error = new UserError(ErrorCode.VALIDATION_ERROR, '校验失败')
    const req = createMockRequest()

    // Act
    await globalErrorHandler(error, req as any, createMockReply() as any)

    // Assert
    expect(req.log.warn).toHaveBeenCalled()
  })

  test('SystemError 时 logger.error 被调用', async () => {
    // Arrange
    const error = new SystemError(ErrorCode.DB_UNAVAILABLE, 'db timeout')
    const req = createMockRequest()

    // Act
    await globalErrorHandler(error, req as any, createMockReply() as any)

    // Assert
    expect(req.log.error).toHaveBeenCalled()
  })

  test('未知异常时 logger.error 被调用', async () => {
    // Arrange
    const error = new Error('unexpected')
    const req = createMockRequest()

    // Act
    await globalErrorHandler(error, req as any, createMockReply() as any)

    // Assert
    expect(req.log.error).toHaveBeenCalled()
  })
})
```

### 3.6 CORS 配置

```
测试文件: packages/core/src/__tests__/unit/cors.test.ts
```

```typescript
import { describe, test, expect } from 'vitest'
import { createCorsConfig } from '../../middleware/cors'

describe('createCorsConfig', () => {
  function devConfig() {
    return createCorsConfig({ NODE_ENV: 'development', AUDE_CORS_ORIGINS: undefined } as any)
  }

  function prodConfig(origins?: string) {
    return createCorsConfig({ NODE_ENV: 'production', AUDE_CORS_ORIGINS: origins } as any)
  }

  test('开发环境允许 localhost:* 来源', () => {
    // Arrange & Act
    const config = devConfig()

    // Assert
    expect(config.origin).toBeInstanceOf(RegExp)
    expect(config.origin.test('http://localhost:3000')).toBe(true)
    expect(config.origin.test('http://localhost:5173')).toBe(true)
  })

  test('开发环境不允许非 localhost 来源', () => {
    // Arrange & Act
    const config = devConfig()

    // Assert
    expect(config.origin.test('http://example.com')).toBe(false)
    expect(config.origin.test('https://app.example.com')).toBe(false)
  })

  test('生产环境使用 AUDE_CORS_ORIGINS 配置', () => {
    // Arrange & Act
    const config = prodConfig('https://app.example.com,https://admin.example.com')

    // Assert
    expect(config.origin).toEqual(['https://app.example.com', 'https://admin.example.com'])
  })

  test('生产环境未配置 AUDE_CORS_ORIGINS 时 origin 为 false', () => {
    // Arrange & Act
    const config = prodConfig()
    expect(config.origin).toBe(false)
  })

  test('允许方法包含 GET, POST, PATCH, DELETE, OPTIONS', () => {
    // Arrange & Act
    const config = devConfig()

    // Assert
    expect(config.methods).toContain('GET')
    expect(config.methods).toContain('POST')
    expect(config.methods).toContain('PATCH')
    expect(config.methods).toContain('DELETE')
    expect(config.methods).toContain('OPTIONS')
  })

  test('暴露头包含 X-Request-ID 和 X-RateLimit 系列', () => {
    // Arrange & Act
    const config = devConfig()

    // Assert
    expect(config.exposedHeaders).toContain('X-Request-ID')
    expect(config.exposedHeaders).toContain('X-RateLimit-Limit')
    expect(config.exposedHeaders).toContain('X-RateLimit-Remaining')
    expect(config.exposedHeaders).toContain('X-RateLimit-Reset')
  })

  test('credentials 始终为 false', () => {
    // Arrange & Act
    const devCfg = devConfig()
    const prodCfg = prodConfig('https://example.com')

    // Assert
    expect(devCfg.credentials).toBe(false)
    expect(prodCfg.credentials).toBe(false)
  })
})
```

### 3.7 速率限制配置

```
测试文件: packages/core/src/__tests__/unit/rate-limit.test.ts
```

```typescript
import { describe, test, expect } from 'vitest'
import { createRateLimitConfig } from '../../middleware/rate-limit'

describe('createRateLimitConfig', () => {
  test('全局默认速率限制为 100/min', () => {
    // Arrange & Act
    const config = createRateLimitConfig()

    // Assert
    expect(config.max).toBe(100)
    expect(config.timeWindow).toBe('1 minute')
  })

  test('keyGenerator 按 IP 区分', () => {
    // Arrange
    const config = createRateLimitConfig()
    const mockRequest = { ip: '192.168.1.1' }

    // Act
    const key = config.keyGenerator!(mockRequest as any)

    // Assert
    expect(key).toBe('192.168.1.1')
  })

  test('errorResponseBuilder 返回 429 错误格式', () => {
    // Arrange
    const config = createRateLimitConfig()

    // Act
    const response = config.errorResponseBuilder!({} as any, {} as any)

    // Assert
    expect(response.error.code).toBe('RATE_LIMIT_EXCEEDED')
    expect(response.error.message).toBeDefined()
  })
})
```

### 3.8 Request ID 中间件

```
测试文件: packages/core/src/__tests__/unit/request-id.test.ts
```

```typescript
import { describe, test, expect, vi } from 'vitest'
import { createRequestIdMiddleware } from '../../middleware/request-id'

describe('createRequestIdMiddleware', () => {
  function createMockReqRes(reqHeaders: Record<string, string> = {}) {
    const req = {
      headers: reqHeaders,
      requestId: undefined,
      log: { child: vi.fn().mockReturnValue({ info: vi.fn(), error: vi.fn() }) },
    }
    const res = { setHeader: vi.fn() }
    return { req, res }
  }

  test('请求头含 X-Request-ID 时复用它', async () => {
    // Arrange
    const middleware = createRequestIdMiddleware()
    const { req, res } = createMockReqRes({ 'x-request-id': 'my-trace-id' })

    // Act
    await middleware(req as any, res as any, () => {})

    // Assert
    expect(req.requestId).toBe('my-trace-id')
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', 'my-trace-id')
  })

  test('请求头不含 X-Request-ID 时生成 UUID v4', async () => {
    // Arrange
    const middleware = createRequestIdMiddleware()
    const { req, res } = createMockReqRes()

    // Act
    await middleware(req as any, res as any, () => {})

    // Assert
    expect(req.requestId).toBeDefined()
    expect(typeof req.requestId).toBe('string')
    expect(req.requestId!.length).toBeGreaterThan(0)
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', req.requestId)
  })

  test('多次调用生成不同 UUID', async () => {
    // Arrange
    const middleware = createRequestIdMiddleware()
    const { req: req1 } = createMockReqRes()
    const { req: req2 } = createMockReqRes()

    // Act
    await middleware(req1 as any, {} as any, () => {})
    await middleware(req2 as any, {} as any, () => {})

    // Assert
    expect(req1.requestId).not.toBe(req2.requestId)
  })

  test('创建带 requestId binding 的子 logger', async () => {
    // Arrange
    const middleware = createRequestIdMiddleware()
    const { req, res } = createMockReqRes({ 'x-request-id': 'trace-42' })

    // Act
    await middleware(req as any, res as any, () => {})

    // Assert
    expect(req.log.child).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'trace-42' }))
  })
})
```

### 3.9 慢查询 Hook

```
测试文件: packages/core/src/__tests__/unit/slow-query.test.ts
```

```typescript
import { describe, test, expect, vi } from 'vitest'
import { createSlowQueryHook } from '../../hooks/slow-query'

describe('SlowQueryHook', () => {
  test('查询耗时超过阈值时 logger.warn 被调用', async () => {
    // Arrange
    const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn() }
    const hook = createSlowQueryHook(logger as any, { slowQueryThresholdMs: 1 })

    // Act
    hook.onQuery!(['arg1'], { sql: 'SELECT * FROM users', params: [] })
    await new Promise(r => setTimeout(r, 10))
    hook.onResult!(['arg1'], { rows: [] })

    // Assert
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Slow query detected'),
      expect.objectContaining({ sql: 'SELECT * FROM users' }),
    )
  })

  test('查询耗时低于阈值时 logger.warn 不被调用', async () => {
    // Arrange
    const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn() }
    const hook = createSlowQueryHook(logger as any, { slowQueryThresholdMs: 10000 })
    hook.onQuery!(['arg1'], { sql: 'SELECT 1', params: [] })
    hook.onResult!(['arg1'], { rows: [1] })

    // Assert
    expect(logger.warn).not.toHaveBeenCalled()
  })

  test('onQuery/onResult 不传参时不抛出异常', () => {
    // Arrange
    const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn() }
    const hook = createSlowQueryHook(logger as any, { slowQueryThresholdMs: 100 })

    // Act & Assert
    expect(() => hook.onQuery!([], { sql: 'SELECT 1' })).not.toThrow()
    expect(() => hook.onResult!([], { rows: [] })).not.toThrow()
  })
})
```
### 3.10 DatabaseProvider 单元测试

```
测试文件: packages/core/src/__tests__/unit/db-provider.test.ts
```

```typescript
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { createDatabaseProvider } from '../../db/provider'

describe('DatabaseProvider', () => {
  let mockPool: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockPool = { query: vi.fn(), connect: vi.fn(), end: vi.fn() }
  })

  test('query 执行参数化 SQL 并返回结果', async () => {
    // Arrange
    mockPool.query.mockResolvedValue({ rows: [{ id: 1, name: 'test' }] })
    const provider = createDatabaseProvider(mockPool, { slowQueryThresholdMs: 1000 })

    // Act
    const result = await provider.query('SELECT * FROM users WHERE id = $1', ['1'])

    // Assert
    expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', ['1'])
    expect(result).toEqual([{ id: 1, name: 'test' }])
  })

  test('execute 返回影响行数', async () => {
    // Arrange
    mockPool.query.mockResolvedValue({ rowCount: 2 })
    const provider = createDatabaseProvider(mockPool, { slowQueryThresholdMs: 1000 })

    // Act
    const result = await provider.execute("UPDATE users SET name = 'new' WHERE id = $1", ['1'])

    // Assert
    expect(result.rowsAffected).toBe(2)
  })

  test('ping 执行 SELECT 1 返回 true', async () => {
    // Arrange
    mockPool.query.mockResolvedValue({ rows: [{ 1: 1 }] })
    const provider = createDatabaseProvider(mockPool, { slowQueryThresholdMs: 1000 })

    // Act
    const result = await provider.ping()

    // Assert
    expect(result).toBe(true)
  })

  test('ping 连接失败时返回 false', async () => {
    // Arrange
    mockPool.query.mockRejectedValue(new Error('connection refused'))
    const provider = createDatabaseProvider(mockPool, { slowQueryThresholdMs: 1000 })

    // Act
    const result = await provider.ping()

    // Assert
    expect(result).toBe(false)
  })

  test('close 关闭连接池', async () => {
    // Arrange
    const provider = createDatabaseProvider(mockPool, { slowQueryThresholdMs: 1000 })

    // Act
    await provider.close()

    // Assert
    expect(mockPool.end).toHaveBeenCalled()
  })

  test('transaction 成功时执行 COMMIT', async () => {
    // Arrange
    const mockClient = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() }
    mockPool.connect.mockResolvedValue(mockClient)
    const provider = createDatabaseProvider(mockPool, { slowQueryThresholdMs: 1000 })

    // Act
    await provider.transaction(async (tx) => {
      return tx.query('SELECT 1')
    })

    // Assert
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN')
    expect(mockClient.query).toHaveBeenCalledWith('SELECT 1')
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT')
    expect(mockClient.release).toHaveBeenCalled()
  })

  test('transaction 失败时执行 ROLLBACK', async () => {
    // Arrange
    const mockClient = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() }
    mockPool.connect.mockResolvedValue(mockClient)
    const provider = createDatabaseProvider(mockPool, { slowQueryThresholdMs: 1000 })

    // Act & Assert
    await expect(
      provider.transaction(async (tx) => {
        await tx.query('INSERT INTO fail VALUES (1)')
        throw new Error('business error')
      }),
    ).rejects.toThrow('business error')

    expect(mockClient.query).toHaveBeenCalledWith('BEGIN')
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK')
    expect(mockClient.release).toHaveBeenCalled()
  })
})
```

### 3.11 DataProxy 单元测试

```
测试文件: packages/core/src/__tests__/unit/data-proxy.test.ts
```

```typescript
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { createDataProxy } from '../../db/data-proxy'

describe('DataProxy', () => {
  let mockDb: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockDb = { query: vi.fn(), execute: vi.fn() }
  })

  test('findMany 自动注入 tenant_id WHERE 条件', async () => {
    // Arrange
    mockDb.query.mockResolvedValue([{ id: '1', name: 'test' }])
    const proxy = createDataProxy(mockDb)

    // Act
    await proxy.findMany('users', { limit: 10, offset: 0 }, 'tenant-abc')

    // Assert
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining('tenant_id'),
      expect.arrayContaining(['tenant-abc']),
    )
  })

  test('findMany 不带 tenant_id 时查询系统全局数据', async () => {
    // Arrange
    mockDb.query.mockResolvedValue([{ id: '1', name: 'system' }])
    const proxy = createDataProxy(mockDb)

    // Act
    await proxy.findMany('users', { limit: 10, offset: 0 }, null)

    // Assert
    expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('IS NULL'), expect.any(Array))
  })

  test('findMany 支持分页参数', async () => {
    // Arrange
    mockDb.query.mockResolvedValue([{ id: '1' }])
    const proxy = createDataProxy(mockDb)

    // Act
    await proxy.findMany('users', { limit: 20, offset: 40 }, 'tenant-abc')

    // Assert
    expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('LIMIT'), expect.any(Array))
  })

  test('findOne 自动注入 tenant_id + id 过滤', async () => {
    // Arrange
    mockDb.query.mockResolvedValue([{ id: 'user-1', name: 'test' }])
    const proxy = createDataProxy(mockDb)

    // Act
    const result = await proxy.findOne('users', 'user-1', 'tenant-abc')

    // Assert
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining('tenant_id'),
      expect.arrayContaining(['tenant-abc', 'user-1']),
    )
    expect(result).toEqual({ id: 'user-1', name: 'test' })
  })

  test('findOne 不存在时返回 null', async () => {
    // Arrange
    mockDb.query.mockResolvedValue([])
    const proxy = createDataProxy(mockDb)

    // Act
    const result = await proxy.findOne('users', 'nonexistent', 'tenant-abc')

    // Assert
    expect(result).toBeNull()
  })

  test('create 自动注入 tenant_id', async () => {
    // Arrange
    mockDb.execute.mockResolvedValue({ rowsAffected: 1 })
    mockDb.query.mockResolvedValue([{ id: 'new-id', name: 'new', tenant_id: 'tenant-abc' }])
    const proxy = createDataProxy(mockDb)

    // Act
    const result = await proxy.create('users', { name: 'new' }, 'tenant-abc')

    // Assert
    expect(mockDb.execute).toHaveBeenCalledWith(
      expect.stringContaining('tenant_id'),
      expect.arrayContaining(['tenant-abc']),
    )
  })

  test('update 自动注入 tenant_id + id WHERE 条件', async () => {
    // Arrange
    mockDb.execute.mockResolvedValue({ rowsAffected: 1 })
    mockDb.query.mockResolvedValue([{ id: 'user-1', name: 'updated', tenant_id: 'tenant-abc' }])
    const proxy = createDataProxy(mockDb)

    // Act
    const result = await proxy.update('users', 'user-1', { name: 'updated' }, 'tenant-abc')

    // Assert
    expect(mockDb.execute).toHaveBeenCalledWith(
      expect.stringContaining('tenant_id'),
      expect.arrayContaining(['tenant-abc', 'user-1']),
    )
  })

  test('delete 自动注入 tenant_id + id WHERE 条件', async () => {
    // Arrange
    mockDb.execute.mockResolvedValue({ rowsAffected: 1 })
    const proxy = createDataProxy(mockDb)

    // Act
    const result = await proxy.delete('users', 'user-1', 'tenant-abc')

    // Assert
    expect(result.rowsAffected).toBe(1)
    expect(mockDb.execute).toHaveBeenCalledWith(
      expect.stringContaining('tenant_id'),
      expect.arrayContaining(['tenant-abc', 'user-1']),
    )
  })

  test('delete 返回 0 行影响（资源不存在）', async () => {
    // Arrange
    mockDb.execute.mockResolvedValue({ rowsAffected: 0 })
    const proxy = createDataProxy(mockDb)

    // Act
    const result = await proxy.delete('users', 'nonexistent', 'tenant-abc')

    // Assert
    expect(result.rowsAffected).toBe(0)
  })
})
```

### 3.12 租户上下文中间件

```
测试文件: packages/core/src/__tests__/unit/tenant.test.ts
```

```typescript
import { describe, test, expect, vi } from 'vitest'
import { createTenantContextMiddleware } from '../../middleware/tenant'

describe('createTenantContextMiddleware', () => {
  test('JWT payload 含 tenant_id 时注入 request.tenantId', async () => {
    // Arrange
    const middleware = createTenantContextMiddleware()
    const req = { user: { tenant_id: 'tenant-uuid' }, tenantId: undefined }
    const res = {}

    // Act
    await middleware(req as any, res as any, () => {})

    // Assert
    expect(req.tenantId).toBe('tenant-uuid')
  })

  test('JWT payload 不含 tenant_id 时 request.tenantId 为 null', async () => {
    // Arrange
    const middleware = createTenantContextMiddleware()
    const req = { user: {}, tenantId: undefined }

    // Act
    await middleware(req as any, {} as any, () => {})

    // Assert
    expect(req.tenantId).toBeNull()
  })

  test('未认证请求 request.tenantId 为 null', async () => {
    // Arrange
    const middleware = createTenantContextMiddleware()
    const req = { user: undefined, tenantId: undefined }

    // Act
    await middleware(req as any, {} as any, () => {})

    // Assert
    expect(req.tenantId).toBeNull()
  })
})
```
---

## 4. 集成测试

### 4.1 Core 启动与关闭集成测试

```
测试文件: packages/core/src/__tests__/integration/core.integration.test.ts
```

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { createTestApp } from '../helpers/createTestApp'
import type { TestApp } from '../helpers/createTestApp'

describe('Core 启动与关闭', () => {
  let test: TestApp

  beforeEach(async () => {
    test = await createTestApp({ withRedis: false })
  })

  afterEach(async () => {
    await test.cleanup()
  })

  test('GET /health 返回 200 + HealthCheckResult', async () => {
    // Arrange & Act
    const res = await test.app.inject({ method: 'GET', url: '/health' })

    // Assert
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.status).toBe('ok')
    expect(body.db).toBe(true)
    expect(body.uptime).toBeGreaterThanOrEqual(0)
    expect(body.timestamp).toBeDefined()
  })

  test('GET /api/health 返回 200（API 一致性端点）', async () => {
    // Arrange & Act
    const res = await test.app.inject({ method: 'GET', url: '/api/health' })

    // Assert
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).status).toBe('ok')
  })

  test('GET /health/ready 数据库可用时返回 200', async () => {
    // Arrange & Act
    const res = await test.app.inject({ method: 'GET', url: '/health/ready' })

    // Assert
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).status).toBe('ready')
  })

  test('GET /health/ready 数据库不可用时返回 503', async () => {
    // Arrange
    const failing = await createTestApp({ dbUrl: 'postgres://invalid:invalid@localhost:9999/fail' })

    // Act
    const res = await failing.app.inject({ method: 'GET', url: '/health/ready' })

    // Assert
    expect(res.statusCode).toBe(503)
    expect(JSON.parse(res.body).status).toBe('not_ready')
    await failing.cleanup()
  })

  test('所有请求携带 X-Request-ID 响应头', async () => {
    // Arrange & Act
    const res = await test.app.inject({ method: 'GET', url: '/health' })

    // Assert
    expect(res.headers['x-request-id']).toBeDefined()
  })

  test('请求头 X-Request-ID 被传播到响应', async () => {
    // Arrange & Act
    const res = await test.app.inject({
      method: 'GET', url: '/health',
      headers: { 'x-request-id': 'my-trace' },
    })

    // Assert
    expect(res.headers['x-request-id']).toBe('my-trace')
  })

  test('CORS 预检请求返回正确头', async () => {
    // Arrange & Act
    const res = await test.app.inject({
      method: 'OPTIONS', url: '/health',
      headers: { origin: 'http://localhost:5173' },
    })

    // Assert
    expect(res.statusCode).toBe(204)
    expect(res.headers['access-control-allow-origin']).toBeDefined()
  })

  test('未知路由返回 404 时错误处理器返回正确格式', async () => {
    // Arrange & Act
    const res = await test.app.inject({ method: 'GET', url: '/api/nonexistent' })

    // Assert
    expect(res.statusCode).toBe(404)
    const body = JSON.parse(res.body)
    expect(body.error).toBeDefined()
    expect(body.error.code).toBeDefined()
  })
})
```

### 4.2 中间件链集成测试

```
测试文件: packages/core/src/__tests__/integration/middleware.integration.test.ts
```

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { createTestApp } from '../helpers/createTestApp'
import type { TestApp } from '../helpers/createTestApp'

describe('中间件链集成', () => {
  let test: TestApp

  beforeEach(async () => {
    test = await createTestApp({ withRedis: true })
  })

  afterEach(async () => {
    await test.cleanup()
  })

  test('速率限制头出现在响应中', async () => {
    // Arrange & Act
    const res = await test.app.inject({ method: 'GET', url: '/health' })

    // Assert
    expect(res.headers['x-ratelimit-limit']).toBeDefined()
    expect(res.headers['x-ratelimit-remaining']).toBeDefined()
    expect(res.headers['x-ratelimit-reset']).toBeDefined()
  })

  test('连续请求消耗速率限制额度', async () => {
    // Arrange & Act
    const res1 = await test.app.inject({ method: 'GET', url: '/health' })
    const remaining1 = Number(res1.headers['x-ratelimit-remaining'])

    const res2 = await test.app.inject({ method: 'GET', url: '/health' })
    const remaining2 = Number(res2.headers['x-ratelimit-remaining'])

    // Assert
    expect(remaining2).toBe(remaining1 - 1)
  })
})
```

### 4.3 路由注册集成测试

```
测试文件: packages/core/src/__tests__/integration/routes.integration.test.ts
```

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { createTestApp } from '../helpers/createTestApp'
import { seedAdminUser } from '../seeds/admin'
import type { TestApp } from '../helpers/createTestApp'

describe('路由注册', () => {
  let test: TestApp
  let adminToken: string

  beforeEach(async () => {
    test = await createTestApp({ seeds: { admin: true } })
    adminToken = await loginAsAdmin(test, seedAdminUser)
  })

  afterEach(async () => {
    await test.cleanup()
  })

  test('POST /api/auth/login 登录成功', async () => {
    // Arrange & Act
    const res = await test.app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { username: 'admin', password: 'Admin123!' },
    })

    // Assert
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data.accessToken).toBeDefined()
    expect(body.data.refreshToken).toBeDefined()
  })

  test('POST /api/auth/login 密码错误返回 401', async () => {
    // Arrange & Act
    const res = await test.app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { username: 'admin', password: 'wrongpassword' },
    })

    // Assert
    expect(res.statusCode).toBe(401)
  })

  test('GET /api/users 返回用户列表', async () => {
    // Arrange & Act
    const res = await test.app.inject({
      method: 'GET', url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
    })

    // Assert
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data).toBeInstanceOf(Array)
    expect(body.meta).toBeDefined()
    expect(body.meta.total).toBeGreaterThanOrEqual(1)
  })

  test('GET /api/users 无 token 返回 401', async () => {
    // Arrange & Act
    const res = await test.app.inject({ method: 'GET', url: '/api/users' })

    // Assert
    expect(res.statusCode).toBe(401)
  })

  test('GET /api/roles 返回角色列表', async () => {
    // Arrange & Act
    const res = await test.app.inject({
      method: 'GET', url: '/api/roles',
      headers: { authorization: `Bearer ${adminToken}` },
    })

    // Assert
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data).toBeInstanceOf(Array)
  })

  test('GET /api/plugins 返回插件列表', async () => {
    // Arrange & Act
    const res = await test.app.inject({
      method: 'GET', url: '/api/plugins',
      headers: { authorization: `Bearer ${adminToken}` },
    })

    // Assert
    expect(res.statusCode).toBe(200)
  })

  test('GET /api/audit-logs 返回审计日志', async () => {
    // Arrange & Act
    const res = await test.app.inject({
      method: 'GET', url: '/api/audit-logs',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(res.statusCode).toBe(200)
  })

  test('GET /api/logs 返回日志列表', async () => {
    // Arrange & Act
    const res = await test.app.inject({
      method: 'GET', url: '/api/logs',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(res.statusCode).toBe(200)
  })
})
```
---

## 5. 契约测试

```
测试文件: packages/core/src/__tests__/contracts/health.contract.test.ts
```

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { createTestApp } from '../helpers/createTestApp'
import { validateContract } from '../helpers/contract'
import { healthCheckResultSchema, errorResponseSchema } from '@audebase/shared-types'
import type { TestApp } from '../helpers/createTestApp'

describe('GET /health 契约', () => {
  let test: TestApp

  beforeEach(async () => {
    test = await createTestApp()
  })

  afterEach(async () => {
    await test.cleanup()
  })

  test('200 响应形状匹配 healthCheckResultSchema', async () => {
    // Arrange & Act
    await validateContract('GET', '/health', {
      response: healthCheckResultSchema,
      status: 200,
    })
  })

  test('无 token 对 /health 的访问不受限（公开端点）', async () => {
    // Arrange & Act
    const res = await test.app.inject({ method: 'GET', url: '/health' })

    // Assert
    expect(res.statusCode).toBe(200)
  })

  test('GET /api/health 响应形状匹配 healthCheckResultSchema', async () => {
    // Arrange & Act
    await validateContract('GET', '/api/health', {
      response: healthCheckResultSchema,
      status: 200,
    })
  })

  test('GET /health/ready 成功时返回 { status: "ready" }', async () => {
    // Arrange & Act
    const res = await test.app.inject({ method: 'GET', url: '/health/ready' })

    // Assert
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).status).toBe('ready')
  })

  test('未知路由返回 404 + errorResponseSchema', async () => {
    // Arrange & Act
    await validateContract('GET', '/api/unknown-route', {
      response: errorResponseSchema,
      status: 404,
    })
  })

  test('无 token 访问受保护路由返回 401 + errorResponseSchema', async () => {
    // Arrange & Act
    await validateContract('GET', '/api/users', {
      response: errorResponseSchema,
      status: 401,
    })
  })
})
```

---

## 6. E2E 测试

Core 内核 E2E 属于 Phase 1a 集成验证，验证完整启动流程：

```
packages/core/__e2e__/core-lifecycle.e2e.ts
preSeed: { admin: true }
```

| 用例 | 描述 |
|------|------|
| 完整启动到健康检查到请求到关闭 | 启动 Core, 等待 ready, 健康检查, 发送 API 请求, 关闭, 验证日志 |
| 数据库连接失败时启动失败 | 配置无效 DATABASE_URL, 启动抛出错误, 进程退出 |
| 速率限制超限 | 发送 101 个请求, 第 101 个返回 429 |

---

## 7. 种子数据

```
packages/core/src/__tests__/seeds/
└── admin.ts
```

```typescript
import type { TestApp } from '@audebase/core'
import { users } from '../../db/schema'

export interface SeedAdminOptions {
  username?: string
  password?: string
  tenantId?: string | null
}

export async function seedAdminUser(
  app: TestApp,
  options: SeedAdminOptions = {},
): Promise<{ userId: string; password: string }> {
  const username = options.username ?? 'admin'
  const password = options.password ?? 'Admin123!'
  const tenantId = options.tenantId ?? null

  // 检查是否已存在（幂等）
  const existing = await app.db.query.users.findFirst({
    where: eq(users.username, username),
  })
  if (existing) {
    return { userId: existing.id, password }
  }

  const bcryptCost = 12
  const hashedPassword = await bcrypt.hash(password, bcryptCost)

  const [user] = await app.db.insert(users).values({
    username, password_hash: hashedPassword,
    role_id: 'admin-role-uuid', tenant_id: tenantId,
    must_change_password: true, is_active: true,
  }).returning()

  return { userId: user.id, password }
}

export async function seedDefaultData(app: TestApp): Promise<void> {
  await seedDefaultRoles(app)
  await seedAdminUser(app)
  await seedSystemTenant(app)
}

async function seedDefaultRoles(app: TestApp): Promise<void> {
  // 插入 admin 和 member 角色
}

async function seedSystemTenant(app: TestApp): Promise<void> {
  // 插入系统租户记录
}
```

种子数据按以下约定组织：
- `seedAdminUser`: 创建管理员用户（幂等：已存在则跳过）
- `seedDefaultData`: 一次性创建全部种子数据（角色 + admin + 租户）
- 所有种子函数幂等，支持多次调用

---

## 8. Mock 策略

| 依赖 | 单元测试 | 集成测试 |
|------|---------|---------|
| PostgreSQL | 无（mock DatabaseProvider） | 真实 PostgreSQL 16（事务回滚隔离） |
| Redis | ioredis-mock | ioredis-mock 或真实 Valkey 8 |
| Drizzle ORM | vi.fn() mock query/execute | 真实 Drizzle + PostgreSQL |
| Fastify | 通过 createTestApp 创建真实实例 | 真实 Fastify app.inject() |
| Plugin framework | mock PluginHost（5 项约束） | mock PluginHost 或真实加载 |
| JWT 认证 | mock verify 返回 payload | 真实 @fastify/jwt 签发/验证 |
| bcrypt | mock hash/compare | 真实 bcrypt（集成测试） |

### Mock 基础设施

```typescript
// packages/core/src/__tests__/helpers/mocks.ts

export function createMockDb(options?: { pingRejects?: boolean }): DatabaseProvider {
  return {
    query: vi.fn().mockResolvedValue([]),
    execute: vi.fn().mockResolvedValue({ rowsAffected: 0 }),
    transaction: vi.fn().mockImplementation(async (fn: Function) => {
      return fn(mockTransaction())
    }),
    close: vi.fn().mockResolvedValue(undefined),
    ping: options?.pingRejects
      ? vi.fn().mockRejectedValue(new Error('Connection refused'))
      : vi.fn().mockResolvedValue(true),
  }
}

export function createMockRedis(options?: { pingRejects?: boolean }): any {
  return {
    ping: options?.pingRejects
      ? vi.fn().mockRejectedValue(new Error('Connection refused'))
      : vi.fn().mockResolvedValue('PONG'),
    quit: vi.fn().mockResolvedValue(undefined),
  }
}

export function mockTransaction(): DatabaseTransaction {
  return {
    query: vi.fn().mockResolvedValue([]),
    execute: vi.fn().mockResolvedValue({ rowsAffected: 0 }),
  }
}
```

### ProcessPluginHost Mock 约束（D1.2）

| # | 约束 | 实现 |
|---|------|------|
| 1 | async Promise | 所有方法返回 `Promise<T>` |
| 2 | JSON 序列化/反序列化 | 参数 `JSON.stringify` + `JSON.parse` 验证无损 |
| 3 | 30s 超时 | `Promise.race([call, new Promise(r => setTimeout(r, 30000))])` |
| 4 | 1-5ms 延迟注入 | `await new Promise(r => setTimeout(r, 2))` 模拟通信延迟 |
| 5 | 严格模式 | `AUDE_STRICT_PLUGIN_HOST=1` 时 assert 序列化无损 |

```typescript
export function createMockPluginHost(): PluginHost {
  return {
    call: vi.fn().mockImplementation(async (method: string, params: unknown[]) => {
      // 约束 1: async Promise
      // 约束 4: 1-5ms 延迟注入
      await new Promise(r => setTimeout(r, 2))
      // 约束 2: JSON 序列化/反序列化
      const serialized = JSON.stringify(params)
      const deserialized = JSON.parse(serialized)
      if (process.env.AUDE_STRICT_PLUGIN_HOST === '1') {
        assert.deepStrictEqual(params, deserialized)
      }
      // 约束 3: 30s 超时（由 race 外层保证）
      return `mock:${method}`
    }),
  }
}
```
---

## 9. ErrorCode 覆盖矩阵

全局错误处理器必须覆盖 SDD §5.2、§5.3 定义的所有 ErrorCode 到 HTTP 状态码的映射。以下矩阵列出每条映射及其对应测试:

| ErrorCode | HTTP | 错误类型 | 测试用例 | 验证点 |
|-----------|:----:|----------|---------|--------|
| `VALIDATION_ERROR` | 400 | UserError | 3.5 第 1 条 | reply.status(400) + 用户可读 message |
| `AUTH_INVALID_CREDENTIALS` | 401 | UserError | 3.5 第 2 条 | reply.status(401) |
| `AUTH_TOKEN_EXPIRED` | 401 | UserError | 3.5 第 3 条 | reply.status(401) |
| `AUTH_TOKEN_INVALID` | 401 | UserError | 3.5 第 3 条变体 | reply.status(401) |
| `AUTH_REQUIRED` | 401 | UserError | 3.5 第 4 条 | reply.status(401) |
| `AUTH_MUST_CHANGE_PASSWORD` | 403 | UserError | 3.5 第 6 条 | reply.status(403) |
| `FORBIDDEN` | 403 | UserError | 3.5 第 5 条 | reply.status(403) |
| `RBAC_PERMISSION_DENIED` | 403 | UserError | 3.5 第 5 条变体 | reply.status(403) |
| `NOT_FOUND` | 404 | UserError | 3.5 第 7 条 | reply.status(404) |
| `RBAC_ROLE_NOT_FOUND` | 404 | UserError | 3.5 第 7 条变体 | reply.status(404) |
| `PLUGIN_NOT_FOUND` | 404 | UserError | 3.5 第 7 条变体 | reply.status(404) |
| `CONFLICT` | 409 | UserError | 3.5 第 8 条 | reply.status(409) |
| `RBAC_CANNOT_DELETE_SYSTEM_ROLE` | 409 | UserError | 3.5 第 8 条变体 | reply.status(409) |
| `PLUGIN_MIGRATION_FAILED` | 409 | UserError | 3.5 第 8 条变体 | reply.status(409) |
| `PLUGIN_DEPENDENCY_MISSING` | 409 | UserError | 3.5 第 8 条变体 | reply.status(409) |
| `PLUGIN_ALREADY_INSTALLED` | 409 | UserError | 3.5 第 8 条变体 | reply.status(409) |
| `RATE_LIMIT_EXCEEDED` | 429 | UserError | 3.5 第 9 条 | reply.status(429) |
| `INTERNAL_ERROR` | 500 | SystemError | 3.5 第 10 条、12 条 | reply.status(500) + 固定错误消息 |
| `DB_UNAVAILABLE` | 503 | SystemError | 3.5 第 11 条 | reply.status(503) |
| `REDIS_UNAVAILABLE` | 503 | SystemError | 3.5 第 11 条变体 | reply.status(503) |

**覆盖验证**：集成测试 4.1 使用 `app.inject()` 对健康检查端点 + 未知路由进行全栈验证。

---

## 10. 覆盖率目标

| 指标 | 目标 | 关键路径 |
|------|:---:|---------|
| 行覆盖率 | **85%+** | CoreApp.bootstrap/start/stop, config.loadConfig, error-handler |
| 分支覆盖率 | **80%+** | configSchema 全部分支 + error-handler 类型判断分支 + DataProxy tenant_id 分支 |
| 函数覆盖率 | **90%+** | 所有导出函数 |
| 单元测试 | 45+ | 12 个测试文件覆盖 12 个子模块 |
| 集成测试 | 12+ | 3 个测试文件: 启动关闭 + 中间件链 + 路由 |
| 契约测试 | 6+ | health 端点响应形状 + 错误格式 |

---

## 11. CI 集成

```yaml
core-test:
  runs-on: ubuntu-latest
  services:
    postgres:
      image: postgres:16-alpine
      env:
        POSTGRES_DB: audebase_test
        POSTGRES_USER: audebase
        POSTGRES_PASSWORD: audebase_test
      ports: ["5432:5432"]
      options: >-
        --health-cmd pg_isready
        --health-interval 10s
        --health-timeout 5s
        --health-retries 5
    valkey:
      image: valkey/valkey:8-alpine
      ports: ["6379:6379"]
      options: >-
        --health-cmd "redis-cli ping"
        --health-interval 10s
        --health-timeout 5s
        --health-retries 5
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '22'
    - run: pnpm install --frozen-lockfile
    - run: pnpm --filter @audebase/core test:unit
    - run: pnpm --filter @audebase/core test:integration
      env:
        DATABASE_URL: postgres://audebase:audebase_test@localhost:5432/audebase_test
        REDIS_URL: redis://localhost:6379
        AUDE_JWT_SECRET: ci-test-secret-at-least-32-chars-long
        NODE_ENV: test
    - run: pnpm --filter @audebase/core test:contracts
      env:
        DATABASE_URL: postgres://audebase:audebase_test@localhost:5432/audebase_test
        AUDE_JWT_SECRET: ci-test-secret-at-least-32-chars-long
    - name: 覆盖率报告
      run: pnpm --filter @audebase/core coverage
    - name: 覆盖率闸门
      run: |
        pnpm --filter @audebase/core coverage --thresholds.lines 85 --thresholds.branches 80
```

---

## 12. 用例汇总

| 测试层 | 测试文件 | 用例数 |
|--------|---------|:---:|
| 单元 - app | app.test.ts | 9 |
| 单元 - config | config.test.ts | 18 |
| 单元 - logger | logger.test.ts | 5 |
| 单元 - health | health.test.ts | 5 |
| 单元 - error-handler | error-handler.test.ts | 16 |
| 单元 - cors | cors.test.ts | 8 |
| 单元 - rate-limit | rate-limit.test.ts | 3 |
| 单元 - request-id | request-id.test.ts | 5 |
| 单元 - slow-query | slow-query.test.ts | 3 |
| 单元 - db-provider | db-provider.test.ts | 7 |
| 单元 - data-proxy | data-proxy.test.ts | 9 |
| 单元 - tenant | tenant.test.ts | 3 |
| 集成 - 启动关闭 | core.integration.test.ts | 8 |
| 集成 - 中间件链 | middleware.integration.test.ts | 2 |
| 集成 - 路由 | routes.integration.test.ts | 8 |
| 契约 - health | health.contract.test.ts | 6 |
| E2E - lifecycle | core-lifecycle.e2e.ts | 3 |
| **合计** | | **118** |

---

## 13. 参考

- [core-sdd.md](core-sdd.md) -- Core 内核 SDD（928 行，覆盖 7 项审计缺口）
- [api-specification.md](api-specification.md) -- API 端点规范
- [api-conventions.md](api-conventions.md) §6 -- 速率限制约定
- [api-conventions.md](api-conventions.md) §11.3 -- 错误传播契约
- [database-schema.md](database-schema.md) -- 核心表结构
- [../../.agents/memorys/decisions.md](../../.agents/memorys/decisions.md) -- D5(Drizzle)/D8(Zod)/D8.1(JWT)/D9(Drizzle ORM)/D9.1(pg-pool)/D12(Data Proxy)/D1.13(Health)
- [test-seed-strategy.md](test-seed-strategy.md) -- 种子数据策略
- [dev-workflow.md](dev-workflow.md) §3.4 -- Vitest 配置与 CI 集成
- [plugin-framework-sdd.md](plugin-framework-sdd.md) -- PluginRegistry 接口参考
- [rbac-tdd.md](rbac-tdd.md) -- RBAC 认证 token 参考

> **上游 TDD 参考**: [shared-types-tdd.md](shared-types-tdd.md) -- ErrorCode, UserError, SystemError 类型定义; [auth-sdd.md](auth-sdd.md) -- JWT 签发/验证接口

---

## 14. 数据库索引验证（集成测试补充）

```typescript
// 集成测试中验证数据库索引使用
describe('数据库索引', () => {
  test('tenant_id 复合索引在 DataProxy 查询中生效', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      // 使用 EXPLAIN 验证索引扫描
      const plan = await app.db.execute(
        'EXPLAIN SELECT * FROM users WHERE tenant_id = $1 LIMIT 1',
        ['test-tenant'],
      )
      // Assert
      expect(JSON.stringify(plan.rows[0])).toContain('Index Scan')
    })
  })
})
```

---
