# SDD: Cron Module

**Module**: `@audebase/cron`
**Package Path**: `packages/cron/`
**Phase**: Phase 1b (pending)
**Status**: SDD Complete
**Decision References**: D1.10, architecture.md §定时任务, phase-planning.md

---

## 1. 概要

### 模块定位

Cron 模块为 AUDEBase 平台提供定时任务调度能力。插件通过统一的 `CronManager` API 注册 cron 表达式驱动的周期性任务，也可在 manifest.yaml 中声明式定义。Phase 1b 所有任务在同进程 Core 内执行，Phase 2 支持独立 Worker 进程。

### 职责边界

| 范围 | 说明 |
|------|------|
| **负责** | 定时任务注册/注销、cron 表达式解析、任务调度执行、重试策略、执行日志 |
| **不负责** | 分布式任务编排（Phase 2+）、工作流引擎、事件驱动调度、长期运行的流式任务 |

### 设计目标

1. **零额外依赖** - 复用已有 BullMQ + Redis 基础设施，BullMQ repeatable jobs 是内置能力
2. **声明式 + 编程式 API** - 既支持 manifest.yaml 声明，也支持 `this.app.cron.add()` 编程注册
3. **故障隔离** - 单任务失败不影响其他任务，不崩溃 Core 进程
4. **可观测** - 每次执行记录 start/end/duration/error 到结构化日志
5. **幂等性保障** - 任务 handler 应设计为幂等，CronManager 不保证 exactly-once（BullMQ 默认 at-least-once）

---

## 2. 接口定义

### CronJobConfig

```typescript
interface CronJobConfig {
  /** Unique job name within the plugin scope */
  name: string
  /** Cron expression (compatible with node-cron / BullMQ repeatable jobs) */
  schedule: string
  /** Plugin-internal function name to call when the job fires */
  handler: string
  /** Optional: timezone (IANA tz, e.g. "Asia/Shanghai"). Defaults to UTC. */
  timezone?: string
  /** Optional: max retry attempts on failure (default: 3) */
  maxRetries?: number
  /** Optional: plugin name, automatically set by CronManager */
  pluginName?: string
}
```

### CronJobResult

```typescript
interface CronJobResult {
  name: string
  pluginName: string
  nextRunAt: number
  lastRunAt: number | null
  lastDuration: number | null
  lastError: string | null
  running: boolean
}
```

### CronLogger (execution tracking)

```typescript
interface CronExecutionLog {
  jobName: string
  pluginName: string
  startedAt: string
  completedAt: string
  durationMs: number
  success: boolean
  error: string | null
}
```

### CronManager Class

```typescript
class CronManager {
  constructor(options: { connection?: { host: string; port: number } })

  /**
   * Register a cron job. Accepts BullMQ-compatible cron expressions.
   * Throws if a job with the same name already exists.
   */
  add(config: CronJobConfig): Promise<void>

  /**
   * Remove a registered cron job by name.
   * No-op if the job does not exist.
   */
  remove(name: string): Promise<void>

  /**
   * List all registered cron jobs with their status.
   */
  list(): Promise<CronJobResult[]>

  /**
   * Start processing (called by Core on boot).
   * Creates BullMQ Worker and begins polling for due jobs.
   */
  start(): Promise<void>

  /**
   * Gracefully stop all cron processing.
   * Waits for running jobs to complete (configurable grace period).
   */
  stop(): Promise<void>
}
```

### Plugin API (through PluginHost context)

```typescript
// Available on `this.app.cron` inside plugin lifecycle
interface PluginCronAPI {
  add(config: CronJobConfig): Promise<void>
  remove(name: string): Promise<void>
}
```

### manifest.yaml Cron Field Schema

```yaml
# In plugin manifest.yaml
cron:
  - name: "daily-report"
    schedule: "0 8 * * *"        # Every day at 08:00 UTC
    handler: "generateDailyReport"
    timezone: "Asia/Shanghai"
    maxRetries: 3
  - name: "cleanup-temp"
    schedule: "0 3 * * 0"        # Every Sunday at 03:00 UTC
    handler: "cleanupTempFiles"
```

**Schema constraints**:

- `name`: 插件内唯一，插件间允许重名（自动以 pluginName 为前缀隔离）
- `schedule`: 标准 cron 表达式，6 字段（秒 分 时 日 月 周）或 5 字段（分 时 日 月 周），兼容 node-cron 格式
- `handler`: 插件类上的方法名，必须为 async 函数，在插件 `load()` 时验证存在性
- `maxRetries`: 1-10 范围内整数，默认 3

### Public Exports (index.ts)

```typescript
export { CronManager } from './cron-manager.js'
export type { CronJobConfig, CronJobResult, CronExecutionLog } from './types.js'
```

---

## 3. 生命周期

### 初始化流程

```
Core 启动
  -> Redis 连接就绪
  -> new CronManager({ connection: redisConnection })
  -> 遍历已加载插件的 manifest.yaml
     -> 合并插件通过 this.app.cron.add() 编程注册的任务
     -> 调用 cronManager.start() 创建 BullMQ Worker
  -> Worker 监听 repeatable job 队列
```

### 任务执行流程

```
BullMQ 触发 repeatable job
  -> Worker 接收 job
  -> 按 pluginName 查找对应插件实例
  -> 调用 handler 方法 (即插件的 handler 函数)
     -> 记录 start 日志 (jobName, pluginName, startedAt)
     -> 执行 handler
     -> 记录 end 日志 (durationMs, success=true)
  -> handler 抛出异常?
     YES -> 记录 error 日志 (durationMs, success=false, error)
            -> 根据 maxRetries 重试 (BullMQ 内置 retry, 指数退避)
            -> 重试耗尽后标记为 failed，不阻塞其他任务
     NO  -> 标记 job 完成
  -> Worker 继续监听下一个触发
```

### 关闭流程

```
SIGTERM 信号
  -> cronManager.stop()
     -> BullMQ Worker.close() (等待运行中任务完成, 默认 30s 超时)
     -> 所有 cron 调度停止
  -> Core 继续其他关闭流程
```

### manifest 注册时机

```
插件加载时:
  afterAdd -> beforeLoad -> load()
    -> load() 中插件调用 this.app.cron.add() 或 Core 解析 manifest.cron
    -> CronManager 收集配置但还不调度
  -> install() + afterEnable()
  -> Core 完成所有插件加载后统一调用 cronManager.start()
```

---

## 4. 依赖关系

| 依赖 | 类型 | 用途 |
|------|------|------|
| `bullmq` (^5.x) | npm | repeatable jobs 调度 + Worker 执行 |
| `ioredis` | npm | Redis 客户端（BullMQ 依赖） |
| `@audebase/shared-types` | workspace | `CronJobConfig` 类型、错误码 |
| `@audebase/logging-infra` | workspace | 任务执行日志记录 |

### Phase 2 预留

```typescript
// Phase 2: 独立 Worker 进程的预留接口
interface CronWorkerOptions {
  /** Queue name for the dedicated worker */
  queueName: string
  /** Concurrency: how many jobs run in parallel (default: 1) */
  concurrency?: number
}
```

Phase 2 引入独立 Worker 进程时，BullMQ Worker 从 Core 进程迁移到独立 Node.js 进程，通过 Redis 共享队列。此变更对插件透明 — 插件仍通过 `this.app.cron.add()` 注册，无需修改代码。

---

## 5. 错误码与错误处理

### 错误码

| 错误码 | 场景 | 恢复策略 |
|--------|------|----------|
| `CRON_INVALID_SCHEDULE` | cron 表达式格式错误 | 检查表达式格式，支持标准 5/6 字段格式 |
| `CRON_DUPLICATE_NAME` | 同一插件内同名任务重复注册 | 使用 unique name 或先 remove 再 add |
| `CRON_HANDLER_NOT_FOUND` | manifest 中 handler 在插件类上不存在 | 验证插件 load() 时 handler 存在性 |
| `CRON_EXECUTION_FAILED` | handler 执行抛出异常 | 自动重试（指数退避），重试耗尽后记录日志 |

### 重试策略

- 首次失败后等待 1s 重试
- 第二次失败后等待 5s 重试
- 第三次（最后一次）失败后等待 30s 重试
- 重试耗尽后标记为 failed，记录错误日志，不阻塞其他任务
- 每次重试间隔使用 BullMQ `backoff` 策略（exponential delay）

### 任务隔离

- 每个任务在独立 try-catch 中执行
- 一个任务的崩溃/超时不会影响其他任务
- 使用单独的 BullMQ Queue 实例，与其他模块（如事件总线）队列隔离
- 默认不设并发限制（Phase 1b 单 Worker，串行处理），但通过 concurrency 参数可配置

### 日志记录

```typescript
// Every execution produces a structured log entry
logger.info('cron.job.started', { jobName, pluginName, schedule })
logger.info('cron.job.completed', { jobName, pluginName, durationMs })
logger.error('cron.job.failed', { jobName, pluginName, durationMs, error })
```

---

## 6. 安全考虑

### 输入验证

- cron 表达式在 `add()` 时使用 Zod schema 校验格式合法性
- `handler` 名称验证仅允许字母/数字/下划线（防注入）
- `maxRetries` 强制在 1-10 范围
- `timezone` 使用 IANA tz 数据库校验

### Handler 隔离

- handler 在插件实例上下文中调用，不暴露 Core 内部 scope
- handler 无权直接访问其他插件的内部状态
- 超时保护：单 handler 执行超过 10 分钟时触发警告日志（Phase 2 允许硬超时中止）

### 资源控制

- 默认不限制任务数量（由插件开发者自律），但 `list()` 提供监控
- 高频率任务（小于 10 秒间隔）记录警告日志
- Phase 2 支持 per-plugin 任务配额限制

### 多租户

- Phase 1b cron 任务执行在 Core 进程上下文中，不直接感知 tenant_id
- 任务 handler 内部可通过 `this.app.currentTenant`（Phase 2 接口）获取当前租户上下文
- manifest 中 cron 任务的执行不自动继承租户上下文（任务不是 HTTP 请求）

### 幂等性提醒

- 插件 handler 应设计为幂等（BullMQ at-least-once 语义下同任务可能执行多次）
- 幂等 key 可通过 `${pluginName}:${jobName}:${date}` 组合实现
- SDD 建议：涉及写操作的任务 handler 应使用去重或幂等检查

---

## 7. Mock 约束

### BullMQ testMode

```typescript
import { Queue, Worker } from 'bullmq'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// BullMQ provides a test mode that runs jobs synchronously without real Redis
// In test mode, addJob() directly triggers the worker without Redis round-trip
```

| 约束 | 说明 |
|------|------|
| BullMQ testMode | 使用 `new Queue(...)` + `worker.waitUntilReady()` 连接内存队列，无需真实 Redis |
| ioredis-mock | 集成测试中使用 `ioredis-mock` 模拟 Redis，验证 repeatable 元数据写入 |
| Fake timers | 使用 `vi.useFakeTimers()` + `vi.advanceTimersByTime()` 模拟时间推移触发任务 |
| Handler mock | 在插件实例上 mock handler 方法，验证是否被正确调用、调用参数、调用次数 |
| 日志验证 | mock logger 断言每次执行生成正确的结构化日志 |

### 测试场景清单

| 场景 | Mock 策略 | 验证要点 |
|------|-----------|----------|
| 注册任务 | 真实 CronManager + mock handler | 任务出现在 list() 中 |
| 按 cron 表达式触发 | fake timers 模拟时间 | handler 被调用指定次数 |
| 移除任务 | 真实 CronManager | 任务从 list() 消失，不再触发 |
| handler 抛出异常 | handler 模拟 throw | 重试 3 次，记录 error 日志 |
| 重复注册 | 相同 name 调用 add() 两次 | 抛出 CRON_DUPLICATE_NAME |
| 非法 cron 表达式 | add() 传入无效 schedule | 抛出 CRON_INVALID_SCHEDULE |
| 不存在的 handler | manifest 中 handler 名无效 | 插件 load() 时验证失败 |
| 批量任务 | 注册 10 个任务，各自不同 schedule | 各自按规则触发，互不干扰 |

### 测试中 CronManager 的 mock 约束

| 约束 | 说明 |
|------|------|
| 异步 API | `add()`, `remove()`, `start()`, `stop()` 均为 async 方法 |
| 无真实 Redis | 单元测试使用 BullMQ testMode，集成测试使用 ioredis-mock |
| 时间控制 | 使用 `vi.useFakeTimers()` 控制时间推移，精确验证调度行为 |
| 实例隔离 | 每个测试创建独立 CronManager 实例，测试间无共享状态 |

---

## 8. 变更记录

| 日期 | 变更 |
|------|------|
| 2026-07-17 | 初始 SDD 创建 - Phase 1b BullMQ repeatable jobs，同进程执行 |