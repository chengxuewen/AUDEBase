# SDD: WebSocket Module

**Module**: `@audebase/websocket`
**Package Path**: `packages/websocket/`
**Phase**: Phase 2
**Status**: SDD Complete (post-implementation)
**Decision References**: D1.11, D1.3, architecture.md §4.6.3

---

## 1. 概要

### 模块定位

WebSocket 模块为 AUDEBase 平台提供实时通信能力，实现 D1.11 决策中定义的 Collection 变更事件订阅。客户端通过 `/ws` 端点建立 WebSocket 连接，按需订阅指定 Collection 的 create/update/delete 事件，服务端在对应 Collection 发生变更时实时推送事件。

### 职责边界

| 范围 | 说明 |
|------|------|
| **负责** | WebSocket 连接身份认证（token-based）、Collection 事件订阅/取消订阅管理、变更事件广播（同租户过滤）、与 EventBus 的适配器集成 |
| **不负责** | HTTP REST API、WebSocket 连接池管理（Phase 2 内存模式）、Redis Pub/Sub 跨进程传播（Phase 3+）、消息持久化/重放、连接心跳/keep-alive |

### 设计目标

1. **实时推送** — Collection 变更事件在内存中直接广播到订阅客户端，零持久化延迟
2. **多租户隔离** — 事件仅在相同 tenantId 的客户端间广播，防止跨租户信息泄露
3. **按需订阅** — 客户端可订阅指定 Collection + 事件类型（create/update/delete）组合，减少不必要推送
4. **松耦合集成** — 通过 `createEventBusAdapter` 适配器与 EventBus 模块对接，WebSocket 模块零 EventBus 依赖
5. **协议简洁** — 客户端/服务端消息使用 JSON 序列化类型判别联合（discriminated union），易于客户端实现

### Phase 范围

| Capability | Phase 2 | Phase 3+ |
|------------|---------|----------|
| token-based 认证 | ✅ (mock) | ✅ (JWT 验证) |
| Collection 事件订阅 | ✅ | ✅ |
| 同进程广播 | ✅ | ✅ |
| Redis Pub/Sub 跨进程传播 | 🔲 | ✅ |
| 连接心跳/自动重连 | 🔲 | ✅ |
| 消息持久化/离线补推 | 🔲 | ✅ |

---

## 2. 接口定义

### 2.1 类型定义

```typescript
// packages/websocket/src/types.ts

/** Connected WebSocket client identity */
interface WsClient {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly connectedAt: Date;
}

/** A single subscription to collection change events */
interface WsSubscription {
  readonly clientId: string;
  readonly collection: string;
  readonly events: readonly ("create" | "update" | "delete")[];
}

/** Event published when a collection record changes */
interface CollectionChangeEvent {
  readonly collection: string;
  readonly action: "create" | "update" | "delete";
  readonly recordId: string;
  readonly data?: Record<string, unknown>;
  readonly tenantId: string;
}

/** Callback signature for the manager to notify external event sources */
type ChangeCallback = (event: CollectionChangeEvent) => void;

// ── WebSocket Protocol Messages ────────────────────────────────────

/** Client → Server: subscribe to collection events */
interface SubscribeMessage {
  readonly type: "subscribe";
  readonly collection: string;
  readonly events: ("create" | "update" | "delete")[];
}

/** Client → Server: unsubscribe from a collection */
interface UnsubscribeMessage {
  readonly type: "unsubscribe";
  readonly collection: string;
}

/** Server → Client: subscription confirmation */
interface SubscribedResponse {
  readonly type: "subscribed";
  readonly collection: string;
  readonly events: readonly ("create" | "update" | "delete")[];
}

/** Server → Client: unsubscription confirmation */
interface UnsubscribedResponse {
  readonly type: "unsubscribed";
  readonly collection: string;
}

/** Server → Client: a collection event */
interface EventResponse {
  readonly type: "event";
  readonly collection: string;
  readonly action: "create" | "update" | "delete";
  readonly recordId: string;
  readonly data?: Record<string, unknown>;
}

/** Server → Client: error */
interface ErrorResponse {
  readonly type: "error";
  readonly message: string;
}

/** Union of all client → server messages */
type ClientMessage = SubscribeMessage | UnsubscribeMessage;

/** Union of all server → client messages */
type ServerMessage =
  | SubscribedResponse
  | UnsubscribedResponse
  | EventResponse
  | ErrorResponse;
```

### 2.2 authenticateWs

```typescript
// packages/websocket/src/auth.ts

/**
 * Validates a JWT token and returns client identity.
 * Phase 2 uses a mock — production would decode JWT and verify
 * against the kernel auth provider.
 *
 * @param token — WebSocket connection token (Phase 2: "mock-{tenantId}-{userId}")
 * @returns WsClient identity, or null if token is invalid
 */
function authenticateWs(token: string): WsClient | null;
```

**Phase 2 mock 行为**:
- token 长度 < 8 → 返回 null
- token 不以 `"mock-"` 开头 → 返回 null
- token 格式 `"mock-{tenantId}-{userId}"` → 解析出 tenantId 和 userId
- userId 缺省时默认为 `"unknown"`

### 2.3 RoomsManager

```typescript
// packages/websocket/src/rooms.ts

class RoomsManager {
  /**
   * Subscribe a client to collection change events.
   * Replaces any existing subscription for the same collection.
   *
   * @param clientId — client identifier
   * @param collection — collection name (e.g. "users", "orders")
   * @param events — event types to subscribe to (invalid types filtered silently)
   */
  subscribe(clientId: string, collection: string, events: string[]): void;

  /**
   * Unsubscribe a client from a specific collection.
   * No-op if client or collection not found.
   */
  unsubscribe(clientId: string, collection: string): void;

  /**
   * Get client IDs subscribed to a specific collection and action.
   *
   * @returns array of subscriber client IDs
   */
  getSubscribers(collection: string, action: string): string[];

  /**
   * Get all subscriptions for a client.
   *
   * @returns readonly array of WsSubscription (empty array if unknown client)
   */
  getClientSubscriptions(clientId: string): readonly WsSubscription[];

  /**
   * Remove all subscriptions for a disconnected client.
   * No-op if client not found.
   */
  removeAll(clientId: string): void;

  /** Total number of clients with active subscriptions */
  get clientCount(): number;
}
```

**行为契约**:
- `subscribe()`: 同一 client 对同一 collection 重复订阅 → 替换旧订阅（而非追加）
- `subscribe()`: events 数组中非法值（非 create/update/delete）→ 静默过滤
- `unsubscribe()`: client 无剩余订阅 → 清理 Map 条目（`clientCount` 减一）
- 所有方法为同步操作（纯内存 Map）

### 2.4 WsManager

```typescript
// packages/websocket/src/manager.ts

interface WsManagerOptions {
  /** Callback to send a server message to a specific client */
  readonly sendToClient: (clientId: string, message: ServerMessage) => void;
}

class WsManager {
  constructor(options: WsManagerOptions);

  /** Register a newly connected client */
  registerClient(client: WsClient): void;

  /** Remove a disconnected client and clean up its subscriptions */
  removeClient(clientId: string): void;

  /** Check if a client is connected */
  isConnected(clientId: string): boolean;

  /** Get client by ID (undefined if not found) */
  getClient(clientId: string): WsClient | undefined;

  /** Get the underlying RoomsManager */
  getRoomsManager(): RoomsManager;

  /**
   * Subscribe a client to collection events.
   * Sends a "subscribed" confirmation back to the client.
   */
  subscribe(clientId: string, collection: string, events: string[]): void;

  /**
   * Unsubscribe a client from a collection.
   * Sends an "unsubscribed" confirmation back to the client.
   */
  unsubscribe(clientId: string, collection: string): void;

  /**
   * Handle a change event from the event bus / adapter.
   * Broadcasts the event to all subscribed clients matching
   * the collection, action, and tenant.
   */
  handleChangeEvent(event: CollectionChangeEvent): void;

  /**
   * Broadcast a collection change event.
   * Alias for handleChangeEvent — used by the event adapter.
   */
  broadcast(_collection: string, event: CollectionChangeEvent): void;

  /** Number of connected clients */
  get connectedCount(): number;
}
```

**行为契约**:
- `registerClient()`: 将 client 加入内存 Map
- `removeClient()`: 移除 client 并调用 `RoomsManager.removeAll()` 清理订阅
- `subscribe()`: 委托给 `RoomsManager.subscribe()`，然后通过 `sendToClient` 发送 `subscribed` 确认
- `unsubscribe()`: 委托给 `RoomsManager.unsubscribe()`，然后通过 `sendToClient` 发送 `unsubscribed` 确认
- `handleChangeEvent()`: 通过 `RoomsManager.getSubscribers()` 获取订阅者 → 遍历 → 跳过已断开 client → 跳过不同 tenantId 的 client → 对匹配 client 发送 `event` 消息
- `broadcast()`: 直接调用 `handleChangeEvent()`

### 2.5 createEventBusAdapter

```typescript
// packages/websocket/src/adapter.ts

/**
 * Creates an event bus adapter callback that forwards
 * CollectionChangeEvent instances to the WebSocket manager.
 *
 * Usage:
 *   const eventBus = new InMemoryEventBus();
 *   const adapter = createEventBusAdapter(wsManager);
 *   eventBus.subscribe("collection.*", adapter);
 */
function createEventBusAdapter(manager: WsManager): ChangeCallback;
```

**行为**:
- 返回一个 `ChangeCallback` 函数，每次调用时将事件转发给 `manager.handleChangeEvent(event)`
- 工厂函数本身不注册任何事件订阅 — 由调用方决定何时、如何订阅 EventBus

### 2.6 模块入口

```typescript
// packages/websocket/src/index.ts

export type {
  WsClient,
  WsSubscription,
  CollectionChangeEvent,
  ChangeCallback,
  SubscribeMessage,
  UnsubscribeMessage,
  SubscribedResponse,
  UnsubscribedResponse,
  EventResponse,
  ErrorResponse,
  ClientMessage,
  ServerMessage,
} from "./types";

export { authenticateWs } from "./auth";
export { RoomsManager } from "./rooms";
export { WsManager } from "./manager";
export type { WsManagerOptions } from "./manager";
export { createEventBusAdapter } from "./adapter";
```

---

## 3. 生命周期

### 3.1 连接生命周期

```
Client Connect
  │
  ├── WebSocket upgrade (GET /ws?token=mock-tenantA-userX)
  │
  ├── authenticateWs(token)
  │     ├── null → close(4001, "Authentication failed")
  │     └── WsClient → registerClient(client)
  │
  ├── Client sends { type: "subscribe", collection: "...", events: [...] }
  │     └── WsManager.subscribe(clientId, collection, events)
  │           └── sendToClient → { type: "subscribed", ... }
  │
  ├── Client sends { type: "unsubscribe", collection: "..." }
  │     └── WsManager.unsubscribe(clientId, collection)
  │           └── sendToClient → { type: "unsubscribed", ... }
  │
  ├── (EventBus emits CollectionChangeEvent)
  │     └── adapter(event) → manager.handleChangeEvent(event)
  │           └── for each matching subscriber:
  │                 sendToClient → { type: "event", ... }
  │
  └── Client disconnect / close
        └── WsManager.removeClient(clientId)
              ├── clients.delete(clientId)
              └── rooms.removeAll(clientId)
```

### 3.2 无状态设计

Phase 2 所有状态（clients、subscriptions）均为内存存储，进程重启后全部丢失。不实现连接恢复、消息持久化或离线消息补推。

### 3.3 Fastify 集成

本模块提供纯逻辑类（`WsManager`, `RoomsManager`, `authenticateWs`, `createEventBusAdapter`），不包含 Fastify WebSocket 插件注册代码。Fastify 集成由 `core` 包的引导管线完成：
- 注册 `@fastify/websocket`
- 设置 `/ws` 路由
- 在 WebSocket `upgrade` 回调中调用 `authenticateWs`
- 在 `message` 回调中解析 `ClientMessage` 并路由到 `WsManager.subscribe/unsubscribe`

---

## 4. 依赖关系

### 4.1 内部依赖

| 依赖 | 用途 | 关系 |
|------|------|------|
| `@audebase/shared-types` | 公共类型定义（如 Zod schemas） | workspace 依赖 |
| EventBus 模块 | 通过 adapter 接收 CollectionChangeEvent | 运行时注入（非编译期依赖） |

### 4.2 外部依赖

| 依赖 | 用途 | 阶段 |
|------|------|------|
| `@fastify/websocket` | WebSocket 协议支持 | 由 core 包引入 |
| Redis Pub/Sub | 跨进程事件传播 | Phase 3+ |

### 4.3 模块间数据流

```
Collection 写操作 (Core API)
  │
  └── EventBus.publish("collection.changed", CollectionChangeEvent)
        │
        └── createEventBusAdapter callback
              │
              └── WsManager.handleChangeEvent(event)
                    │
                    └── for each subscribed client (same tenant):
                          sendToClient → WebSocket → Client
```

---

## 5. 错误码与错误处理

### 5.1 认证错误

| 场景 | 行为 |
|------|------|
| token 为空字符串 | `authenticateWs("")` 返回 null → WebSocket 连接拒绝（close code 4001） |
| token < 8 字符 | `authenticateWs("short")` 返回 null → WebSocket 连接拒绝 |
| token 非 mock 前缀 | `authenticateWs("Bearer ...")` 返回 null → WebSocket 连接拒绝 |

### 5.2 客户端消息错误

| 场景 | 处理方式 |
|------|----------|
| 收到无法解析的 JSON | 发送 `{ type: "error", message: "Invalid message format" }` |
| 收到未知 type 值 | 发送 `{ type: "error", message: "Unknown message type" }` |
| 未认证 client 发送 subscribe | 忽略（连接已建立即已认证） |

### 5.3 事件广播错误

| 场景 | 处理方式 |
|------|----------|
| client 在 subscribe 后、事件到来前断开 | `handleChangeEvent` 中 `!client` → continue（跳过），不报错 |
| sendToClient 失败（连接已断） | Phase 2 静默忽略（不重试，不记录日志） |
| events 数组含非法值 | `subscribe()` 中静默过滤（只保留 create/update/delete） |

### 5.4 边界情况

| 场景 | 行为 |
|------|------|
| 相同 client+collection 重复订阅 | 替换旧订阅（不是追加） |
| unsubscribe 不存在的 client | No-op（静默） |
| removeClient 不存在的 client | No-op（静默） |
| getClient 不存在的 client | 返回 undefined |
| getClientSubscriptions 不存在的 client | 返回空数组 |
| getSubscribers 无匹配订阅者 | 返回空数组 |
| 所有订阅被移除后 clientCount | 自动降为 0（Map entry 被删除） |

---

## 6. 安全考虑

### 6.1 认证

- Phase 2 使用 mock token 认证（`"mock-{tenantId}-{userId}"`），仅用于测试
- **生产环境**: 需替换为 JWT 验证（解码 + 签名校验 + 过期检查 + token_version 比对），复用 `@audebase/auth` 包的 `verifyAccessToken`
- 无效 token → 连接立即拒绝，close code 4001

### 6.2 多租户隔离

- `WsClient` 包含 `tenantId` 字段，在 `handleChangeEvent()` 中与事件的 `tenantId` 比对
- 不同租户的客户端不会收到彼此的事件
- 客户端无法伪造 `tenantId`（该字段在 `authenticateWs` 中由 token 解析得出）

### 6.3 消息净化

- 客户端发送的 `events` 数组在 `subscribe()` 中过滤：只保留 `"create"`, `"update"`, `"delete"` 三个合法值
- 服务端发送的事件消息仅包含 collection/action/recordId/data，不泄露内部状态

### 6.4 拒绝服务防护

- Phase 2 单进程内存模式，无外部攻击面
- 客户端可订阅的 event 类型限定为 3 种，无资源放大风险
- 订阅数量上限由业务层控制（Phase 3+ 可加 `maxSubscriptionsPerClient` 限制）

### 6.5 信息泄露防护

- 事件广播严格按 tenantId 过滤
- 客户端无法查询其他客户端的订阅信息
- `RoomsManager` 的 Map 为 `private readonly`，外部无法直接访问

---

## 7. Mock 约束

### 7.1 WebSocket 测试环境

| 约束 | 说明 |
|------|------|
| 无真实 WebSocket | 测试不建立真实 WebSocket 连接；所有测试通过直接调用类方法验证 |
| WsManager mock | 通过 `WsManagerOptions.sendToClient` 回调捕获发送的消息，使用 `sentMessages` 数组记录 |
| RoomsManager 真实实例 | 测试使用真实 `RoomsManager`，因其为纯内存 Map，无需 mock |
| authenticWs 真实函数 | 测试调用真实 `authenticateWs`，因其为纯函数逻辑 |

### 7.2 WsManager 测试 mock 构建

```typescript
// 标准测试 setup
const sentMessages: { clientId: string; message: ServerMessage }[] = [];
const manager = new WsManager({
  sendToClient: (clientId, message) => {
    sentMessages.push({ clientId, message });
  },
});
```

### 7.3 adapter 测试 mock

```typescript
const makeMockManager = (): WsManager => ({
  handleChangeEvent: vi.fn(),
} as unknown as WsManager);
```

**约束**: mock manager 仅需实现 `handleChangeEvent` 方法，其他方法不需要。

### 7.4 测试数据工厂

```typescript
function makeClient(overrides: Partial<WsClient> = {}): WsClient {
  return {
    id: "tenant1:user1",
    tenantId: "tenant1",
    userId: "user1",
    connectedAt: new Date(),
    ...overrides,
  };
}

function makeEvent(overrides?: Partial<CollectionChangeEvent>): CollectionChangeEvent {
  return {
    collection: "users",
    action: "create",
    recordId: "rec-1",
    tenantId: "tenant-A",
    ...overrides,
  };
}
```

---

## 8. 变更记录

| 日期 | 变更 |
|------|------|
| 2026-07-19 | SDD 创建 — 记录 Phase 2 已实现的 WebSocket 模块 (D1.11) |
