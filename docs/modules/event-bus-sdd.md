# SDD: EventBus Module

**Module**: `@audebase/event-bus`
**Package Path**: `packages/event-bus/`
**Phase**: Phase 1b
**Status**: SDD Complete
**Decision References**: D1.9, D1.3, architecture.md §事件模型, phase-planning.md, plugin-communication.md §六

---

## 1. 概要

### 模块定位

EventBus 模块为 AUDEBase 平台提供插件间事件发布/订阅能力。作为应用层事件抽象，允许插件通过 `publish(subject, payload)` / `subscribe(subject, handler)` 实现松耦合通信，不依赖双方编译期类型引用。

### 职责边界

| 范围 | 说明 |
|------|------|
| **负责** | 同进程事件发布/订阅、通配符主题匹配、payload Zod 校验、partition-local 广播、handler 错误隔离（fire-and-forget） |
| **不负责** | Redis Pub/Sub 跨进程传播（Phase 2）、事件持久化/重放、有序事件保证、跨 partition 默认路由 |

### 设计目标

1. **松耦合** - 发布者不知订阅者身份，订阅者不依赖发布者类型
2. **零外部依赖** - Phase 1b 使用内存 Map + EventEmitter，不依赖 Redis 或外部消息队列
3. **安全隔离** - 默认 partition-local 广播，订阅者收不到其他 partition 的事件
4. **错误隔离** - 单个 handler 异常不影响发布者和其他订阅者
5. **Zod 校验** - payload 在发布时由注册的 Zod schema 验证，无效 payload 提前拒绝
6. **manifest 可声明** - 插件通过 `manifest.exports.events` 声明发布事件类型，Core 启动时校验

### Phase 范围

| Capability | Phase 1b | Phase 2+ |
|------------|----------|----------|
| 同进程 EventEmitter | ✅ | ✅ |
| Redis Pub/Sub 传播 | 🔲 | ✅ |
| 事件持久化/重放 | 🔲 | ✅ |
| global scope 跨 partition | 🔲 (仅 partition-local) | ✅ |

---

## 2. 接口定义

### EventHandler 类型

```typescript
type EventHandler = (payload: unknown) => void | Promise<void>
```

### EventSubscription 接口

```typescript
interface EventSubscription {
  subject: string
  handler: EventHandler
  /** One-time subscription (auto-unsubscribe after first fire) */
  once?: boolean
}
```

### EventBusOptions

```typescript
interface EventBusOptions {
  /** Partition name for this EventBus instance (e.g. 'SYSTEM', 'oa', 'erp') */
  partition: string
  /** Enable Zod payload validation (default: true) */
  validatePayload?: boolean
}
```

### EventBus Class

```typescript
class EventBus {
  constructor(options: EventBusOptions)

  /**
   * Publish an event to all subscribers of the given subject.
   * Handlers are called asynchronously (fire-and-forget).
   * Returns the number of handlers invoked.
   */
  publish(subject: string, payload: unknown): number

  /**
   * Subscribe to events matching the given subject.
   * Supports wildcard: 'order.*' matches 'order.created', 'order.updated', etc.
   * Returns a subscription handle for later unsubscription.
   */
  subscribe(subject: string, handler: EventHandler): EventSubscription

  /**
   * Subscribe to a single event, then auto-unsubscribe.
   */
  subscribeOnce(subject: string, handler: EventHandler): EventSubscription

  /**
   * Unsubscribe a specific handler from a subject.
   */
  unsubscribe(subscription: EventSubscription): void

  /**
   * Unsubscribe all handlers for a given subject.
   */
  unsubscribeAll(subject: string): void

  /**
   * Remove all subscriptions. Used during plugin disable/unload.
   */
  clear(): void

  /**
   * Register a Zod schema for a subject. Payload is validated against this
   * schema on publish. Throws on invalid payload.
   */
  registerSchema(subject: string, schema: z.ZodSchema): void
}
```

### EventManifest 类型（manifest 声明）

```typescript
interface EventManifest {
  /** Events this plugin publishes */
  events: {
    name: string
    description?: string
    /** Zod schema as JSON (optional, for runtime validation) */
    payloadSchema?: Record<string, unknown>
    /** Scope: 'partition' (default) or 'global' (Phase 2) */
    scope?: 'partition' | 'global'
  }[]

  /** Events this plugin subscribes to */
  subscriptions?: {
    subject: string
    description?: string
  }[]
}
```

### 通配符匹配规则

```typescript
/**
 * Match a subject against a pattern with '*' wildcard.
 * '*' matches zero or more segments separated by '.'.
 *
 * Examples:
 *   'order.*'       matches 'order.created', 'order.updated'
 *   'order.*'       does NOT match 'order' or 'order.created.confirmed'
 *   '*'             matches everything
 *   'order.created' matches exactly 'order.created' (no wildcard)
 */
function matchSubject(pattern: string, subject: string): boolean
```

### 多租户 API（Phase 2 扩展点）

```typescript
// Phase 2: tenant-scoped EventBus
// topic 自动注入 {tenantId}: 前缀
// 订阅无需关心租户——Core 自动过滤

interface TenantEventBus {
  publish(topic: string, payload: unknown): void
  subscribe(topic: string, handler: EventHandler): EventSubscription
}
```

### Public Exports (index.ts)

```typescript
export { EventBus } from './event-bus.js'
export { matchSubject } from './wildcard.js'
export type { EventHandler, EventSubscription, EventBusOptions, EventManifest } from './types.js'
```

---

## 3. 生命周期

### 初始化

```
Core 启动
  -> 读取 manifest.exports.events 中的事件声明
  -> 为每个 partition 创建一个 EventBus 实例
  -> 注册 Zod schema（如声明了 payloadSchema）
  -> 插件 load() 完成后，订阅者注册 subscribe()
```

### 事件发布流程

```
Plugin A publish('order.created', { orderId: '123' })
  -> EventBus 校验 payload 是否匹配已注册的 Zod schema
  -> schema 无效 -> 抛出 ValidationError（发布者感知错误）
  -> schema 有效或未注册 schema -> 继续
  -> 查找 matchSubject(pattern, 'order.created') 匹配的 handler
  -> 按注册顺序异步调用每个 handler
  -> handler 异常 -> 记录错误日志，继续下一个 handler（fire-and-forget）
  -> 返回被调用的 handler 数量
```

### 订阅流程

```
Plugin B subscribe('order.*', handler)
  -> EventBus 将 handler 注册到内部订阅表
  -> 返回 EventSubscription 句柄
  -> 插件 disable 时调用 unsubscribe() 或 EventBus.clear()
```

### 关闭

```
Core SIGTERM
  -> 通知各 partition 的 EventBus 实例
  -> EventBus.clear() 移除所有订阅
  -> 等待 in-flight handler Promise 完成（最多 5s）
  -> 释放 EventBus 实例
```

---

## 4. 依赖关系

| 依赖 | 类型 | 用途 |
|------|------|------|
| `zod` | external | payload schema 验证 |
| `@audebase/shared-types` | workspace | 公共类型定义 |

**无 Redis 依赖**。Phase 1b 仅使用内存 Map + EventEmitter。

### Phase 2 预留接口

```typescript
// Phase 2: Redis-backed EventBus (not implemented in Phase 1b)
interface EventStore {
  publish(partition: string, subject: string, payload: unknown): Promise<void>
  subscribe(partition: string, subject: string, handler: EventHandler): Promise<EventSubscription>
  unsubscribe(subscription: EventSubscription): Promise<void>
}

// EventBusRedis implements EventStore (Phase 2+)
```

---

## 5. 错误码与错误处理

| 错误码 | 场景 | 恢复策略 |
|--------|------|----------|
| `EVENT_VALIDATION_ERROR` | Payload 不匹配注册的 Zod schema | 发布者修正 payload 后重试 |
| `EVENT_HANDLER_ERROR` | 订阅者 handler 抛异常 | 被 EventBus 捕获并记录日志，不影响发布者和其他订阅者 |
| `EVENT_SUBJECT_INVALID` | subject 不满足格式约束（空字符串、含空格等） | 插件修正 subject 值 |

### 错误处理规则

```typescript
// Handler 异常不传播到发布者
try {
  await handler(payload)
} catch (error) {
  logger.error({ subject, error }, 'Event handler error')
  // 继续处理下一个 handler
}

// Schema 验证失败则抛出异常到发布者
const result = schema.safeParse(payload)
if (!result.success) {
  throw new EventBusValidationError(EVENT_VALIDATION_ERROR, result.error)
}
```

### 响应示例（发布者视角）

```typescript
// 成功
const count = eventBus.publish('order.created', { orderId: '123' })
// count = 3 (3 个 handler 被调用)

// schema 验证失败
eventBus.registerSchema('order.created', z.object({ orderId: z.string() }))
eventBus.publish('order.created', { foo: 'bar' })
// throws EventBusValidationError: "Payload validation failed: ..."
```

---

## 6. 安全考虑

### Partition 隔离

- 每个 partition（SYSTEM / oa / erp / mes / isolated）持有独立的 EventBus 实例
- 订阅者只收自己 partition 内的事件
- 跨 partition 事件需 Phase 2 的 `scope: 'global'` 声明

### 通配符订阅安全

- 通配符 `*` 匹配不跨越 dot 分隔的段（`order.*` 不匹配 `order.created.confirmed`）
- 防止过宽 scope 导致订阅者收到意外事件

### 多租户隔离（Phase 2）

- Reddis Pub/Sub channel 使用 `{tenantId}:{partition}:{subject}` 命名空间
- Core 在路由层验证插件只能操作本租户命名空间
- 通配符自动追加租户前缀，订阅者无法跨越租户监听

### 拒绝服务防护

- Handler 执行不设超时（Phase 1b 同进程，插件为可信代码）
- EventBus 不缓存消息，仅通知当前注册的订阅者
- 单个 handler 阻塞不影响其他 handler（异步调度，并发执行）

### 信息泄露防护

- 订阅者只能收到自己 partition 的事件
- 发布者不感知订阅者数量或身份
- 日志记录事件 subject 和 payload 概要，不记录完整 payload（日志脱敏）

---

## 7. Mock 约束

### 测试中 EventBus 的 mock 约束

| 约束 | 说明 |
|------|------|
| 真实 EventBus | 测试使用真实 `EventBus` 实例，通过控制订阅/发布验证行为 |
| 同步 handler | 测试中 handler 优先使用同步函数，验证返回值 `number` 正确 |
| handler 计数 | 测试断言 `publish()` 返回的 handler 计数等于预期的订阅者数 |
| 通配符匹配 | 测试覆盖精确匹配、单段通配符、不匹配场景 |
| 错误隔离 | 测试注册会抛异常的 handler，验证发布者不受影响，handler 错误被日志记录 |
| 清空测试 | 每个测试用例后调用 `clear()`，避免用例间状态污染 |

### 测试场景覆盖

| 测试用例 | 说明 |
|----------|------|
| 精确匹配订阅 | 订阅 `order.created`，发布 `order.created`，handler 被调用 |
| 通配符订阅 | 订阅 `order.*`，发布 `order.created` 和 `order.updated`，handler 被调用两次 |
| 不匹配 | 订阅 `order.*`，发布 `user.created`，handler 不被调用 |
| payload 验证 | 注册 schema 后发布合法/非法 payload，验证通过/拒绝 |
| handler 错误隔离 | handler 抛异常，验证 publish 正常返回，错误被记录 |
| once 订阅 | subscribeOnce 后 handler 只被调用一次 |
| unsubscription | 取消订阅后 publish 不再调用 handler |
| partition 隔离 | 不同 partition 的 EventBus 实例互不影响 |
| clear | clear 后所有订阅被移除 |

---

## 8. 变更记录

| 日期 | 变更 |
|------|------|
| 2026-07-17 | 初始 SDD 创建 - Phase 1b 同进程 EventBus，内存 Map + EventEmitter |