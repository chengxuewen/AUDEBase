# Core Kernel SDD - Phase 1a

> **创建日期**: 2026-07-16  
> **目的**: 为 Phase 1a Core 内核模块提供编码前的完整接口定义。覆盖 Fastify bootstrap、中间件链、配置校验、DatabaseProvider 接口、全局错误处理器、优雅关闭、CORS、多租户自动注入、Core 数据 API 代理。  
> **前置阅读**: D1（微内核）, D5（Fastify）, D8.1（JWT 环境变量）, D9（Drizzle ORM）, D9.1（pg-pool + 慢查询）, D12（Core 数据 API 代理）, D1.13（健康检查）  
> **解决审计项**: GO-021（Core 内核骨架无 SDD）, GO-003（全局错误处理器）, GO-005（tenant_id 自动注入）, GO-008（Core 数据代理）, GO-025（环境变量 schema）, GO-029（优雅关闭）, GO-030（CORS 配置）  
> **责任人**: Person A (1a#1)

---

## 1. 概要

### 1.1 模块定位

Core 内核是 AUDEBase 平台的启动入口和运行时基础设施。它负责创建 Fastify 应用实例、注册中间件链、管理数据库连接、协调插件生命周期、提供全局错误处理和优雅关闭。

**内核职责**:
- Fastify 应用实例创建与中间件链组装
- 环境变量 Zod 校验（启动时 fail-fast）
- DatabaseProvider 接口暴露（pg-pool 连接池 + Drizzle ORM）
- 全局错误处理器（GO-003）
- 请求 ID 中间件（X-Request-ID 注入）
- 慢查询检测 Hook（D9.1）
- 健康检查端点注册（D1.13）
- 优雅关闭（SIGTERM/SIGINT 处理，GO-029）
- CORS 配置（GO-030）
- tenant_id 自动注入机制（GO-005）
- Core 数据 API 代理接口（GO-008, D12）

**内核不负责**:
- 业务逻辑（由插件提供）
- UI 渲染（由 Admin UI 前端提供）
- 具体数据模型定义（由插件 manifest 声明）
- 插件发现/加载（由 plugin-framework 模块负责，Core 提供 PluginRegistry 容器）

### 1.2 设计目标

- **Fail-fast 启动**: 所有必需环境变量在启动时 Zod 校验，缺失或不合法则拒绝启动
- **中间件有序**: 中间件按确定性顺序注册，错误处理器始终在最外层
- **依赖注入**: DatabaseProvider、Logger、PluginHost 通过构造函数注入，便于测试
- **渐进式**: Phase 1a 实现 inline 模式（同进程），接口预留 Phase 2 跨进程语义
- **可观测**: 请求 ID 贯穿全链路日志，慢查询自动告警

### 1.3 包信息

```json
{
  "name": "@audebase/core",
  "type": "module",
  "main": "./src/index.ts",
  "dependencies": ["@audebase/shared-types"],
  "peerDependencies": ["fastify", "pino", "drizzle-orm", "pg", "@fastify/cors", "@fastify/rate-limit", "@fastify/jwt"]
}
```

**运行时栈**: Node.js 22, Fastify 5, Drizzle ORM 0.45.x, pg (node-postgres), pino, Zod

**模块解析**: NodeNext（所有导入使用 `.js` 扩展名）

---

## 2. 接口定义

### 2.1 已实现接口

以下接口已在 `packages/core/src/` 中实现并通过 34 项测试。

#### 2.1.1 Logger

```typescript
// packages/core/src/logger.ts

interface Logger {
  info(obj: object, msg: string): void
  error(obj: object, msg: string): void
  warn(obj: object, msg: string): void
  debug(obj: object, msg: string): void
  child(bindings: Record<string, unknown>): Logger
}

interface LoggerOptions {
  level: string
  stream: Writable
}

function createLogger(options: LoggerOptions): Logger
```

**实现**: 基于 pino，ISO 时间戳，可配置日志级别和输出流。`child()` 创建带预设 bindings 的子 logger（用于插件 scope 隔离）。

#### 2.1.2 Request ID 中间件

```typescript
// packages/core/src/middleware/request-id.ts

function createRequestIdMiddleware(): (
  request: FastifyRequestLike,
  reply: FastifyReplyLike,
) => Promise<void>
```

**行为**:
- 读取 `X-Request-ID` 请求头，不存在则生成 UUID v4
- 将 ID 写入 `request.requestId`
- 设置 `X-Request-ID` 响应头
- 创建带 `requestId` binding 的子 logger

#### 2.1.3 慢查询 Hook

```typescript
// packages/core/src/hooks/slow-query.ts

interface SlowQueryHook {
  onQuery?(args: unknown[], context: { sql: string; params?: unknown[] }): void
  onResult?(args: unknown[], result: unknown): void
}

interface SlowQueryOptions {
  slowQueryThresholdMs: number
}

function createSlowQueryHook(logger: SlowQueryLogger, options: SlowQueryOptions): SlowQueryHook
```

**行为**: `onQuery` 记录开始时间和 SQL，`onResult` 计算耗时，超过 `slowQueryThresholdMs` 则 `logger.warn('Slow query detected', { sql, duration })`。

#### 2.1.4 健康检查服务

```typescript
// packages/core/src/health/service.ts

interface HealthCheckResult {
  status: 'ok' | 'degraded'
  db: boolean
  redis?: boolean
  uptime: number
  version: string
  timestamp: string
}

interface DbLike {
  execute: (sql: string) => Promise<unknown>
}

interface RedisLike {
  ping: () => Promise<string>
}

class HealthService {
  constructor(db: DbLike, redis: RedisLike | null)
  async check(): Promise<HealthCheckResult>
}
```

**行为**:
- DB 检查: `db.execute('SELECT 1')` 成功则 `db: true`
- Redis 检查: `redis.ping()` 返回 `'PONG'` 则 `redis: true`（redis 为 null 时省略）
- 状态: DB 可用为 `'ok'`，否则 `'degraded'`
- uptime: 从构造时开始计算的秒数

#### 2.1.5 健康检查路由

```typescript
// packages/core/src/health/routes.ts

function registerHealthRoutes(
  app: FastifyInstance,
  db: DbLike,
  redis: RedisLike | null,
): void
```

**注册端点**:

| 路径 | 说明 | 响应 |
|------|------|------|
| `GET /health` | Kubernetes liveness probe | `HealthCheckResult` JSON |
| `GET /api/health` | API 一致性健康检查 | 同上 |
| `GET /health/ready` | Kubernetes readiness probe | DB 可用 → `200 { status: 'ready' }`；否则 → `503 { status: 'not_ready' }` |

#### 2.1.6 统一导出

```typescript
// packages/core/src/index.ts

export { createLogger, type Logger, type LoggerOptions } from './logger.js'
export { createRequestIdMiddleware } from './middleware/request-id.js'
export { createSlowQueryHook, type SlowQueryHook } from './hooks/slow-query.js'
export { HealthService, type HealthCheckResult } from './health/service.js'
export { registerHealthRoutes } from './health/routes.js'
```

### 2.2 待实现接口（Phase 1a 后续）

以下接口为 Phase 1a 编码目标，基于架构决策和审计项定义。

#### 2.2.1 CoreApp — 应用入口（GO-021）

```typescript
// packages/core/src/app.ts (待实现)

interface CoreAppOptions {
  config: AppConfig
  logger: Logger
}

class CoreApp {
  constructor(options: CoreAppOptions)

  /** 创建 Fastify 实例，注册中间件链，连接数据库 */
  async bootstrap(): Promise<void>

  /** 启动 HTTP 服务器，注册 SIGTERM/SIGINT 处理 */
  async start(): Promise<void>

  /** 优雅关闭：停止 HTTP -> 卸载插件 -> 关闭数据库连接池 -> 关闭 Redis */
  async stop(): Promise<void>

  /** 注册插件到 PluginRegistry */
  registerPlugin(descriptor: PluginDescriptor): void

  /** 从 PluginRegistry 注销插件 */
  unregisterPlugin(name: string): void

  /** Fastify 实例（bootstrap 后可用） */
  readonly fastify: FastifyInstance

  /** DatabaseProvider 实例（bootstrap 后可用） */
  readonly db: DatabaseProvider

  /** Logger 实例 */
  readonly logger: Logger

  /** PluginRegistry 实例 */
  readonly plugins: PluginRegistry
}
```

#### 2.2.2 环境变量 Schema（GO-025）

```typescript
// packages/core/src/config.ts (待实现)

import { z } from 'zod'

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  /** HTTP 端口 */
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  /** JWT 签名密钥 - 必须 >= 32 字符（D8.1, NocoBase CVE-2025-13877 防范） */
  AUDE_JWT_SECRET: z.string().min(32, 'AUDE_JWT_SECRET must be at least 32 characters'),

  /** PostgreSQL 连接字符串 */
  DATABASE_URL: z.string().url().startsWith('postgres://', 'DATABASE_URL must be a postgres:// URL'),

  /** Redis 连接字符串 */
  REDIS_URL: z.string().url().optional(),

  /** 日志级别 */
  AUDE_LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  /** 慢查询阈值（毫秒），超过则记录警告（D9.1） */
  AUDE_SLOW_QUERY_THRESHOLD_MS: z.coerce.number().int().min(1).default(100),

  /** CORS 允许来源（逗号分隔，开发环境默认 localhost:*） */
  AUDE_CORS_ORIGINS: z.string().optional(),

  /** JWT Access Token 过期时间（秒） */
  AUDE_JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900), // 15 分钟

  /** JWT Refresh Token 过期时间（秒） */
  AUDE_JWT_REFRESH_TTL: z.coerce.number().int().positive().default(604800), // 7 天

  /** bcrypt cost factor */
  AUDE_BCRYPT_COST: z.coerce.number().int().min(10).max(15).default(12),

  /** 数据库连接池大小（D9.1） */
  AUDE_DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
})

type AppConfig = z.infer<typeof configSchema>

/**
 * 从 process.env 解析并校验配置。
 * 校验失败时 throw ZodError，阻止启动。
 */
function loadConfig(env: Record<string, string | undefined>): AppConfig
```

**校验约束**:
- `AUDE_JWT_SECRET` 必须 >= 32 字符（D8.1，参考 NocoBase CVE-2025-13877 CVSS 9.8）
- `DATABASE_URL` 必须是 `postgres://` 开头的有效 URL
- 所有数值类型使用 `z.coerce.number()` 从字符串转换
- 缺失可选变量使用 `default()` 提供合理默认值

#### 2.2.3 DatabaseProvider 接口（D9, D9.1, GO-008）

```typescript
// packages/core/src/db/provider.ts (待实现)

/**
 * 数据库访问抽象层。
 * 所有模块（rbac, audit, migration, plugin-core）通过此接口访问数据库。
 * Phase 1a 实现为 Drizzle ORM + pg-pool 包装。
 * Phase 2 可切换到其他 ORM（D9: DatabaseProvider 接口隔离）。
 */
interface DatabaseProvider {
  /** 执行参数化查询，返回结果行数组 */
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>

  /** 执行单条语句（INSERT/UPDATE/DELETE/DDL），返回影响行数 */
  execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number }>

  /** 在事务中执行回调，自动 commit/rollback */
  transaction<T>(fn: (tx: DatabaseTransaction) => Promise<T>): Promise<T>

  /** 关闭连接池 */
  close(): Promise<void>

  /** 健康检查（SELECT 1） */
  ping(): Promise<boolean>
}

/**
 * 事务上下文 - 与 DatabaseProvider 相同的 query/execute 接口，
 * 但所有操作在同一事务中执行。
 */
interface DatabaseTransaction {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>
  execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number }>
}
```

**实现细节**:
- 基于 `pg` Pool（`pg-pool`），默认 10 连接（`AUDE_DB_POOL_MAX` 可配）
- 慢查询检测: 每次 query 前后调用 `SlowQueryHook.onQuery/onResult`（D9.1）
- 事务: 使用 `pool.connect()` 获取客户端，`BEGIN` / `COMMIT` / `ROLLBACK`
- 所有 SQL 使用参数化查询，防 SQL 注入（D9）

#### 2.2.4 Core 数据 API 代理（D12, GO-008）

```typescript
// packages/core/src/db/data-proxy.ts (待实现)

/**
 * Core 数据 API 代理 - 插件通过此接口访问数据库（D12）。
 * 自动注入 tenant_id WHERE 条件（GO-005）。
 * 自动应用 Record Rules（Phase 2, D10）。
 * 自动应用字段级权限过滤（Phase 2, D11）。
 */
interface DataProxy {
  /**
   * 查询 Collection 记录，自动注入 tenant_id 过滤。
   *
   * @param collection - 表名（如 'users', 'roles'）
   * @param params - 查询参数（分页、排序、过滤）
   * @param tenantId - 当前租户 ID（从 JWT 提取）
   * @returns 分页结果
   */
  findMany<T = unknown>(
    collection: string,
    params: ListQueryParams,
    tenantId: string | null,
  ): Promise<ApiListResponse<T>>

  /**
   * 查询单条记录，自动注入 tenant_id + id 过滤。
   */
  findOne<T = unknown>(
    collection: string,
    id: string,
    tenantId: string | null,
  ): Promise<T | null>

  /**
   * 创建记录，自动注入 tenant_id。
   */
  create<T = unknown>(
    collection: string,
    data: Record<string, unknown>,
    tenantId: string | null,
  ): Promise<T>

  /**
   * 更新记录，自动注入 tenant_id + id WHERE 条件。
   */
  update<T = unknown>(
    collection: string,
    id: string,
    data: Record<string, unknown>,
    tenantId: string | null,
  ): Promise<T>

  /**
   * 删除记录，自动注入 tenant_id + id WHERE 条件。
   */
  delete(
    collection: string,
    id: string,
    tenantId: string | null,
  ): Promise<{ rowsAffected: number }>
}
```

**tenant_id 自动注入机制（GO-005）**:
- 所有 `findMany` / `findOne` / `update` / `delete` 操作自动追加 `WHERE tenant_id = $tenantId`
- `create` 操作自动在 INSERT 中设置 `tenant_id = $tenantId`
- `tenantId = null` 时查询系统全局数据（`WHERE tenant_id IS NULL`）
- tenant_id 从 JWT payload `tenant_id` 字段提取，不接受客户端通过查询参数传入
- Phase 2 扩展: Record Rules domain filter 自动注入（D10）

#### 2.2.5 全局错误处理器（GO-003）

```typescript
// packages/core/src/middleware/error-handler.ts (待实现)

/**
 * Fastify 全局错误处理器。
 * 注册方式: app.setErrorHandler(globalErrorHandler)
 *
 * 错误传播契约（见 api-conventions.md §11.3）:
 * 1. UserError  -> logger.warn -> reply 4xx -> { error: { code, message, details? } }
 * 2. SystemError -> logger.error -> reply 5xx -> { error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } }
 * 3. unknown Error -> logger.error -> reply 500 -> 同上
 */
function globalErrorHandler(
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void>
```

**错误处理逻辑**:

```typescript
// 伪代码
async function globalErrorHandler(error, request, reply) {
  const requestId = request.requestId ?? 'unknown'

  if (error instanceof UserError) {
    request.log.warn({ err: error, requestId }, 'UserError')
    const body: ApiErrorResponse = { error: { code: error.code, message: error.message } }
    if (error.details) body.error.details = error.details
    return reply.status(httpStatusForErrorCode(error.code)).send(body)
  }

  if (error instanceof SystemError) {
    request.log.error({ err: error, requestId }, 'SystemError')
    return reply.status(httpStatusForErrorCode(error.code)).send({
      error: { code: ErrorCode.INTERNAL_ERROR, message: '服务器内部错误' },
    })
  }

  // unknown Error
  request.log.error({ err: error, requestId }, 'Unhandled error')
  return reply.status(500).send({
    error: { code: ErrorCode.INTERNAL_ERROR, message: '服务器内部错误' },
  })
}
```

**ErrorCode → HTTP 状态码映射**:

| ErrorCode | HTTP | 说明 |
|-----------|:----:|------|
| `AUTH_INVALID_CREDENTIALS` | 401 | 用户名或密码错误 |
| `AUTH_TOKEN_EXPIRED` | 401 | Token 过期 |
| `AUTH_TOKEN_INVALID` | 401 | Token 无效 |
| `AUTH_REQUIRED` | 401 | 需要认证 |
| `AUTH_MUST_CHANGE_PASSWORD` | 403 | 需先修改密码 |
| `FORBIDDEN` | 403 | 权限不足 |
| `VALIDATION_ERROR` | 400 | 参数校验失败 |
| `CONFLICT` | 409 | 资源冲突 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `RATE_LIMIT_EXCEEDED` | 429 | 请求频率超限 |
| `RBAC_PERMISSION_DENIED` | 403 | RBAC 权限拒绝 |
| `RBAC_ROLE_NOT_FOUND` | 404 | 角色不存在 |
| `RBAC_CANNOT_DELETE_SYSTEM_ROLE` | 409 | 不可删除系统角色 |
| `PLUGIN_NOT_FOUND` | 404 | 插件不存在 |
| `PLUGIN_MIGRATION_FAILED` | 409 | 迁移失败 |
| `PLUGIN_DEPENDENCY_MISSING` | 409 | 依赖缺失 |
| `PLUGIN_ALREADY_INSTALLED` | 409 | 已安装 |
| `INTERNAL_ERROR` | 500 | 内部错误 |
| `DB_UNAVAILABLE` | 503 | 数据库不可用 |
| `REDIS_UNAVAILABLE` | 503 | Redis 不可用 |

**关键约束**:
- `SystemError.message` 永不返回给前端，固定返回 `'服务器内部错误'`
- 所有错误响应携带 `X-Request-ID` 响应头（由 request-id 中间件设置）
- 原始 error 对象记录到日志 `cause` 字段，不返回给前端

#### 2.2.6 CORS 配置（GO-030）

```typescript
// packages/core/src/middleware/cors.ts (待实现)

/**
 * CORS 配置 - 使用 @fastify/cors 插件。
 *
 * Phase 1a:
 * - 开发环境 (NODE_ENV=development): 允许 localhost:* 来源
 * - 生产环境: 通过 AUDE_CORS_ORIGINS 环境变量配置允许来源
 * - 允许方法: GET, POST, PATCH, DELETE, OPTIONS
 * - 允许头: Authorization, Content-Type, X-Request-ID
 * - 暴露头: X-Request-ID, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
 * - 凭证: 不允许（使用 Bearer token，非 Cookie）
 */
interface CorsConfig {
  origin: string | string[] | boolean
  methods: string[]
  allowedHeaders: string[]
  exposedHeaders: string[]
  credentials: false
}

function createCorsConfig(appConfig: AppConfig): CorsConfig
```

**实现**:
```typescript
// 伪代码
function createCorsConfig(config) {
  if (config.NODE_ENV === 'development') {
    return { origin: /^http:\/\/localhost:\d+$/, methods: [...], ... }
  }
  if (config.AUDE_CORS_ORIGINS) {
    const origins = config.AUDE_CORS_ORIGINS.split(',')
    return { origin: origins, methods: [...], ... }
  }
  return { origin: false, ... } // 生产环境默认不启用 CORS（同源）
}
```

#### 2.2.7 速率限制配置

```typescript
// packages/core/src/middleware/rate-limit.ts (待实现)

/**
 * 速率限制配置 - 使用 @fastify/rate-limit 插件。
 *
 * 分层策略（见 api-conventions.md §6）:
 * - POST /api/auth/login: 5/min (per-IP)
 * - POST /api/auth/refresh: 20/min (per-IP)
 * - 所有其他端点: 100/min (per-IP)
 *
 * 响应头: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After
 * 超限响应: 429 { error: { code: 'RATE_LIMIT_EXCEEDED', message: '请求过于频繁，请稍后再试' } }
 */
interface RateLimitConfig {
  max: number
  timeWindow: string
  keyGenerator?: (request: FastifyRequest) => string
  errorResponseBuilder?: (request: FastifyRequest, context: unknown) => ApiErrorResponse
}

function createRateLimitConfig(): RateLimitConfig
```

### 2.3 中间件链顺序（GO-021）

Fastify 中间件按以下顺序注册（从外到内）:

```
1. @fastify/cors                    — CORS 预检
2. request-id middleware            — X-Request-ID 注入
3. @fastify/rate-limit              — 速率限制（全局 100/min）
4. JWT auth middleware (待实现)      — Bearer token 验证 → request.user
5. tenant context middleware (待实现) — 从 JWT 提取 tenant_id → request.tenantId
6. audit middleware (待实现)         — API 写操作自动记录审计日志
7. 路由处理器                        — 插件注册的业务路由
8. setErrorHandler                  — 全局错误处理器（始终最外层捕获）
```

**注册伪代码**:

```typescript
async function bootstrap() {
  const app = fastify({ logger: pinoLogger })

  // 1. CORS
  await app.register(cors, createCorsConfig(config))

  // 2. Request ID
  app.addHook('onRequest', createRequestIdMiddleware())

  // 3. Rate limit
  await app.register(rateLimit, createRateLimitConfig())

  // 4. JWT auth (待 auth 模块实现)
  // await app.register(jwt, { secret: config.AUDE_JWT_SECRET })
  // app.addHook('onRequest', jwtAuthMiddleware)

  // 5. Tenant context (待实现)
  // app.addHook('onRequest', tenantContextMiddleware)

  // 6. Audit middleware (待 audit 模块实现)
  // app.addHook('onResponse', auditMiddleware)

  // 7. Health routes (已实现)
  registerHealthRoutes(app, db, redis)

  // 8. Global error handler
  app.setErrorHandler(globalErrorHandler)
}
```

---

## 3. 生命周期

### 3.1 启动流程

```
CoreApp.bootstrap()
  │
  ├─ 1. loadConfig(process.env)          — Zod 校验环境变量（fail-fast）
  ├─ 2. createLogger(config)             — 初始化 pino logger
  ├─ 3. createDatabaseProvider(config)   — 创建 pg-pool 连接池
  │    └─ pool.connect() + SELECT 1      — 验证数据库连接
  ├─ 4. createRedisClient(config)        — 连接 Redis（可选）
  ├─ 5. fastify()                        — 创建 Fastify 实例
  ├─ 6. 注册中间件链（见 §2.3）
  ├─ 7. registerHealthRoutes(app, db, redis)
  ├─ 8. app.setErrorHandler(globalErrorHandler)
  ├─ 9. PluginRegistry.init()            — 加载已注册插件
  │    └─ plugin-core.install()          — Bootstrap: admin 用户 + 默认角色 + 系统租户
  └─ 10. 返回，等待 start() 调用

CoreApp.start()
  │
  ├─ app.listen({ port: config.PORT })
  ├─ 注册 SIGTERM handler → stop()
  ├─ 注册 SIGINT handler → stop()
  └─ logger.info('Server started', { port })
```

### 3.2 关闭流程（GO-029）

```
CoreApp.stop()  — 由 SIGTERM/SIGINT 触发或手动调用
  │
  ├─ 1. logger.info('Shutting down...')
  ├─ 2. app.close()                      — 停止接受新请求，等待进行中请求完成
  │    └─ Fastify onClose hook: 卸载所有插件（afterDisable → preUninstall）
  ├─ 3. db.close()                       — 关闭 pg-pool 连接池
  ├─ 4. redis?.quit()                    — 关闭 Redis 连接（如存在）
  └─ 5. logger.info('Shutdown complete')
```

**超时处理**: Phase 1a 设置 30 秒强制退出超时。`stop()` 中启动 `setTimeout(() => process.exit(1), 30000)`，正常完成则 `clearTimeout`。

### 3.3 插件生命周期集成

Core 通过 PluginRegistry 管理插件生命周期（具体实现由 plugin-framework 模块负责）:

```
CoreApp.registerPlugin(descriptor)
  └─ PluginRegistry.add(descriptor)     — 记录插件元数据

CoreApp.start()
  └─ PluginRegistry.loadAll()
       ├─ 依赖拓扑排序
       ├─ plugin-core (zero deps) → install() → 创建 Bootstrap 数据
       ├─ 依次加载其余插件:
       │    afterAdd → beforeLoad → load → install → (enabled)
       └─ 迁移执行（D1.7 三阶段: preload → postsync → postload）

CoreApp.stop()
  └─ PluginRegistry.unloadAll()
       └─ 逆序: afterDisable → preUninstall
```

---

## 4. 依赖关系

### 4.1 模块依赖

```
@audebase/core
  ├─ @audebase/shared-types    — 类型定义（ErrorCode, UserError, SystemError, API 类型, PluginHost, Manifest 等）
  ├─ fastify                   — HTTP 框架
  ├─ pino                      — 结构化日志
  ├─ drizzle-orm               — ORM（Phase 1a 通过 DatabaseProvider 抽象）
  ├─ pg (node-postgres)        — PostgreSQL 驱动 + pg-pool
  ├─ zod                       — 配置和边界验证
  ├─ @fastify/cors             — CORS 中间件
  ├─ @fastify/rate-limit       — 速率限制中间件
  └─ @fastify/jwt              — JWT 认证中间件（待 auth 模块实现）
```

### 4.2 被依赖模块

以下模块依赖 Core 提供的接口:

| 模块 | 使用的 Core 接口 | 用途 |
|------|-----------------|------|
| plugin-framework | CoreApp.registerPlugin/unregisterPlugin, PluginRegistry | 插件加载/卸载 |
| plugin-core (Bootstrap) | DatabaseProvider, DataProxy | 创建 admin 用户、默认角色、系统租户 |
| rbac | DatabaseProvider, DataProxy | 用户/角色/权限 CRUD |
| audit | Logger, Fastify 实例（注册中间件） | 审计日志中间件 + 记录 |
| migration-engine | DatabaseProvider, Logger | 三阶段 SQL 迁移执行 |
| health-check | HealthService, registerHealthRoutes | 已实现于 Core 内 |
| logging-infra | Logger, SlowQueryHook | 已实现于 Core 内 |
| auth (待实现) | Fastify 实例, Logger, DatabaseProvider | JWT 签发/验证, login/refresh 端点 |
| rate-limit (待实现) | Fastify 实例 | @fastify/rate-limit 配置 |
| i18n | PluginHost.t() | 翻译函数注入 |
| admin-ui (前端) | GET /health, API 端点 | 通过 HTTP 调用 |

### 4.3 外部服务依赖

| 服务 | 用途 | 可选性 |
|------|------|--------|
| PostgreSQL 16+ | 主数据库 | 必需 |
| Redis (或 Valkey) | 缓存、Pub/Sub、BullMQ | Phase 1a 可选（健康检查降级为不检查 redis） |

---

## 5. 错误码与错误处理

### 5.1 错误类型层次

Core 使用 `@audebase/shared-types` 定义的错误类层次:

```
Error
  ├─ UserError       — 用户可恢复错误（4xx），前端可见 code + message + details
  ├─ SystemError     — 系统内部错误（5xx），前端仅看到 INTERNAL_ERROR
  └─ AssertionError  — 开发断言（仅开发环境抛出，生产静默降级）
```

### 5.2 Core 内部错误码

Core 模块自身可能产生的错误:

| 场景 | ErrorCode | 类型 | 恢复策略 |
|------|-----------|------|---------|
| 环境变量校验失败 | — (ZodError) | 启动失败 | 修正环境变量后重启 |
| 数据库连接失败 | `DB_UNAVAILABLE` | SystemError | 503 响应，运维检查 PostgreSQL |
| Redis 连接失败 | `REDIS_UNAVAILABLE` | SystemError | 503 响应（仅健康检查受影响） |
| JWT 密钥缺失/过短 | — (ZodError) | 启动失败 | 设置 AUDE_JWT_SECRET 后重启 |
| 速率超限 | `RATE_LIMIT_EXCEEDED` | UserError | 429 响应 + Retry-After 头 |
| 未知异常 | `INTERNAL_ERROR` | SystemError | 500 响应，记录完整 stack |

### 5.3 错误传播契约

```
插件代码:
  throw new UserError(ErrorCode.VALIDATION_ERROR, 'msg', { field: 'error' })
  throw new SystemError(ErrorCode.DB_UNAVAILABLE, 'db timeout', originalPgError)

Core 全局错误处理器:
  1. UserError  → logger.warn → reply 4xx → { error: { code, message, details? } }
  2. SystemError → logger.error → reply 5xx → { error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } }
  3. unknown Error → logger.error → reply 500 → 同上
```

**约束**:
- 插件只能 throw `UserError` 或 `SystemError`，Core 中间件拒绝其他 Error 类型直接透传
- `UserError.message` 可返回给前端（对用户可读）
- `SystemError.message` 永不返回给前端，固定返回 `'服务器内部错误'`
- 所有 Error 必须携带 `ErrorCode`，前端统一 switch-case 处理
- 未知 Error 封装为 `INTERNAL_ERROR`，原 error 记录到日志 `cause` 字段

### 5.4 日志级别

| 事件 | 日志级别 |
|------|---------|
| 请求处理 | info |
| UserError 发生 | warn |
| SystemError 发生 | error |
| 未知异常 | error |
| 慢查询检测（> 阈值） | warn |
| 数据库连接失败 | error |
| 插件加载/卸载 | info |
| 优雅关闭开始/完成 | info |

---

## 6. 安全考虑

### 6.1 JWT 密钥管理（D8.1）

- `AUDE_JWT_SECRET` 通过环境变量注入，启动时 Zod 校验 >= 32 字符
- 拒绝默认值（参考 NocoBase CVE-2025-13877 CVSS 9.8）
- `users.token_version` 字段用于 token 撤回：更新 `token_version + 1` → 所有旧 token 失效
- Access Token 15 分钟过期，Refresh Token 7 天过期（SHA-256 哈希存储于 `refresh_tokens` 表）

### 6.2 SQL 注入防护

- 所有数据库操作通过 DatabaseProvider 参数化查询
- DataProxy 拒绝客户端拼接 SQL，仅接受结构化参数
- 参考竞品 CVE: NocoBase CVE-2026-41641 (SQL injection via sqlCollection)、Axelor CVE-2025-50341 (SQL injection via _domain)

### 6.3 Core 数据 API 代理（D12）

- 插件默认不直连数据库，所有 DB 操作通过 Core DataProxy 代理
- DataProxy 自动注入 `tenant_id` WHERE 条件（GO-005）
- 仅 `manifest.security.db_direct: true` 的 Isolated 插件可获得独立 PG 连接（Phase 2）
- 参考 NocoBase CVE GHSA-v8vm-cqh8-q87q（直连数据库权限绕过漏洞）

### 6.4 多租户隔离

- 所有表含 `tenant_id` 列（`NULL` = 系统全局数据）
- tenant_id 从 JWT payload 提取，不接受客户端通过查询参数传入
- DataProxy 自动注入 `WHERE tenant_id = $tenantId`
- Phase 2 扩展 Record Rules domain filter（D10）

### 6.5 CORS 配置（GO-030）

- 开发环境: 仅允许 `localhost:*` 来源
- 生产环境: 通过 `AUDE_CORS_ORIGINS` 环境变量配置允许来源
- 不允许凭证（credentials: false），使用 Bearer token 认证
- 暴露 `X-Request-ID` 和 `X-RateLimit-*` 响应头

### 6.6 速率限制

- `POST /api/auth/login`: 5/min (per-IP) — 防暴力破解
- `POST /api/auth/refresh`: 20/min (per-IP)
- 全局: 100/min (per-IP)
- 超限返回 429 + `Retry-After` 头

### 6.7 优雅关闭（GO-029）

- SIGTERM/SIGINT 触发 `stop()` 流程
- 停止接受新请求，等待进行中请求完成
- 30 秒超时强制退出
- 关闭顺序: HTTP → 插件卸载 → 数据库连接池 → Redis

### 6.8 密码安全

- bcrypt 哈希存储（cost factor 由 `AUDE_BCRYPT_COST` 配置，默认 12）
- admin 首次登录强制修改密码（`must_change_password: true`，D1.6）
- 密码复杂度: >= 8 字符，含大写+小写+数字+特殊字符（Zod schema 验证）

---

## 7. Mock 约束

### 7.1 测试基础设施

Core 模块测试使用以下 helper（已实现于 `packages/core/src/__tests__/helpers/`）:

#### createTestApp

```typescript
// packages/core/src/__tests__/helpers/createTestApp.ts

interface TestAppOptions {
  withRedis?: boolean
  withBullMQ?: boolean
  queues?: string[]
  seeds?: { admin?: boolean; tenant?: string }
  dbUrl?: string
}

interface TestApp {
  app: FastifyInstance
  db: unknown
  redis: { client: Redis; publisher: Redis; subscriber: Redis } | null
  queues: Record<string, unknown> | null
  withTransaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>
  cleanup: () => Promise<void>
}

async function createTestApp(options?: TestAppOptions): Promise<TestApp>
```

**行为**:
- 创建 `fastify({ logger: false })` 实例（无日志输出）
- Mock DB: `execute()` 默认返回 void，`dbUrl` 含 `'invalid'` 时 throw `'Connection refused'`
- Mock Redis: 使用 `ioredis-mock`，`withRedis: true` 时创建 client/publisher/subscriber 三实例
- 注册健康检查路由
- `cleanup()` 调用 `app.close()`

#### withTestApp

```typescript
async function withTestApp(fn: (app: FastifyInstance) => Promise<void>): Promise<void>
```

**行为**: `createTestApp()` → 执行 `fn(app)` → `cleanup()`（finally 块确保清理）

#### mockPluginHost

```typescript
function createMockPluginHost(): { call: Mock }
```

**5 项 Mock 约束**（对应 D1.2 ProcessPluginHost 语义保真度）:
1. **async Promise**: 所有方法返回 Promise
2. **JSON 序列化/反序列化**: 验证参数 JSON round-trip 无损
3. **30s 超时**: `Promise.race([call, setTimeout(30000)])`，超时 reject
4. **1-5ms 延迟注入**: `setTimeout(2ms)` 模拟通信延迟
5. **严格模式**: `AUDE_STRICT_PLUGIN_HOST=1` 时 assert 序列化无损

### 7.2 测试约定

- **框架**: Vitest（`vitest run`）
- **文件命名**: `{module}.test.ts`（单元测试）
- **AAA 结构**: Arrange → Act → Assert 三段式
- **覆盖率**: 80% 最低（CI 闸门）
- **隔离**: 每个测试用例独立的 `createTestApp()` 实例，`cleanup()` 确保无状态泄漏

### 7.3 DatabaseProvider Mock

测试中 DatabaseProvider 的 mock 需实现:

```typescript
const mockDb: DatabaseProvider = {
  async query<T>(sql: string, params?: unknown[]): Promise<T[]> { return [] },
  async execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number }> { return { rowsAffected: 0 } },
  async transaction<T>(fn: (tx: DatabaseTransaction) => Promise<T>): Promise<T> { return fn(mockTx) },
  async close(): Promise<void> {},
  async ping(): Promise<boolean> { return true },
}
```

---

## 8. 变更记录

| 版本 | 日期 | 变更内容 |
|------|------|---------|
| 1.0 | 2026-07-16 | 初始版本。定义 CoreApp、DatabaseProvider、DataProxy、全局错误处理器、CORS、速率限制、环境变量 schema、优雅关闭。覆盖 GO-021/003/005/008/025/029/030 七项审计缺口。文档化已实现的 Logger、Request ID 中间件、慢查询 Hook、健康检查服务和路由。 |
