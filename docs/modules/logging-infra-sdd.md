# Logging Infrastructure SDD — Phase 1a

> **创建日期**: 2026-07-13  
> **目的**: 为 Phase 1a 日志/调试基础设施提供编码前的完整接口定义。  
> **前置阅读**: D9.1（慢查询监控）, architecture.md §七（日志/调试验收标准）, D14（i18n 与 translate 上下文）  
> **责任人**: Person A

---

## 1. 概述

AUDEBase 日志基础设施基于 pino 构建，提供全平台统一的结构化日志。所有日志（Core + 插件）通过 Core Logger 聚合输出，支持 requestId 追踪、tenantId 上下文、慢查询检测和实时日志检查。

### 设计原则

- **结构化 JSON**: 所有日志输出为 JSON 格式，便于机器解析和聚合
- **零 console.log**: 生产代码禁止使用 `console.log`，全部通过 Logger 接口
- **插件隔离 + 聚合**: 每个插件有独立 logger 实例（带插件名 scope），输出全部路由到 Core 统一 pipeline
- **请求追踪**: 每个 HTTP 请求自动注入 `X-Request-ID` 头，所有关联日志携带同一 requestId
- **多租户感知**: 日志自动携带 `tenantId` 上下文（当请求上下文中可用时）
- **Phase 1a 最小集**: Inspector 端口提供实时日志查看，满足调试需求；Phase 1b+ 扩展 OpenTelemetry

---

## 2. Public API Surface

### 2.1 Logger 接口

```typescript
// packages/core/src/logger.ts

interface Logger {
  /**
   * Info 级别日志 — 常规操作记录
   *
   * @param context — 结构化上下文（自动合并 requestId, tenantId, pluginName）
   * @param message — 日志消息
   */
  info(context: Record<string, unknown>, message: string): void

  /**
   * Warn 级别日志 — 非致命警告
   */
  warn(context: Record<string, unknown>, message: string): void

  /**
   * Error 级别日志 — 错误记录（自动捕获 stack trace）
   *
   * @param context — 结构化上下文
   * @param message — 错误消息
   *   — 如果 context 中存在 err/error 字段，自动序列化 stack
   */
  error(context: Record<string, unknown>, message: string): void

  /**
   * Debug 级别日志 — 仅在 debug 模式启用时输出
   *
   * Phase 1a: 通过环境变量 AUDE_LOG_LEVEL=debug 启用
   */
  debug(context: Record<string, unknown>, message: string): void

  /**
   * 创建带预设上下文的子 Logger
   *
   * 插件使用此方法创建带 pluginName 的子 logger，
   * 所有通过此 logger 输出的日志自动携带 pluginName。
   *
   * @param bindings — 预设上下文（如 { plugin: '@audebase/plugin-rbac' }）
   */
  child(bindings: Record<string, string>): Logger
}
```

### 2.2 CoreLogger（Core 内部实现）

```typescript
// packages/core/src/core-logger.ts

interface CoreLogger {
  /**
   * 获取用户可读的插件日志流（用于 Inspector UI）
   *
   * 返回最近 N 条日志，支持按插件/级别/时间范围过滤。
   *
   * @param options — 过滤选项
   * @returns 日志条目列表（按时间倒序）
   */
  getRecentLogs(options: LogQueryOptions): LogEntry[]

  /**
   * 设置全局日志级别（运行时修改，立即生效）
   *
   * @param level — 'debug' | 'info' | 'warn' | 'error'
   */
  setLogLevel(level: LogLevel): void

  /**
   * 获取当前日志级别
   */
  getLogLevel(): LogLevel

  /**
   * 创建插件专用 Logger
   *
   * 注入 pluginName 作为默认上下文。
   * 通过 PluginHost.logger 暴露给插件。
   *
   * @param pluginName — 插件包名
   */
  createPluginLogger(pluginName: string): Logger
}
```

### 2.3 辅助类型

```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogQueryOptions {
  /** 限制返回条数（默认 100） */
  limit?: number

  /** 按插件过滤 */
  pluginName?: string

  /** 按日志级别过滤 */
  level?: LogLevel

  /** 按 requestId 过滤 */
  requestId?: string

  /** 按时间范围过滤 */
  since?: Date
  until?: Date
}

interface LogEntry {
  /** 日志级别 */
  level: LogLevel

  /** 时间戳（ISO 8601） */
  timestamp: string

  /** 日志消息 */
  message: string

  /** 结构化上下文 */
  context: Record<string, unknown>

  /** 以下为自动注入字段 */
  /** 请求 ID（HTTP 请求自动注入） */
  requestId?: string

  /** 租户 ID（租户上下文中自动注入） */
  tenantId?: string

  /** 插件名（通过 PluginHost.logger 自动注入） */
  plugin?: string

  /** 进程 PID */
  pid: number

  /** 主机名 */
  hostname: string
}
```

---

## 3. 架构设计

### 3.1 日志流架构

```
┌──────────────────────────────────────────────────────┐
│                    Log Outputs                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │  stdout  │  │ stderr   │  │ Inspector WebSocket│   │
│  │ (JSON)   │  │ (JSON)   │  │ (实时日志推送)     │   │
│  └────┬─────┘  └────┬─────┘  └────────┬─────────┘   │
│       │              │                │               │
│       └──────────────┼────────────────┘               │
│                      │                                │
│              ┌───────▼────────┐                       │
│              │  pino.multistream│                     │
│              └───────┬────────┘                       │
│                      │                                │
│       ┌──────────────┼──────────────┐                 │
│       ▼              ▼              ▼                 │
│  ┌─────────┐  ┌──────────┐  ┌──────────────┐        │
│  │ stderr  │  │ Ring     │  │ WebSocket    │        │
│  │ stream  │  │ Buffer   │  │ broadcast    │        │
│  │ (error  │  │ (最近    │  │ (Inspector   │        │
│  │  only)  │  │  1000条) │  │  UI 推送)    │        │
│  └─────────┘  └──────────┘  └──────────────┘        │
│                                                       │
│              ┌──────────────────┐                     │
│              │   请求中间件      │                     │
│              │ (inject requestId │                    │
│              │  + tenantId)      │                    │
│              └────────┬─────────┘                     │
│                       │                               │
│  ┌────────────────────┼────────────────────┐          │
│  │                    │                    │          │
│  ▼                    ▼                    ▼          │
│ Core Logger     Plugin-A Logger     Plugin-B Logger   │
│ (root pino)     (child pino)        (child pino)      │
└──────────────────────────────────────────────────────┘
```

### 3.2 请求追踪注入

```typescript
// Fastify onRequest hook — 每个请求自动注入
server.addHook('onRequest', async (request, reply) => {
  // 从请求头或生成新的 requestId
  const requestId =
    request.headers['x-request-id'] as string ||
    crypto.randomUUID()

  // 注入到 reply header（返回给客户端）
  reply.header('X-Request-ID', requestId)

  // 注入到 request context（供日志使用）
  request.requestId = requestId

  // 创建带 requestId 的子 logger
  request.log = logger.child({ requestId })
})
```

### 3.3 tenantId 上下文注入

```typescript
// Fastify preHandler hook — 在认证后执行
server.addHook('preHandler', async (request) => {
  if (request.tenantId) {
    request.log = request.log.child({ tenantId: request.tenantId })
  }
})
```

---

## 4. 配置管理

### 4.1 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AUDE_LOG_LEVEL` | `info` | 日志级别: debug / info / warn / error |
| `AUDE_LOG_PRETTY` | `false` | 开发模式: 彩色可读输出（非 JSON） |
| `AUDE_LOG_INSPECTOR_PORT` | `0` (禁用) | Inspector WebSocket 端口（0 = 禁用） |
| `AUDE_SLOW_QUERY_THRESHOLD` | `100` | 慢查询阈值（毫秒） |
| `AUDE_LOG_RING_SIZE` | `1000` | 环形缓冲区大小（条数） |

### 4.2 日志级别配置优先级

```
1. 环境变量 AUDE_LOG_LEVEL（最高优先级）
2. 运行时 CoreLogger.setLogLevel(level)（次优先级）
3. 默认值 "info"（最低优先级）
```

---

## 5. Inspector 端口

### 5.1 功能

Phase 1a 提供调试端口，通过 WebSocket 推送实时日志：

```typescript
// packages/core/src/inspector.ts

interface LogInspector {
  /**
   * 启动 Inspector WebSocket 服务器
   *
   * @param port — 监听端口（来自 AUDE_LOG_INSPECTOR_PORT）
   */
  start(port: number): Promise<void>

  /**
   * 向所有连接的 Inspector 客户端广播日志条目
   */
  broadcast(entry: LogEntry): void

  /**
   * 获取环形缓冲区中的最近日志
   */
  getRecentLogs(options: LogQueryOptions): LogEntry[]

  /**
   * 停止 Inspector 服务器
   */
  stop(): Promise<void>
}
```

### 5.2 Inspector UI 端点（Phase 1a 生产路径）

```typescript
// GET /api/logs — 通过 REST API 查看日志（无需 WebSocket）
server.get('/api/logs', {
  preHandler: [authGuard, roleGuard('admin')]
}, async (request, reply) => {
  const { limit = 100, pluginName, level, since } = request.query as LogQueryOptions
  const logs = coreLogger.getRecentLogs({ limit, pluginName, level, since })
  return { success: true, data: logs }
})
```

---

## 6. 慢查询监控

基于 D9.1，通过 Drizzle 查询钩子检测慢查询：

```typescript
// packages/core/src/slow-query-monitor.ts

interface SlowQueryMonitor {
  /**
   * 包装 Drizzle 查询执行，自动检测慢查询
   *
   * @param threshold — 慢查询阈值（毫秒），默认 100
   */
  wrap(threshold: number): void
}

// 实现示例
function createSlowQueryMonitor(
  db: DrizzleDB,
  logger: Logger,
  threshold = 100
): SlowQueryMonitor {
  // 通过 Drizzle 客户端事件钩子或 pg-pool 的 query 事件
  // 检测执行时间超过 threshold 的查询

  // pg-pool 方式:
  pool.on('query', (query) => {
    const start = Date.now()
    query.on('end', () => {
      const elapsed = Date.now() - start
      if (elapsed > threshold) {
        logger.warn({
          sql: query.text,
          params: query.values,
          duration: elapsed,
          threshold,
        }, `慢查询: ${elapsed}ms (阈值: ${threshold}ms)`)
      }
    })
  })
}
```

---

## 7. 错误处理

### 7.1 错误类型

```typescript
type LoggingError =
  | {
      type: 'WRITE_FAILURE'
      stream: 'stdout' | 'stderr'
      cause: Error
    }
  | {
      type: 'RING_BUFFER_FULL'
      dropped: number      // 丢弃的日志条数
    }
  | {
      type: 'INSPECTOR_PORT_IN_USE'
      port: number
      cause: Error
    }
```

### 7.2 错误传播约定

- **日志写入失败**: 降级写入 stderr → 如 stderr 也失败 → 静默丢弃（日志崩溃不应导致应用崩溃）
- **环形缓冲区满**: 丢弃最旧日志，记录 `RING_BUFFER_FULL` 警告
- **Inspector 端口被占用**: 记录 warning → 使用随机端口重试 → 重试失败则禁用 Inspector
- **慢查询检测异常**: 捕获 Drizzle/pg-pool 事件错误 → 记录 warning → 不影响正常查询执行

### 7.3 日志格式标准

所有日志条目为单行 JSON，标准字段：

```json
{
  "level": 30,
  "time": "2026-07-13T12:00:00.000Z",
  "pid": 12345,
  "hostname": "aude-server-01",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "tenantId": "660e8400-e29b-41d4-a716-446655440001",
  "plugin": "@audebase/plugin-rbac",
  "msg": "用户创建成功",
  "context": {
    "userId": "770e8400-e29b-41d4-a716-446655440002",
    "role": "admin"
  }
}
```

pino 日志级别数值映射: `10=trace, 20=debug, 30=info, 40=warn, 50=error, 60=fatal`

---

## 8. 测试边界

| 测试层级 | 范围 | Mock 策略 | 文件位置 |
|---------|------|----------|---------|
| 单元测试 | Logger 接口方法、日志格式化、requestId 注入 | mock pino stream (sink) | `src/__tests__/unit/` |
| 集成测试 | CoreLogger + 插件 logger 聚合、slow query 检测 | 真实 pg-pool + pino 输出文件 | `src/__tests__/integration/` |
| E2E 测试 | Inspector 端点 + REST API `/api/logs` | 真实 Fastify + 日志文件验证 | `packages/admin-ui/__e2e__/` |

### 最小测试用例集

1. **Logger 基础输出**: `logger.info({}, 'test')` → stdout 包含 `{"level":30,"msg":"test"}`
2. **子 Logger 上下文**: `logger.child({plugin:'test'}).info({}, 'msg')` → 输出含 `"plugin":"test"`
3. **requestId 注入**: HTTP 请求无 `X-Request-ID` → 自动生成 → response header 含 `X-Request-ID`
4. **tenantId 上下文**: 认证通过的请求 → 后续所有日志含 `tenantId` 字段
5. **慢查询检测**: 执行 >100ms 的 SQL 查询 → 产生 `level:40` 日志含 `slow_query`
6. **日志级别过滤**: `setLogLevel('error')` → 后续 info/warn 日志不输出
7. **环形缓冲区**: 写入 1500 条日志（buffer size=1000）→ `getRecentLogs({limit:1000})` 返回最近 1000 条
8. **写入失败降级**: 模拟 stdout pipe 断开 → 后续日志写 stderr → 应用不崩溃
9. **Inspector REST API**: `GET /api/logs?pluginName=@audebase/plugin-rbac&level=error` → 返回过滤后的日志
10. **插件 Logger 独立**: plugin-A 和 plugin-B 各自 log → 聚合到 Core → 可按 plugin 过滤

---

## 9. 实现约束

- **pino 为唯一日志库**: 不使用 winston、bunyan 等其他日志库
- **禁止 console.log**: ESLint 规则 `no-console: error` 全局启用
- **JSON 输出默认**: 生产环境强制 JSON 格式。开发环境通过 `AUDE_LOG_PRETTY=true` 切换为彩色输出
- **插件不可创建独立 pino**: 插件必须通过 `PluginHost.logger` 获取 logger 实例，不能自行 `import pino`
- **requestId 为 UUID v7**: 时间有序，便于按时间排序
- **类型安全**: 禁止 `as any` / `@ts-ignore`，Logger 接口全量类型标注
- **pino-pretty 为 devDependency**: 不在生产依赖中

---

## 10. 与其他模块的交互

| 调用方/被调用方 | 接口 | 调用方式 |
|----------------|------|---------|
| #1 内核骨架 (Core) | `CoreLogger.createPluginLogger()` | 在 PluginManager.load() 中为每个插件创建 logger |
| 所有插件 | `PluginHost.logger` | 插件代码中通过注入的 context 使用 |
| #10 审计日志 | `audit_log` 表 | 审计事件使用 Core logger 记录（带 `audit_action` 上下文） |
| #12 管理 UI | `GET /api/logs` | Admin 调试页面轮询获取日志 |
| Drizzle ORM | SlowQueryMonitor | pg-pool query 事件钩子 |

---

## 11. 生命周期

### 11.1 启动 (startup)

```
Core 启动
  │
  ├─ createLogger() — 创建 pino root logger
  │     ├─ 读取环境变量 AUDE_LOG_LEVEL (默认 info)
  │     ├─ 配置输出流 (stdout + stderr + ring buffer)
  │     └─ 可选：启动 Inspector WebSocket (AUDE_LOG_INSPECTOR_PORT)
  │
  ├─ createSlowQueryMonitor(logger, 100ms)
  │     └─ 监听 pg-pool query 事件，超阈值自动 log warn
  │
  └─ 为每个插件创建 child logger (pluginName 注入)
```

**前置条件**: Drizzle DB 连接已建立，pg-pool 已初始化。

**失败处理**:
- stdout/stderr 写入失败 → 降级到环形缓冲区 → 不崩溃
- Inspector 端口被占用 → warning → 随机端口重试 → 失败则禁用 Inspector
- 环形缓冲区创建失败 → logger.error → Core 仍可启动（日志仅 stdout/stderr）

### 11.2 运行时 (runtime)

- HTTP 请求到达 → onRequest hook 注入 requestId → preHandler 注入 tenantId
- 插件通过 PluginHost.logger 输出日志 → child logger 自动携带 pluginName
- CoreLogger.getRecentLogs() → 从环形缓冲区读取最近 N 条
- CoreLogger.setLogLevel() → 运行时切换日志级别（立即生效）
- SlowQueryMonitor 持续监听 pg-pool 查询事件

### 11.3 关闭 (shutdown)

- Inspector.stop() → 关闭 WebSocket 服务器
- 环形缓冲区清空 → 无需持久化
- pino stream flush → 确保最后日志写入

---

## 12. Open Questions (Phase 1a 期间解决)

- [ ] 日志持久化策略：当前仅环形缓冲区（内存），是否需要写文件或持久化到数据库？
- [ ] 多进程日志聚合：Phase 1a 单进程无此需求，Phase 2 process 模式如何聚合子进程日志？
- [ ] Inspector WebSocket 认证：调试端口是否需要 token 认证？
- [ ] Error stack trace 格式：是否需要在 error 日志中自动附加完整 stack trace？
- [ ] 日志轮转 (log rotation)：当使用文件输出时是否需要集成 pino-rotating-file？

---

## 13. 变更记录

| 版本 | 日期 | 变更内容 |
|------|------|---------|
| v0.1.0 | 2026-07-13 | 初始版本 |
