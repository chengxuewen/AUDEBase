# EventBus TDD 测试策略

> **模块**: `@audebase/event-bus`
> **依赖**: `zod`, `@audebase/shared-types`
> **更新日期**: 2026-07-17
> **参考**: D1.9 (事件总线)、D1.3 (插件通信)、event-bus-sdd.md、plugin-communication.md §六

---

## 1. 测试策略概述

EventBus 模块为 AUDEBase 平台提供同进程事件发布/订阅能力。测试覆盖内存 Map + EventEmitter 实现的核心路径: 精确/通配符订阅、payload Zod 校验、handler 错误隔离、partition-local 广播。无外部依赖，使用真实 EventBus 实例。

| 测试类型 | 最低用例数 | 数据库 |
|---------|:---:|------|
| 单元测试 | 12+ | 无（纯内存） |
| 集成测试 | 4+ | 无（纯内存实例） |
| 契约测试 | 2+ | 无 |
| E2E 测试 | 0 | 不适用（Phase 1b 无 UI） |

---

## 2. 模块结构

```
packages/event-bus/
├── src/
│   ├── index.ts              # 导出 EventBus, matchSubject, types
│   ├── event-bus.ts          # EventBus 类实现
│   ├── wildcard.ts           # matchSubject 通配符匹配
│   ├── types.ts              # 类型定义
│   ├── errors.ts             # EventBusValidationError
│   ├── __tests__/
│   │   ├── unit/
│   │   │   ├── event-bus.test.ts
│   │   │   └── wildcard.test.ts
│   │   └── integration/
│   │       └── event-bus.integration.test.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## 3. 单元测试

### 3.1 EventBus 核心功能单元测试

```
测试文件: packages/event-bus/src/__tests__/unit/event-bus.test.ts
```

```typescript
import { describe, test, expect, beforeEach, vi } from 'vitest'
import { EventBus } from '../../event-bus'

describe('EventBus.publish / subscribe', () => {
  let bus: EventBus

  beforeEach(() => {
    bus = new EventBus({ partition: 'test' })
  })

  afterEach(() => {
    bus.clear()
  })

  test('精确匹配订阅: 发布 order.created 后 handler 被调用', () => {
    // Arrange
    const handler = vi.fn()
    bus.subscribe('order.created', handler)

    // Act
    const count = bus.publish('order.created', { orderId: '123' })

    // Assert
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith({ orderId: '123' })
    expect(count).toBe(1)
  })

  test('通配符订阅: order.* 匹配 order.created 和 order.updated', () => {
    // Arrange
    const handler = vi.fn()
    bus.subscribe('order.*', handler)

    // Act
    bus.publish('order.created', { id: 1 })
    bus.publish('order.updated', { id: 2 })

    // Assert
    expect(handler).toHaveBeenCalledTimes(2)
  })

  test('通配符不匹配: order.* 不匹配 user.created', () => {
    // Arrange
    const handler = vi.fn()
    bus.subscribe('order.*', handler)

    // Act
    bus.publish('user.created', { userId: 'u1' })

    // Assert
    expect(handler).not.toHaveBeenCalled()
  })

  test('通配符 * 匹配全部主题', () => {
    // Arrange
    const handler = vi.fn()
    bus.subscribe('*', handler)

    // Act
    bus.publish('order.created', {})
    bus.publish('user.updated', {})

    // Assert
    expect(handler).toHaveBeenCalledTimes(2)
  })

  test('通配符不跨越 dot 段: order.* 不匹配 order.created.confirmed', () => {
    // Arrange
    const handler = vi.fn()
    bus.subscribe('order.*', handler)

    // Act
    bus.publish('order.created.confirmed', { id: 1 })

    // Assert
    expect(handler).not.toHaveBeenCalled()
  })

  test('多个订阅者同一主题: 全部被调用', () => {
    // Arrange
    const handler1 = vi.fn()
    const handler2 = vi.fn()
    bus.subscribe('order.created', handler1)
    bus.subscribe('order.created', handler2)

    // Act
    const count = bus.publish('order.created', {})

    // Assert
    expect(handler1).toHaveBeenCalledTimes(1)
    expect(handler2).toHaveBeenCalledTimes(1)
    expect(count).toBe(2)
  })

  test('publish 返回 handler 调用计数', () => {
    // Arrange
    bus.subscribe('a', vi.fn())
    bus.subscribe('a', vi.fn())
    bus.subscribe('b', vi.fn())

    // Act
    const count = bus.publish('a', {})

    // Assert
    expect(count).toBe(2)
  })

  test('无订阅者: publish 返回 0', () => {
    // Act
    const count = bus.publish('no.subscribers', {})

    // Assert
    expect(count).toBe(0)
  })
})

describe('EventBus.subscribeOnce', () => {
  let bus: EventBus

  beforeEach(() => {
    bus = new EventBus({ partition: 'test' })
  })

  afterEach(() => {
    bus.clear()
  })

  test('subscribeOnce 的 handler 只被调用一次', () => {
    // Arrange
    const handler = vi.fn()
    bus.subscribeOnce('order.created', handler)

    // Act
    bus.publish('order.created', {})
    bus.publish('order.created', {})

    // Assert
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

describe('EventBus.unsubscribe / unsubscribeAll', () => {
  let bus: EventBus

  beforeEach(() => {
    bus = new EventBus({ partition: 'test' })
  })

  afterEach(() => {
    bus.clear()
  })

  test('unsubscribe 后 handler 不再被调用', () => {
    // Arrange
    const handler = vi.fn()
    const sub = bus.subscribe('order.created', handler)
    bus.unsubscribe(sub)

    // Act
    bus.publish('order.created', {})

    // Assert
    expect(handler).not.toHaveBeenCalled()
  })

  test('unsubscribeAll 移除指定主题所有 handler', () => {
    // Arrange
    const handler1 = vi.fn()
    const handler2 = vi.fn()
    bus.subscribe('order.created', handler1)
    bus.subscribe('order.created', handler2)
    bus.unsubscribeAll('order.created')

    // Act
    bus.publish('order.created', {})

    // Assert
    expect(handler1).not.toHaveBeenCalled()
    expect(handler2).not.toHaveBeenCalled()
  })

  test('unsubscribeAll 不影响其他主题', () => {
    // Arrange
    const handlerA = vi.fn()
    const handlerB = vi.fn()
    bus.subscribe('order.created', handlerA)
    bus.subscribe('user.created', handlerB)
    bus.unsubscribeAll('order.created')

    // Act
    bus.publish('order.created', {})
    bus.publish('user.created', {})

    // Assert
    expect(handlerA).not.toHaveBeenCalled()
    expect(handlerB).toHaveBeenCalledTimes(1)
  })
})

describe('EventBus.clear', () => {
  let bus: EventBus

  beforeEach(() => {
    bus = new EventBus({ partition: 'test' })
  })

  test('clear 后所有订阅被移除', () => {
    // Arrange
    bus.subscribe('a', vi.fn())
    bus.subscribe('b', vi.fn())
    bus.clear()

    // Act
    const countA = bus.publish('a', {})
    const countB = bus.publish('b', {})

    // Assert
    expect(countA).toBe(0)
    expect(countB).toBe(0)
  })

  test('clear 后 publish 返回 0', () => {
    // Arrange
    bus.subscribe('test', vi.fn())
    bus.clear()

    // Act
    const count = bus.publish('test', {})

    // Assert
    expect(count).toBe(0)
  })
})

describe('EventBus.registerSchema 与 payload 验证', () => {
  let bus: EventBus
  const orderSchema = { orderId: (val: unknown) => typeof val === 'string' }

  beforeEach(() => {
    bus = new EventBus({ partition: 'test', validatePayload: true })
  })

  afterEach(() => {
    bus.clear()
  })

  test('合法 payload 通过验证，handler 被调用', () => {
    // Arrange
    const handler = vi.fn()
    bus.subscribe('order.created', handler)
    bus.registerSchema('order.created', { safeParse: () => ({ success: true, data: { orderId: 'abc' } }) } as any)

    // Act
    bus.publish('order.created', { orderId: 'abc' })

    // Assert
    expect(handler).toHaveBeenCalledTimes(1)
  })

  test('非法 payload 抛 EventBusValidationError，handler 不被调用', () => {
    // Arrange
    const handler = vi.fn()
    bus.subscribe('order.created', handler)
    bus.registerSchema('order.created', { safeParse: () => ({ success: false, error: { issues: [] } }) } as any)

    // Act & Assert
    expect(() => bus.publish('order.created', { foo: 'bar' })).toThrow()
    expect(handler).not.toHaveBeenCalled()
  })

  test('未注册 schema 的主题不校验 payload', () => {
    // Arrange
    const handler = vi.fn()
    bus.subscribe('order.created', handler)

    // Act
    expect(() => bus.publish('order.created', { anything: 'goes' })).not.toThrow()
    expect(handler).toHaveBeenCalledTimes(1)
  })

  test('validatePayload: false 时跳过所有校验', () => {
    // Arrange
    const noValidateBus = new EventBus({ partition: 'test', validatePayload: false })
    const handler = vi.fn()
    noValidateBus.subscribe('order.created', handler)
    noValidateBus.registerSchema('order.created', { safeParse: () => ({ success: false, error: { issues: [] } }) } as any)

    // Act
    expect(() => noValidateBus.publish('order.created', { bad: 'data' })).not.toThrow()
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

describe('EventBus handler 错误隔离', () => {
  let bus: EventBus

  beforeEach(() => {
    bus = new EventBus({ partition: 'test' })
  })

  afterEach(() => {
    bus.clear()
  })

  test('handler 抛异常不影响其他 handler 和发布者', () => {
    // Arrange
    const logger = { error: vi.fn() }
    const goodHandler = vi.fn()
    const badHandler = vi.fn().mockImplementation(() => { throw new Error('handler crash') })
    bus.subscribe('order.created', badHandler)
    bus.subscribe('order.created', goodHandler)

    // Act
    let count = 0
    expect(() => {
      count = bus.publish('order.created', {})
    }).not.toThrow()

    // Assert
    expect(goodHandler).toHaveBeenCalledTimes(1)
    expect(count).toBe(2)
  })

  test('async handler 异常不影响发布者', async () => {
    // Arrange
    const handler = vi.fn().mockRejectedValue(new Error('async error'))
    bus.subscribe('order.created', handler)

    // Act — publish 不 await handler，所以不抛异常
    expect(() => bus.publish('order.created', {})).not.toThrow()
  })
})

describe('EventBus partition 隔离', () => {
  test('不同 partition 的 EventBus 实例互不影响', () => {
    // Arrange
    const busA = new EventBus({ partition: 'oa' })
    const busB = new EventBus({ partition: 'erp' })
    const handlerA = vi.fn()
    const handlerB = vi.fn()
    busA.subscribe('order.created', handlerA)
    busB.subscribe('order.created', handlerB)

    // Act
    busA.publish('order.created', {})

    // Assert
    expect(handlerA).toHaveBeenCalledTimes(1)
    expect(handlerB).not.toHaveBeenCalled()

    busA.clear()
    busB.clear()
  })
})

describe('EventBus 构造函数选项', () => {
  test('partition 字段通过 options 设置', () => {
    // Arrange
    const bus = new EventBus({ partition: 'erp' })

    // Act & Assert
    expect(bus).toBeDefined()
    bus.clear()
  })
})
```

### 3.2 matchSubject 通配符匹配单元测试

```
测试文件: packages/event-bus/src/__tests__/unit/wildcard.test.ts
```

```typescript
import { describe, test, expect } from 'vitest'
import { matchSubject } from '../../wildcard'

describe('matchSubject', () => {
  test('精确匹配: 无通配符的 pattern 与 subject 相同', () => {
    // Arrange
    const pattern = 'order.created'

    // Act
    const result = matchSubject(pattern, 'order.created')

    // Assert
    expect(result).toBe(true)
  })

  test('精确匹配: pattern 与 subject 不同返回 false', () => {
    // Arrange
    const pattern = 'order.created'

    // Act
    const result = matchSubject(pattern, 'order.updated')

    // Assert
    expect(result).toBe(false)
  })

  test('单段通配符: order.* 匹配 order.created', () => {
    // Arrange
    const pattern = 'order.*'

    // Act
    const result = matchSubject(pattern, 'order.created')

    // Assert
    expect(result).toBe(true)
  })

  test('单段通配符: order.* 不匹配多段 order.created.confirmed', () => {
    // Arrange
    const pattern = 'order.*'

    // Act
    const result = matchSubject(pattern, 'order.created.confirmed')

    // Assert
    expect(result).toBe(false)
  })

  test('通配符 * 匹配所有', () => {
    // Arrange
    const pattern = '*'

    // Act
    expect(matchSubject(pattern, 'order.created')).toBe(true)
    expect(matchSubject(pattern, 'user.updated')).toBe(true)
    expect(matchSubject(pattern, '')).toBe(true)
  })

  test('空 pattern 仅匹配空 subject', () => {
    // Act
    expect(matchSubject('', '')).toBe(true)
    expect(matchSubject('', 'anything')).toBe(false)
  })
})
```

---

## 4. 集成测试

```
测试文件: packages/event-bus/src/__tests__/integration/event-bus.integration.test.ts
```

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { EventBus } from '../../event-bus'
import { z } from 'zod'

describe('EventBus 集成测试', () => {
  let bus: EventBus

  beforeEach(() => {
    bus = new EventBus({ partition: 'integration-test', validatePayload: true })
  })

  afterEach(() => {
    bus.clear()
  })

  test('完整流程: 注册 schema → 订阅 → 发布 → handler 收到校验后的 payload', () => {
    // Arrange
    const orderSchema = z.object({
      orderId: z.string(),
      amount: z.number().positive(),
    })
    const handler = vi.fn()
    bus.registerSchema('order.created', orderSchema)
    bus.subscribe('order.created', handler)

    // Act
    const payload = { orderId: 'ord-001', amount: 99.99 }
    const count = bus.publish('order.created', payload)

    // Assert
    expect(handler).toHaveBeenCalledWith(payload)
    expect(count).toBe(1)
  })

  test('多订阅者 + 通配符混合场景', () => {
    // Arrange
    const orderHandler = vi.fn()
    const allHandler = vi.fn()
    bus.subscribe('order.*', orderHandler)
    bus.subscribe('*', allHandler)

    // Act
    bus.publish('order.created', {})
    bus.publish('user.created', {})

    // Assert
    expect(orderHandler).toHaveBeenCalledTimes(1)
    expect(allHandler).toHaveBeenCalledTimes(2)
  })

  test('subscribeOnce 后在 publish 中自动移除', () => {
    // Arrange
    const handler = vi.fn()
    bus.subscribeOnce('once.event', handler)

    // Act
    const count1 = bus.publish('once.event', {})
    const count2 = bus.publish('once.event', {})

    // Assert
    expect(handler).toHaveBeenCalledTimes(1)
    expect(count1).toBe(1)
    expect(count2).toBe(0) // 第二次 publish 时 handler 已移除
  })

  test('handler 错误不影响后续 publish 调用', () => {
    // Arrange
    const badHandler = vi.fn().mockImplementation(() => { throw new Error('oops') })
    const goodHandler = vi.fn()
    bus.subscribe('topic', badHandler)
    bus.subscribe('topic', goodHandler)

    // Act
    bus.publish('topic', { first: true })
    bus.publish('topic', { second: true })

    // Assert
    expect(goodHandler).toHaveBeenCalledTimes(2)
  })
})
```

---

## 5. 契约测试

### 5.1 EventBus 接口契约测试

```
测试文件: packages/event-bus/src/__tests__/contracts/event-bus.contract.test.ts
```

```typescript
import { describe, test, expect } from 'vitest'
import { EventBus } from '../../event-bus'
import { matchSubject } from '../../wildcard'

describe('EventBus 接口契约', () => {
  test('EventBus 实例满足 EventBusOptions 契约: partition 必需', () => {
    // Arrange & Act
    const bus = new EventBus({ partition: 'contract-test' })

    // Assert
    expect(bus).toBeInstanceOf(EventBus)
    expect(bus.publish).toBeInstanceOf(Function)
    expect(bus.subscribe).toBeInstanceOf(Function)
    expect(bus.subscribeOnce).toBeInstanceOf(Function)
    expect(bus.unsubscribe).toBeInstanceOf(Function)
    expect(bus.unsubscribeAll).toBeInstanceOf(Function)
    expect(bus.clear).toBeInstanceOf(Function)
    expect(bus.registerSchema).toBeInstanceOf(Function)

    bus.clear()
  })

  test('EventSubscription 包含 subject, handler, once 字段', () => {
    // Arrange
    const bus = new EventBus({ partition: 'contract-test' })
    const handler = vi.fn()

    // Act
    const sub = bus.subscribe('test.subject', handler)

    // Assert
    expect(sub).toHaveProperty('subject')
    expect(sub).toHaveProperty('handler')
    expect(sub.handler).toBe(handler)
    expect(sub).toHaveProperty('once')

    bus.clear()
  })

  test('matchSubject 符合通配符契约', () => {
    // Assert — 从 SDD 通配符规则表验证
    expect(matchSubject('order.*', 'order.created')).toBe(true)
    expect(matchSubject('order.*', 'order.updated')).toBe(true)
    expect(matchSubject('order.*', 'order')).toBe(false)
    expect(matchSubject('order.*', 'order.created.confirmed')).toBe(false)
    expect(matchSubject('*', 'anything')).toBe(true)
    expect(matchSubject('order.created', 'order.created')).toBe(true)
    expect(matchSubject('order.created', 'order.updated')).toBe(false)
  })
})
```

---

## 6. E2E 测试

EventBus 为纯基础设施模块，无用户界面。Phase 1b 不涉及 E2E 测试。

| 用例 | 描述 | 状态 |
|------|------|:----:|
| — | 无 UI 交互，无需 Playwright | 🔲 |

---

## 7. 种子数据

EventBus 为纯内存模块，不涉及数据库操作。无需种子数据。

```typescript
// EventBus 无数据库依赖，seed 不适用。
// 每个测试用例通过 beforeEach 创建独立的 EventBus 实例。
```

---

## 8. Mock 策略

| 依赖 | 单元测试 | 集成测试 |
|------|---------|---------|
| 外部依赖 | 无（纯内存实现） | 无（纯内存实现） |
| Zod schema | 真实 `z.object(...)` 或 mock `{ safeParse }` | 真实 `z.object(...)` |
| Logger | `vi.fn()` 模拟 logger.error | 真实 console 或 vi.fn() |
| EventBus | 真实 `EventBus` 实例 | 真实 `EventBus` 实例 |

**核心原则**: EventBus 无外部依赖（无 Redis、无数据库），测试使用真实 EventBus 实例，不 mock EventBus 本身。

---

## 9. 覆盖率目标

| 指标 | 目标 | 关键路径 |
|------|:---:|------|
| 行覆盖率 | **85%+** |  |
| 分支覆盖率 | **80%+** | matchSubject 通配符分支、publish 错误路径、schema 校验分支 |
| 函数覆盖率 | **90%+** | EventBus 全部 7 个方法 + matchSubject |
| 单元测试 | 12+ | 精确/通配符/once/错误隔离/校验/clear/partition |
| 集成测试 | 4+ | 完整流程、多订阅者、subscribeOnce、handler 异常 |

---

## 10. CI 集成

```yaml
event-bus-test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - run: pnpm install --frozen-lockfile
    - run: pnpm --filter @audebase/event-bus test:unit
    - run: pnpm --filter @audebase/event-bus test:integration
```

**说明**: EventBus 不依赖 PostgreSQL 或 Redis，CI 无需额外服务。

---

## 11. 用例汇总

| 测试层 | 用例数 |
|--------|:---:|
| 单元 - event-bus | 20 |
| 单元 - wildcard | 7 |
| 集成 - event-bus.integration | 4 |
| 契约 - event-bus.contract | 3 |
| **合计** | **34** |

---

## 12. 参考

- [event-bus-sdd.md](event-bus-sdd.md) — 接口定义、生命周期、mock 约束
- [plugin-communication.md](plugin-communication.md) §六 — 事件总线设计
- [../../.agents/memorys/decisions.md](../../.agents/memorys/decisions.md) — D1.9 事件总线、D1.3 插件通信

> **上游 TDD 参考**: [shared-types-tdd.md](shared-types-tdd.md) — 公共类型; [plugin-framework-tdd.md](plugin-framework-tdd.md) — 插件生命周期集成

---

## 13. 扩展场景: 无订阅者 + 边缘情况

### 13.1 无订阅者与空状态

```typescript
describe('无订阅者 / 空状态', () => {
  let bus: EventBus

  beforeEach(() => {
    bus = new EventBus({ partition: 'edge-test' })
  })

  afterEach(() => {
    bus.clear()
  })

  test('无订阅者时 publish 返回 0', () => {
    // Act
    const count = bus.publish('any.subject', { data: 1 })

    // Assert
    expect(count).toBe(0)
  })

  test('clear 后订阅已移除的 handler 不再响应', () => {
    // Arrange
    bus.subscribe('test', vi.fn())
    bus.clear()

    // Act
    const count = bus.publish('test', {})

    // Assert
    expect(count).toBe(0)
  })

  test('unsubscribeAll 不存在的主题不报错', () => {
    // Act & Assert
    expect(() => bus.unsubscribeAll('nonexistent')).not.toThrow()
  })

  test('unsubscribe 无效的订阅句柄不报错', () => {
    // Act & Assert
    expect(() => bus.unsubscribe({ subject: 'ghost', handler: vi.fn() })).not.toThrow()
  })
})
```

### 13.2 重复订阅

```typescript
describe('重复订阅', () => {
  let bus: EventBus

  beforeEach(() => {
    bus = new EventBus({ partition: 'dedup-test' })
  })

  afterEach(() => {
    bus.clear()
  })

  test('同一个 handler 订阅两次，publish 调用两次', () => {
    // Arrange
    const handler = vi.fn()
    bus.subscribe('order.created', handler)
    bus.subscribe('order.created', handler)

    // Act
    const count = bus.publish('order.created', {})

    // Assert
    expect(handler).toHaveBeenCalledTimes(2)
    expect(count).toBe(2)
  })
})
```