# WebSocket TDD 测试策略

**模块**: `@audebase/websocket`
**依赖**: `@audebase/shared-types`
**更新日期**: 2026-07-20
**参考**: D1.11 (实时通信 WebSocket)、architecture.md §4.6.3、websocket-sdd.md

---

## 1. 测试策略概述

WebSocket 模块为纯逻辑模块（内存数据结构 + 消息路由），无数据库依赖、无 HTTP 端点。测试策略采用全单元测试，直接调用类方法验证行为。

```
┌──────────────────────────────────────────────────────┐
│  单元测试 (Vitest) — 4 文件 40 用例                     │
│  · auth.test.ts — authenticateWs 认证逻辑             │
│  · rooms.test.ts — RoomsManager 订阅管理              │
│  · manager.test.ts — WsManager 生命周期 + 事件广播      │
│  · adapter.test.ts — EventBus 适配器                  │
└──────────────────────────────────────────────────────┘
```

| 测试文件 | 用例数 | 覆盖率 | 状态 |
|---------|:---:|:---:|------|
| auth.test.ts | 7 | 100% | ✅ |
| adapter.test.ts | 5 | 100% | ✅ |
| manager.test.ts | 15 | ~96% | ✅ |
| rooms.test.ts | 13 | 100% | ✅ |
| **合计** | **40** | **97.27%** | ✅ |

---

## 2. 模块结构

```
packages/websocket/
├── src/
│   ├── index.ts              # 模块入口（re-export）
│   ├── types.ts              # 类型定义
│   ├── auth.ts               # authenticateWs
│   ├── rooms.ts              # RoomsManager
│   ├── manager.ts            # WsManager
│   ├── adapter.ts            # createEventBusAdapter
│   └── __tests__/
│       ├── auth.test.ts
│       ├── rooms.test.ts
│       ├── manager.test.ts
│       └── adapter.test.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## 3. auth.test.ts — authenticateWs

**测试方式**: 纯函数单元测试，无需 mock。

```typescript
import { describe, test, expect } from "vitest";
import { authenticateWs } from "../auth";
```

### 3.1 无效 token（4 用例）

```typescript
describe("authenticateWs", () => {
  describe("invalid tokens", () => {
    test("returns null for empty string", () => {
      // Act
      const result = authenticateWs("");
      // Assert
      expect(result).toBeNull();
    });

    test("returns null for short token (< 8 chars)", () => {
      // Act
      const result = authenticateWs("short");
      // Assert
      expect(result).toBeNull();
    });

    test("returns null for non-mock token", () => {
      // Act
      const result = authenticateWs("Bearer eyJhbGciOiJIUzI1NiJ9...");
      // Assert
      expect(result).toBeNull();
    });

    test("returns null for token exactly 7 chars", () => {
      // Act
      const result = authenticateWs("1234567");
      // Assert
      expect(result).toBeNull();
    });
  });
```

### 3.2 有效 mock token（3 用例）

```typescript
  describe("valid mock tokens", () => {
    test("parses tenantId and userId from mock token", () => {
      // Arrange
      const token = "mock-tenantA-userX";

      // Act
      const result = authenticateWs(token);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.id).toBe("tenantA:userX");
      expect(result!.tenantId).toBe("tenantA");
      expect(result!.userId).toBe("userX");
      expect(result!.connectedAt).toBeInstanceOf(Date);
    });

    test("returns unknown userId when only tenantId provided", () => {
      // Act
      const result = authenticateWs("mock-tenantX");

      // Assert
      expect(result).not.toBeNull();
      expect(result!.tenantId).toBe("tenantX");
      expect(result!.userId).toBe("unknown");
      expect(result!.id).toBe("tenantX:unknown");
    });

    test("accepts token with multiple dashes in userId", () => {
      // Act
      const result = authenticateWs("mock-tenantB-user-with-dashes");

      // Assert
      expect(result).not.toBeNull();
      expect(result!.tenantId).toBe("tenantB");
      // split("-") → parts[2] === "user" (first segment after tenantId)
      expect(result!.userId).toBe("user");
    });
  });
});
```

---

## 4. rooms.test.ts — RoomsManager

**测试方式**: 真实 `RoomsManager` 实例（纯内存 Map，无需 mock）。

```typescript
import { describe, test, expect, beforeEach } from "vitest";
import { RoomsManager } from "../rooms";

describe("RoomsManager", () => {
  let rooms: RoomsManager;

  beforeEach(() => {
    rooms = new RoomsManager();
  });
```

### 4.1 subscribe（4 用例）

| # | 用例 | 场景 |
|---|------|------|
| 1 | adds a subscription for a new client and collection | Arrange: 无 → Act: subscribe("client1", "users", ["create","update"]) → Assert: 1 条订阅，events=["create","update"] |
| 2 | replaces an existing subscription for the same collection | Arrange: subscribe("client1", "users", ["create"]) → Act: subscribe("client1", "users", ["update","delete"]) → Assert: 1 条订阅，events=["update","delete"] |
| 3 | allows a client to subscribe to multiple collections | Arrange: 无 → Act: subscribe "users" + "orders" → Assert: 2 条订阅 |
| 4 | filters out invalid event names | Arrange: 无 → Act: subscribe("client1", "users", ["create","invalid","update"]) → Assert: events=["create","update"] |

### 4.2 unsubscribe（3 用例）

| # | 用例 | 场景 |
|---|------|------|
| 5 | removes a subscription for a specific collection | Arrange: subscribe "users" + "orders" → Act: unsubscribe("client1", "users") → Assert: 剩 1 条，collect="orders" |
| 6 | removes client entry when no subscriptions remain | Arrange: subscribe "users" → Act: unsubscribe("client1", "users") → Assert: clientCount=0, getClientSubscriptions=[] |
| 7 | is a no-op for unknown clients | Arrange: 无 → Act: unsubscribe("nonexistent", "users") → Assert: clientCount=0 |

### 4.3 getSubscribers（3 用例）

| # | 用例 | 场景 |
|---|------|------|
| 8 | returns client IDs subscribed to a specific collection and action | Arrange: c1→users[create,update], c2→users[update], c3→orders[create] → Act: getSubscribers("users","update") → Assert: ["client1","client2"] |
| 9 | returns empty array when no subscribers match | Arrange: c1→users[create] → Act: getSubscribers("users","delete") → Assert: [] |
| 10 | returns empty array when no one is subscribed to the collection | Arrange: 无 → Act: getSubscribers("nonexistent","create") → Assert: [] |

### 4.4 removeAll（3 用例）

| # | 用例 | 场景 |
|---|------|------|
| 11 | removes all subscriptions for a client | Arrange: c1→users[create] + orders[update], clientCount=1 → Act: removeAll("client1") → Assert: clientCount=0, getClientSubscriptions=[] |
| 12 | is a no-op for unknown clients | Arrange: 无 → Act: removeAll("nonexistent") → Assert: clientCount=0 |
| 13 | does not affect other clients | Arrange: c1→users[create], c2→orders[update] → Act: removeAll("client1") → Assert: clientCount=1, c2 仍有 1 条 |

### 4.5 getClientSubscriptions（1 用例）

| # | 用例 | 场景 |
|---|------|------|
| 14 | returns empty array for unknown client | Arrange: 无 → Act: getClientSubscriptions("nonexistent") → Assert: [] |

---

## 5. manager.test.ts — WsManager

**测试方式**: 真实 `WsManager` 实例 + `sendToClient` 回调捕获发送消息。

```typescript
import { describe, test, expect, beforeEach } from "vitest";
import { WsManager } from "../manager";
import type { WsClient, CollectionChangeEvent, ServerMessage } from "../types";

describe("WsManager", () => {
  let manager: WsManager;
  let sentMessages: { clientId: string; message: ServerMessage }[];

  beforeEach(() => {
    sentMessages = [];
    manager = new WsManager({
      sendToClient: (clientId, message) => {
        sentMessages.push({ clientId, message });
      },
    });
  });

  // 测试数据工厂
  function makeClient(overrides: Partial<WsClient> = {}): WsClient {
    return {
      id: "tenant1:user1",
      tenantId: "tenant1",
      userId: "user1",
      connectedAt: new Date(),
      ...overrides,
    };
  }
});
```

### 5.1 register/remove（5 用例）

| # | 用例 | 场景 |
|---|------|------|
| 15 | registers a client and tracks it | Arrange: makeClient() → Act: registerClient → Assert: isConnected=true, connectedCount=1 |
| 16 | removes a client and cleans up subscriptions | Arrange: register+subscribe → Act: removeClient → Assert: isConnected=false, connectedCount=0, rooms clientCount=0 |
| 17 | removeClient is a no-op for unknown clients | Arrange: 无 → Act: removeClient("nonexistent") → Assert: connectedCount=0 |
| 18 | getClient returns undefined for unknown client | Arrange: 无 → Act: getClient("nonexistent") → Assert: undefined |
| 19 | getClient returns the registered client | Arrange: registerClient(makeClient()) → Act: getClient(id) → Assert: toEqual(client) |

### 5.2 subscribe/unsubscribe（3 用例）

| # | 用例 | 场景 |
|---|------|------|
| 20 | sends subscribed confirmation on subscribe | Arrange: registerClient → Act: subscribe(id, "users", ["create","update"]) → Assert: sentMessages[0]={type:"subscribed",collection:"users",events:["create","update"]} |
| 21 | sends unsubscribed confirmation on unsubscribe | Arrange: register+subscribe → Act: unsubscribe(id, "users") → Assert: last sent message={type:"unsubscribed",collection:"users"} |
| 22 | filters invalid event names on subscribe | Arrange: registerClient → Act: subscribe(id, "users", ["create","bad","update"]) → Assert: events=["create","update"] |

### 5.3 handleChangeEvent（4 用例）

| # | 用例 | 场景 |
|---|------|------|
| 23 | broadcasts matching events to all subscribed clients | Arrange: c1+c2 都订阅 users[create], 事件: users/create/tenant1 → Act: handleChangeEvent → Assert: sentMessages.length=2, 两个 client 都收到 |
| 24 | does not send events to clients in different tenants | Arrange: c1(tenant1)+c2(tenant2) 都订阅 users[create], 事件: users/create/tenant1 → Act: handleChangeEvent → Assert: sentMessages.length=1, 仅 c1 收到 |
| 25 | does not send events when no one is subscribed to the action | Arrange: c1 订阅 users[create], 事件: users/update → Act: handleChangeEvent → Assert: sentMessages.length=0 |
| 26 | skips disconnected clients (removed between subscribe and event) | Arrange: register+subscribe → removeClient → 发送事件 → Act: handleChangeEvent → Assert: sentMessages.length=0 |

### 5.4 broadcast（1 用例）

| # | 用例 | 场景 |
|---|------|------|
| 27 | forwards to handleChangeEvent | Arrange: register+subscribe users[update] → Act: manager.broadcast("users", event) → Assert: sentMessages[0]={type:"event",collection:"users",action:"update"} |

### 5.5 getRoomsManager（1 用例）

| # | 用例 | 场景 |
|---|------|------|
| 28 | returns the internal rooms manager | Arrange: register+subscribe → Act: getRoomsManager() → Assert: clientCount=1, getSubscribers 正确返回 |

---

## 6. adapter.test.ts — createEventBusAdapter

**测试方式**: mock `WsManager` + 真实 `createEventBusAdapter` 工厂函数。

```typescript
import { describe, test, expect, vi } from "vitest";
import { createEventBusAdapter } from "../adapter";
import type { WsManager } from "../manager";
import type { CollectionChangeEvent } from "../types";

describe("createEventBusAdapter", () => {
  const makeMockManager = (): WsManager => {
    return {
      handleChangeEvent: vi.fn(),
    } as unknown as WsManager;
  };

  const makeEvent = (overrides?: Partial<CollectionChangeEvent>): CollectionChangeEvent => ({
    collection: "users",
    action: "create",
    recordId: "rec-1",
    tenantId: "tenant-A",
    ...overrides,
  });
```

### 6.1 adapter 测试用例（5 用例）

| # | 用例 | 场景 |
|---|------|------|
| 29 | returns a function (ChangeCallback) | Arrange: makeMockManager() → Act: createEventBusAdapter(manager) → Assert: typeof callback === "function" |
| 30 | forwards create event to manager.handleChangeEvent | Arrange: adapter + event(action:"create") → Act: callback(event) → Assert: handleChangeEvent calledOnceWith(event) |
| 31 | forwards update event to manager.handleChangeEvent | Arrange: adapter + event(action:"update") → Act: callback(event) → Assert: handleChangeEvent calledOnceWith(event) |
| 32 | forwards delete event to manager.handleChangeEvent | Arrange: adapter + event(action:"delete") → Act: callback(event) → Assert: handleChangeEvent calledOnceWith(event) |
| 33 | passes data payload through to manager | Arrange: adapter + event(data:{amount:100,currency:"CNY"}) → Act: callback(event) → Assert: handleChangeEvent calledWith(objectContaining({data:{...}})) |

---

## 7. 覆盖率目标

| 指标 | 目标 | 实际 |
|------|:---:|:---:|
| 行覆盖率 | ≥ 80% | 97.27% |
| 分支覆盖率 | ≥ 80% | ~95% |
| 函数覆盖率 | ≥ 80% | 100% |
| 语句覆盖率 | ≥ 80% | 97.27% |

---

## 8. Mock 约束

### 8.1 通用约束

| 约束 | 说明 |
|------|------|
| 无真实 WebSocket | 测试不建立 WebSocket 连接，只测试纯逻辑类 |
| 无数据库 | 模块无数据库依赖 |
| 无 Redis | Phase 2 纯内存模式 |
| beforeEach 重置 | 每个测试用例前重置状态（`beforeEach` 创建新实例或清空 `sentMessages`） |

### 8.2 WsManager mock (adapter.test.ts)

```typescript
const makeMockManager = (): WsManager => ({
  handleChangeEvent: vi.fn(),
} as unknown as WsManager);
```

**约束**: mock 只需实现 `handleChangeEvent`。使用 `as unknown as WsManager` 是适配器测试中唯一接受的不完整类型断言（mock 工厂模式）。

### 8.3 WsManager 真实 + sendToClient 捕获 (manager.test.ts)

```typescript
beforeEach(() => {
  sentMessages = [];
  manager = new WsManager({
    sendToClient: (clientId, message) => {
      sentMessages.push({ clientId, message });
    },
  });
});
```

**约束**: 使用真实 `WsManager` 实例，通过 `sendToClient` 回调捕获所有发送的消息以验证广播行为。

### 8.4 测试数据工厂

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

## 9. 未被覆盖的边界情况（记录用）

| 场景 | 理由 | 影响 |
|------|------|------|
| 并发订阅/取消订阅 | Phase 2 单进程同步操作，无竞态条件 | Phase 3+ 引入 Redis 后需补充 |
| WebSocket 协议层（close code、ping/pong） | 协议层处理在 core 包的 Fastify 集成中，不在本模块 | 由 core 包 E2E 测试覆盖 |
| 大量订阅（10000+ clients） | 当前 40 用例已覆盖功能正确性，性能测试非 Phase 2 目标 | Phase 3+ 压力测试 |

---

## 10. 运行测试

```bash
# 运行所有测试
pnpm --filter @audebase/websocket test

# 带覆盖率
pnpm --filter @audebase/websocket test:coverage

# watch 模式
pnpm --filter @audebase/websocket test:watch
```
