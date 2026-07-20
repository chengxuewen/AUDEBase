# Health Check SDD - Phase 1a

> **创建日期**: 2026-07-16
> **目的**: 为 Phase 1a 健康检查模块（packages/health-check/）提供完整的接口定义、生命周期、依赖关系与测试约束。
> **前置阅读**: decisions.md D1.13; api-specification.md §6; health-check-tdd.md; shared-types-sdd.md
> **TDD 文档**: [health-check-tdd.md](health-check-tdd.md)

---

## 1. 概要

### 1.1 模块定位

健康检查模块为 AUDEBase Core 提供基础设施探活端点，供 Kubernetes liveness/readiness probe 和运维监控使用。模块独立于插件框架，作为 Core 启动时注册的内置 Fastify 路由。

### 1.2 职责边界

| 职责 | 说明 |
|------|------|
| 数据库探活 | 执行 `SELECT 1` 检测 PostgreSQL 连接可用性 |
| Redis 探活 | 执行 `PING` 检测 Redis 连接可用性（可选） |
| 进程存活 | 返回进程 uptime（秒） |
| 就绪判断 | DB 连接成功时返回 200，否则 503 |
| 版本报告 | 返回应用版本号（从 package.json 读取） |

### 1.3 设计目标

- **零认证**: 健康检查端点无需 JWT 或任何认证，Kubernetes probe 无法携带认证头
- **低开销**: `SELECT 1` 和 `PING` 为常数时间操作，不产生额外负载
- **快速失败**: 探活超时 3 秒后标记为不可用，不阻塞 Kubernetes probe 响应
- **可选 Redis**: Phase 1a Redis 为可选依赖，未配置时 `redis` 字段省略

---

## 2. 接口定义

### 2.1 HTTP 端点

#### GET /health

Kubernetes liveness probe 端点。无 API 前缀。

**请求**: 无参数，无认证。

**成功响应** (200):
```json
{
  "status": "ok",
  "db": true,
  "redis": true,
  "uptime": 86400,
  "version": "0.1.0",
  "timestamp": "2026-07-16T10:00:00Z"
}
```

**降级响应** (200): DB 不可用时仍返回 200，但 `db: false`。liveness probe 关注进程存活而非依赖可用性。

```json
{
  "status": "ok",
  "db": false,
  "uptime": 3600,
  "version": "0.1.0",
  "timestamp": "2026-07-16T10:00:00Z"
}
```

> `redis` 字段在 Redis 未配置时省略（`undefined`），在 Redis 已配置但不可用时为 `false`。

#### GET /api/health

API 一致性端点。带 `/api` 前缀，响应格式与 `GET /health` 完全相同。

**请求**: 无参数，无认证。

**成功响应** (200): 同 `GET /health`。

#### GET /health/ready

Kubernetes readiness probe 端点。无 API 前缀。

**请求**: 无参数，无认证。

**就绪响应** (200):
```json
{
  "status": "ready"
}
```

**未就绪响应** (503):
```json
{
  "status": "not_ready",
  "db": false
}
```

> readiness probe 仅检查 DB 连接。Redis 不可用不影响 readiness 判定（Phase 1a Redis 为可选依赖）。

### 2.2 HealthCheckService 接口

```typescript
// packages/health-check/src/health/service.ts

import type { DatabaseProvider } from '@audebase/core'
import type { RedisClient } from '@audebase/core'
import type { HealthStatus } from '@audebase/shared-types'

/**
 * 健康检查服务
 *
 * 封装 DB/Redis 探活逻辑，供 Fastify 路由调用。
 */
export class HealthCheckService {
  /**
   * @param db DatabaseProvider 实例（必需）
   * @param redis RedisClient 实例（可选，null 表示未配置）
   * @param startTime 进程启动时间戳（ms），默认 Date.now()
   * @param version 应用版本号，默认从 package.json 读取
   */
  constructor(
    private readonly db: DatabaseProvider,
    private readonly redis: RedisClient | null,
    private readonly startTime: number = Date.now(),
    private readonly version: string = '0.0.0',
  )

  /**
   * 执行完整健康检查
   *
   * 并行执行 DB 和 Redis 探活，返回聚合状态。
   *
   * @returns 健康状态对象，结构匹配 healthResponseSchema
   */
  async check(): Promise<HealthStatus>

  /**
   * 检查数据库连接
   *
   * 执行 `SELECT 1` 查询，3 秒超时。
   *
   * @returns true 表示连接正常
   */
  async checkDatabase(): Promise<boolean>

  /**
   * 检查 Redis 连接
   *
   * 执行 `PING` 命令，3 秒超时。
   * Redis 未配置时返回 undefined。
   *
   * @returns true 表示连接正常，undefined 表示未配置
   */
  async checkRedis(): Promise<boolean | undefined>

  /**
   * 获取进程 uptime（秒）
   *
   * @returns 从 startTime 到当前的整数秒数
   */
  getUptime(): number

  /**
   * 获取就绪状态
   *
   * 仅检查 DB 连接。Redis 不影响就绪判定。
   *
   * @returns { ready: boolean } DB 连接成功时 ready=true
   */
  async checkReady(): Promise<{ ready: boolean }>
}
```

### 2.3 路由注册接口

```typescript
// packages/health-check/src/health/routes.ts

import type { FastifyInstance } from 'fastify'
import type { HealthCheckService } from './service.js'

/**
 * 注册健康检查路由到 Fastify 实例
 *
 * 注册以下路由（均无认证）:
 * - GET /health         (liveness probe)
 * - GET /api/health     (API consistency)
 * - GET /health/ready   (readiness probe)
 *
 * @param app Fastify 实例
 * @param service HealthCheckService 实例
 */
export function registerHealthRoutes(
  app: FastifyInstance,
  service: HealthCheckService,
): void
```

### 2.4 共享类型

健康检查模块使用 `@audebase/shared-types` 中定义的类型：

```typescript
// 来自 packages/shared-types/src/schemas.ts

/** 健康检查响应 Zod schema */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  db: z.boolean(),
  redis: z.boolean().optional(),
  uptime: z.number().min(0),
  version: z.string().optional(),
  timestamp: z.string().optional(),
})
```

```typescript
// 需在 shared-types 中新增（GO-004 关联）

/** 就绪检查响应 Zod schema */
export const readyResponseSchema = z.object({
  status: z.enum(['ready', 'not_ready']),
  db: z.boolean().optional(),
})
```

```typescript
// 需在 shared-types 中新增

/** 健康状态类型（从 healthResponseSchema 推导） */
export type HealthStatus = z.infer<typeof healthResponseSchema>

/** 就绪状态类型 */
export type ReadyStatus = z.infer<typeof readyResponseSchema>
```

> **注意**: `readyResponseSchema` 和 `HealthStatus`/`ReadyStatus` 类型当前未在 shared-types 中定义。Phase 1a Week 0 编码时需同步添加。

### 2.5 依赖接口

HealthCheckService 依赖以下 Core 提供的接口：

```typescript
/**
 * 数据库提供者接口（由 Core 定义，packages/core/）
 *
 * HealthCheckService 仅使用 execute 方法执行 SELECT 1。
 */
interface DatabaseProvider {
  /**
   * 执行原始 SQL 查询
   * @param sql SQL 语句
   * @param params 绑定参数
   */
  execute(sql: string, params?: unknown[]): Promise<unknown>
}

/**
 * Redis 客户端接口（由 Core 定义，packages/core/）
 *
 * HealthCheckService 仅使用 ping 方法。
 * 兼容 ioredis 的 ping() 签名。
 */
interface RedisClient {
  /**
   * 发送 PING 命令
   * @returns 'PONG'（连接正常时）
   */
  ping(): Promise<string>
}
```

---

## 3. 生命周期

### 3.1 模块初始化

健康检查模块在 Core Fastify 实例创建后、插件加载前注册。注册顺序：

```
Core 启动
  -> 创建 Fastify 实例
  -> 初始化 DatabaseProvider（连接 PostgreSQL）
  -> 初始化 RedisClient（可选，取决于环境变量）
  -> 创建 HealthCheckService(db, redis)
  -> registerHealthRoutes(app, service)
  -> 加载插件框架
  -> ...
```

### 3.2 请求处理流程

#### GET /health & GET /api/health

```
请求进入
  -> service.check()
    -> Promise.all([checkDatabase(), checkRedis()])
      -> checkDatabase(): db.execute('SELECT 1') with 3s timeout
      -> checkRedis(): redis?.ping() with 3s timeout (或 undefined)
    -> 聚合结果: { status: 'ok', db, redis?, uptime, version, timestamp }
  -> 返回 200 + JSON
```

#### GET /health/ready

```
请求进入
  -> service.checkReady()
    -> service.checkDatabase()
      -> db.execute('SELECT 1') with 3s timeout
    -> { ready: dbResult }
  -> ready=true  -> 200 { status: 'ready' }
  -> ready=false -> 503 { status: 'not_ready', db: false }
```

### 3.3 关闭

健康检查模块无需显式关闭逻辑。DB 和 Redis 连接由 Core 统一管理生命周期。

### 3.4 钩子函数

健康检查模块不参与插件生命周期钩子（afterAdd/beforeLoad/load/install 等）。它是 Core 基础设施，不是插件。

---

## 4. 依赖关系

### 4.1 运行时依赖

| 依赖 | 包名 | 用途 |
|------|------|------|
| Fastify | `fastify` | HTTP 路由注册 |
| shared-types | `@audebase/shared-types` | healthResponseSchema、readyResponseSchema、HealthStatus 类型 |
| Core DatabaseProvider | `@audebase/core` | PostgreSQL 连接（执行 SELECT 1） |
| Core RedisClient | `@audebase/core` | Redis 连接（执行 PING，可选） |

### 4.2 开发依赖

| 依赖 | 用途 |
|------|------|
| vitest | 单元/集成/契约测试 |
| ioredis-mock | 集成测试 Redis mock |

### 4.3 依赖方向

```
packages/health-check/
  -> @audebase/shared-types (类型 + Zod schema)
  -> @audebase/core (DatabaseProvider, RedisClient 接口)
  -> fastify (路由注册)
```

> health-check 不被任何其他 Phase 1a 模块依赖。它是叶子模块。

---

## 5. 错误码与错误处理

### 5.1 错误码

健康检查模块使用 shared-types 中已定义的错误码：

| 错误码 | 场景 | HTTP 状态码 |
|--------|------|:-----------:|
| `DB_UNAVAILABLE` | readiness probe DB 连接失败 | 503 |
| `REDIS_UNAVAILABLE` | Redis 已配置但 PING 失败（仅日志记录，不影响响应） | - |

### 5.2 错误处理策略

| 场景 | 处理方式 | 响应 |
|------|---------|------|
| DB 探活超时（>3s） | catch 异常，`db: false` | /health: 200 (db:false); /health/ready: 503 |
| DB 探活抛错 | catch 异常，`db: false` | 同上 |
| Redis 探活超时（>3s） | catch 异常，`redis: false` | /health: 200 (redis:false) |
| Redis 探活抛错 | catch 异常，`redis: false` | 同上 |
| Redis 未配置（null） | 跳过 Redis 检查 | `redis` 字段省略 |
| 路由处理函数抛错 | Fastify 全局错误处理器捕获 | 500 INTERNAL_ERROR |

### 5.3 超时实现

```typescript
// 探活超时使用 Promise.race 实现
private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)
  )
  return Promise.race([promise, timeout])
}
```

### 5.4 日志级别

| 事件 | 日志级别 |
|------|---------|
| DB 探活失败 | `warn` |
| Redis 探活失败 | `warn` |
| 健康检查请求 | 不记录（高频，仅 dev 模式可开 trace） |
| 路由注册成功 | `info` |

---

## 6. 安全考虑

### 6.1 认证

健康检查端点**不需要认证**。原因：

- Kubernetes liveness/readiness probe 无法携带 JWT
- 健康检查响应不包含敏感信息（无用户数据、无内部 IP、无堆栈）
- 仅暴露 `status`/`db`/`redis`/`uptime`/`version` 字段

### 6.2 信息泄露防护

- `version` 字段仅返回 SemVer 版本号（如 `0.1.0`），不返回 commit hash 或构建详情
- `uptime` 为整数秒，不暴露精确启动时间
- 错误响应不包含数据库连接字符串、主机名或错误堆栈
- 503 响应仅包含 `{ status: 'not_ready', db: false }`，不包含失败原因

### 6.3 速率限制

健康检查端点**不启用速率限制**。原因：

- Kubernetes probe 默认每 10 秒请求一次，频率极低
- 速率限制可能导致 probe 失败 -> Pod 被重启
- 探活操作（SELECT 1 / PING）开销可忽略

### 6.4 CORS

健康检查端点不设置 CORS 头。Kubernetes probe 从集群内部访问，不涉及浏览器跨域。

---

## 7. Mock 约束

### 7.1 DatabaseProvider Mock

单元测试中 mock DatabaseProvider 必须满足：

```typescript
// mock 必须实现 execute 方法
const mockDb = {
  execute: vi.fn().mockResolvedValue(undefined),  // 成功
  // 或: vi.fn().mockRejectedValue(new Error('timeout'))  // 失败
}
```

约束：
- `execute()` 必须返回 Promise（async）
- mock 不需要序列化/反序列化（inline 调用）
- mock 超时行为由测试用例显式控制（`mockRejectedValue`）

### 7.2 RedisClient Mock

```typescript
// mock 必须实现 ping 方法
const mockRedis = {
  ping: vi.fn().mockResolvedValue('PONG'),  // 成功
  // 或: vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))  // 失败
}
```

约束：
- `ping()` 必须返回 `Promise<string>`
- Redis 未配置时传入 `null`（不创建 mock 对象）

### 7.3 Fastify Mock

集成测试使用真实 Fastify 实例 + `app.inject()`，不 mock Fastify 本身。

### 7.4 测试矩阵

| 依赖 | 单元测试 | 集成测试 | 契约测试 |
|------|---------|---------|---------|
| PostgreSQL | mock `db.execute()` | 真实 pg_tmp / Docker | 真实 pg_tmp / Docker |
| Redis | mock `redis.ping()` | ioredis-mock | ioredis-mock |
| Fastify | 不涉及 | 真实 Fastify `inject()` | 真实 Fastify `inject()` |

---

## 8. 变更记录

| 版本 | 日期 | 变更内容 |
|------|------|---------|
| v0.1.0 | 2026-07-16 | 初始版本：定义 3 端点、HealthCheckService 接口、Mock 约束 |

---

## 附录 A: 与 TDD 的一致性映射

| SDD 定义 | TDD 测试用例 | 一致性 |
|----------|-------------|:------:|
| `checkDatabase()` 成功 -> `db: true` | 单元: DB 连接成功 -> db: true | ✅ |
| `checkDatabase()` 失败 -> `db: false` | 单元: DB 连接失败 -> db: false | ✅ |
| `checkRedis()` 成功 -> `redis: true` | 单元: Redis 连接成功 -> redis: true | ✅ |
| `redis: null` -> 字段省略 | 单元: 无 Redis 时 redis 字段不存在 | ✅ |
| `getUptime()` -> 整数 ≥ 0 | 单元: uptime ≥ 0 | ✅ |
| `check()` -> `status: 'ok'` | 单元: status 始终为 ok | ✅ |
| GET /health 200 + schema | 集成: 正常 DB 连接 -> 200 + db:true | ✅ |
| version + timestamp 可选字段 | 集成: 包含 version 和 timestamp | ✅ |
| Redis 可用时 redis: true | 集成: Redis 可用时 redis: true | ✅ |
| 无需认证 | 集成: 无需认证即可访问 | ✅ |
| GET /api/health 200 | 集成: 返回 200 + { status, db, redis, uptime } | ✅ |
| GET /health/ready 200 (ready) | 集成: DB 就绪 -> 200 | ✅ |
| GET /health/ready 503 (not_ready) | 契约: DB 不可用 -> 503 | ✅ |
| healthResponseSchema 契约 | 契约: 200 响应形状匹配 healthResponseSchema | ✅ |
| readyResponseSchema 契约 | 契约: 200 响应形状匹配 readyResponseSchema | ✅ |

---

## 附录 B: 已知缺口

| 缺口编号 | 描述 | 处理时机 |
|---------|------|---------|
| GO-004 | Redis 健康检查实现方案：PING 命令 + 3s 超时 + 可选配置 | 本 SDD 已定义 |
| shared-types gap | `readyResponseSchema`、`HealthStatus`、`ReadyStatus` 类型未在 shared-types 中定义 | Phase 1a Week 0 编码时同步添加 |
| DatabaseProvider 接口 | `DatabaseProvider` 接口定义在 Core（packages/core/），Core SDD 尚未生成（GO-021） | Phase 1a Week 0 Core SDD 生成时确认 |
| RedisClient 接口 | `RedisClient` 接口定义在 Core，具体接口签名待 Core SDD 确认 | Phase 1a Week 0 Core SDD 生成时确认 |
