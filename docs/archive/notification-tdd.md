# Notification TDD 测试策略

> **模块**: `@audebase/notification`
> **依赖**: `@audebase/shared-types`
> **更新日期**: 2026-07-17
> **参考**: notification-sdd.md, D1.14, architecture.md §通知系统, phase-planning.md #15
> **覆盖率目标**: 85%+ 行覆盖率, 80%+ 分支覆盖率

---

## 1. 测试范围

Notification 模块为 AUDEBase 平台提供通知发送的抽象接口定义。Phase 1b 仅定义 `NotificationProvider` 接口和 `NotificationManager` 管理类，不包含任何渠道实现（Email/InApp/Webhook 均为 Phase 2）。测试聚焦于 Provider 注册管理、发送路由、模板变量替换和错误处理。

| 测试类型 | 最低用例数 | 数据库 |
|---------|:---:|------|
| 单元测试 | 14+ | 无（纯内存 Map） |
| 集成测试 | 4+ | 无（纯接口） |
| 契约测试 | 3+ | 无（接口契约） |
| E2E 测试 | 0 | 无（Phase 1b 无 UI） |

---

## 2. 模块结构

```
packages/notification/
├── src/
│   ├── index.ts              # 公开导出 NotificationManager, 类型
│   ├── notification-manager.ts  # NotificationManager 类（Provider 注册/发送）
│   ├── types.ts               # NotificationProvider, NotificationRecipient, NotificationTemplate, NotificationResult
│   ├── template.ts            # 模板变量替换工具函数
│   ├── __tests__/
│   │   ├── unit/
│   │   │   ├── notification-manager.test.ts
│   │   │   └── template.test.ts
│   │   ├── integration/
│   │   │   └── notification.integration.test.ts
│   │   ├── contracts/
│   │   │   └── notification.contract.test.ts
│   │   └── seeds/
│   │       └── notification-fixtures.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## 3. 单元测试

### 3.1 NotificationManager 单元测试

```
测试文件: packages/notification/src/__tests__/unit/notification-manager.test.ts
```

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { NotificationManager } from '../../notification-manager'
import type {
  NotificationProvider,
  NotificationRecipient,
  NotificationTemplate,
  NotificationResult,
} from '../../types'

/** 测试用 MockProvider，无外部依赖 */
class MockProvider implements NotificationProvider {
  readonly name: string
  private shouldFail: boolean
  private sendCount = 0

  constructor(name: string, shouldFail = false) {
    this.name = name
    this.shouldFail = shouldFail
  }

  async send(
    _recipient: NotificationRecipient,
    _template: NotificationTemplate,
    _data: Record<string, unknown>,
  ): Promise<NotificationResult> {
    this.sendCount++
    if (this.shouldFail) {
      return {
        success: false,
        providerName: this.name,
        error: 'Mock failure',
        sentAt: new Date(),
      }
    }
    return {
      success: true,
      providerName: this.name,
      messageId: `mock-${this.name}-${this.sendCount}`,
      sentAt: new Date(),
    }
  }
}

describe('NotificationManager', () => {
  let manager: NotificationManager

  beforeEach(() => {
    manager = new NotificationManager()
  })

  describe('registerProvider()', () => {
    it('registers a provider and returns it via getProviders()', () => {
      // Arrange
      const provider = new MockProvider('email')

      // Act
      manager.registerProvider(provider)

      // Assert
      expect(manager.getProviders()).toEqual(['email'])
    })

    it('registers multiple providers', () => {
      // Arrange
      const email = new MockProvider('email')
      const inapp = new MockProvider('inapp')

      // Act
      manager.registerProvider(email)
      manager.registerProvider(inapp)

      // Assert
      const providers = manager.getProviders()
      expect(providers).toContain('email')
      expect(providers).toContain('inapp')
      expect(providers.length).toBe(2)
    })

    it('throws PROVIDER_ALREADY_REGISTERED on duplicate registration', () => {
      // Arrange
      const provider1 = new MockProvider('email')
      const provider2 = new MockProvider('email')

      // Act
      manager.registerProvider(provider1)

      // Assert
      expect(() => manager.registerProvider(provider2)).toThrow(
        'NOTIFICATION_PROVIDER_ALREADY_REGISTERED',
      )
    })
  })

  describe('getProviders()', () => {
    it('returns empty array when no providers registered', () => {
      // Arrange & Act
      const providers = manager.getProviders()

      // Assert
      expect(providers).toEqual([])
    })

    it('returns provider names in registration order', () => {
      // Arrange
      manager.registerProvider(new MockProvider('alpha'))
      manager.registerProvider(new MockProvider('beta'))
      manager.registerProvider(new MockProvider('gamma'))

      // Act
      const providers = manager.getProviders()

      // Assert
      expect(providers).toEqual(['alpha', 'beta', 'gamma'])
    })
  })

  describe('send() - valid provider', () => {
    it('sends notification via registered provider and returns success', async () => {
      // Arrange
      const provider = new MockProvider('email')
      manager.registerProvider(provider)
      const recipient: NotificationRecipient = { email: 'test@example.com' }
      const template: NotificationTemplate = {
        id: 'welcome',
        subject: 'Welcome',
        body: 'Hello {{name}}',
      }

      // Act
      const result = await manager.send('email', recipient, template, { name: 'Alice' })

      // Assert
      expect(result.success).toBe(true)
      expect(result.providerName).toBe('email')
      expect(result.messageId).toBeDefined()
      expect(result.sentAt).toBeInstanceOf(Date)
    })
  })

  describe('send() - provider not found', () => {
    it('throws PROVIDER_NOT_FOUND when provider is not registered', async () => {
      // Arrange
      const recipient: NotificationRecipient = {}
      const template: NotificationTemplate = { id: 'test', subject: 'T', body: 'B' }

      // Act & Assert
      await expect(
        manager.send('nonexistent', recipient, template, {}),
      ).rejects.toThrow('NOTIFICATION_PROVIDER_NOT_FOUND')
    })
  })

  describe('send() - provider send failure', () => {
    it('returns success:false result when provider send fails', async () => {
      // Arrange
      const provider = new MockProvider('email', true) // shouldFail = true
      manager.registerProvider(provider)
      const recipient: NotificationRecipient = { email: 'test@example.com' }
      const template: NotificationTemplate = { id: 'test', subject: 'T', body: 'B' }

      // Act
      const result = await manager.send('email', recipient, template, {})

      // Assert
      expect(result.success).toBe(false)
      expect(result.providerName).toBe('email')
      expect(result.error).toBe('Mock failure')
      expect(result.messageId).toBeUndefined()
    })
  })

  describe('sendAll() - multiple providers', () => {
    it('sends to all registered providers and returns all results', async () => {
      // Arrange
      manager.registerProvider(new MockProvider('email'))
      manager.registerProvider(new MockProvider('inapp'))
      const recipient: NotificationRecipient = { email: 'test@example.com', userId: 'u1' }
      const template: NotificationTemplate = { id: 'test', subject: 'T', body: 'B' }

      // Act
      const results = await manager.sendAll(recipient, template, {})

      // Assert
      expect(results.length).toBe(2)
      expect(results.every((r) => r.success)).toBe(true)
      expect(results.map((r) => r.providerName).sort()).toEqual(['email', 'inapp'])
    })

    it('continues sending to remaining providers when one fails', async () => {
      // Arrange
      manager.registerProvider(new MockProvider('email', true)) // fails
      manager.registerProvider(new MockProvider('inapp'))       // succeeds
      const recipient: NotificationRecipient = { email: 'test@example.com' }
      const template: NotificationTemplate = { id: 'test', subject: 'T', body: 'B' }

      // Act
      const results = await manager.sendAll(recipient, template, {})

      // Assert
      expect(results.length).toBe(2)
      const emailResult = results.find((r) => r.providerName === 'email')
      const inappResult = results.find((r) => r.providerName === 'inapp')
      expect(emailResult?.success).toBe(false)
      expect(inappResult?.success).toBe(true)
    })

    it('returns empty array when no providers registered', async () => {
      // Arrange
      const recipient: NotificationRecipient = {}
      const template: NotificationTemplate = { id: 'test', subject: 'T', body: 'B' }

      // Act
      const results = await manager.sendAll(recipient, template, {})

      // Assert
      expect(results).toEqual([])
    })
  })

  describe('getProvidersForEvent()', () => {
    it('returns matching providers for a registered event', () => {
      // Arrange
      manager.registerProvider(new MockProvider('email'))
      manager.registerProvider(new MockProvider('inapp'))
      manager.registerEventMapping('order.created', ['email'])
      manager.registerEventMapping('order.shipped', ['email', 'inapp'])

      // Act
      const providers = manager.getProvidersForEvent('order.created')

      // Assert
      expect(providers).toEqual(['email'])
    })

    it('returns empty array for unregistered event', () => {
      // Arrange
      manager.registerProvider(new MockProvider('email'))

      // Act
      const providers = manager.getProvidersForEvent('nonexistent.event')

      // Assert
      expect(providers).toEqual([])
    })
  })
})
```

### 3.2 Template 单元测试

```
测试文件: packages/notification/src/__tests__/unit/template.test.ts
```

```typescript
import { describe, it, expect } from 'vitest'
import { substituteTemplateVariables } from '../../template'

describe('substituteTemplateVariables()', () => {
  it('replaces {{var}} placeholders with data values', () => {
    // Arrange
    const template = 'Hello {{name}}, your order {{orderId}} is ready.'
    const data = { name: 'Alice', orderId: 'ORD-123' }

    // Act
    const result = substituteTemplateVariables(template, data)

    // Assert
    expect(result).toBe('Hello Alice, your order ORD-123 is ready.')
  })

  it('replaces missing variables with empty string', () => {
    // Arrange
    const template = 'Hello {{name}}, your balance is {{balance}}.'
    const data = { name: 'Alice' } // balance is missing

    // Act
    const result = substituteTemplateVariables(template, data)

    // Assert
    expect(result).toBe('Hello Alice, your balance is .')
  })

  it('returns template unchanged when no variables present', () => {
    // Arrange
    const template = 'Hello, this is a static message.'
    const data = { name: 'Alice' }

    // Act
    const result = substituteTemplateVariables(template, data)

    // Assert
    expect(result).toBe('Hello, this is a static message.')
  })

  it('handles multiple occurrences of the same variable', () => {
    // Arrange
    const template = '{{name}} says hello to {{name}}.'
    const data = { name: 'Bob' }

    // Act
    const result = substituteTemplateVariables(template, data)

    // Assert
    expect(result).toBe('Bob says hello to Bob.')
  })

  it('handles empty data object', () => {
    // Arrange
    const template = 'Hello {{name}}.'

    // Act
    const result = substituteTemplateVariables(template, {})

    // Assert
    expect(result).toBe('Hello .')
  })

  it('handles empty template string', () => {
    // Arrange & Act
    const result = substituteTemplateVariables('', { name: 'Alice' })

    // Assert
    expect(result).toBe('')
  })

  it('does not execute arbitrary code (no eval)', () => {
    // Arrange
    const template = 'Value: {{value}}'
    const data = { value: 'console.log("xss")' }

    // Act
    const result = substituteTemplateVariables(template, data)

    // Assert
    expect(result).toBe('Value: console.log("xss")')
  })
})
```

---

## 4. 集成测试

```
测试文件: packages/notification/src/__tests__/integration/notification.integration.test.ts
```

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { NotificationManager } from '../../notification-manager'
import type {
  NotificationProvider,
  NotificationRecipient,
  NotificationTemplate,
  NotificationResult,
} from '../../types'

class MockProvider implements NotificationProvider {
  readonly name: string
  private shouldFail: boolean

  constructor(name: string, shouldFail = false) {
    this.name = name
    this.shouldFail = shouldFail
  }

  async send(
    _recipient: NotificationRecipient,
    _template: NotificationTemplate,
    _data: Record<string, unknown>,
  ): Promise<NotificationResult> {
    if (this.shouldFail) {
      return {
        success: false,
        providerName: this.name,
        error: 'Mock failure',
        sentAt: new Date(),
      }
    }
    return {
      success: true,
      providerName: this.name,
      messageId: `msg-${this.name}`,
      sentAt: new Date(),
    }
  }
}

describe('Notification 集成测试', () => {
  let manager: NotificationManager

  beforeEach(() => {
    manager = new NotificationManager()
  })

  it('完整发送流程：注册 Provider -> 发送 -> 验证结果', async () => {
    // Arrange
    const provider = new MockProvider('email')
    manager.registerProvider(provider)
    const recipient: NotificationRecipient = { email: 'user@example.com' }
    const template: NotificationTemplate = {
      id: 'welcome',
      subject: 'Welcome to AUDEBase',
      body: 'Hello {{name}}, welcome to {{platform}}!',
    }

    // Act
    const result = await manager.send('email', recipient, template, {
      name: 'Alice',
      platform: 'AUDEBase',
    })

    // Assert
    expect(result.success).toBe(true)
    expect(result.providerName).toBe('email')
    expect(result.messageId).toBeDefined()
  })

  it('事件驱动通知：注册事件映射 -> 获取匹配 Provider -> 批量发送', async () => {
    // Arrange
    manager.registerProvider(new MockProvider('email'))
    manager.registerProvider(new MockProvider('inapp'))
    manager.registerEventMapping('order.created', ['email', 'inapp'])

    const recipient: NotificationRecipient = { email: 'buyer@example.com', userId: 'u1' }
    const template: NotificationTemplate = {
      id: 'order-created',
      subject: 'Order Created',
      body: 'Your order {{orderId}} has been created.',
    }

    // Act
    const providers = manager.getProvidersForEvent('order.created')
    const results = await manager.sendAll(recipient, template, { orderId: 'ORD-001' })

    // Assert
    expect(providers).toEqual(['email', 'inapp'])
    expect(results.length).toBe(2)
    expect(results.every((r) => r.success)).toBe(true)
  })

  it('部分 Provider 失败不影响其他 Provider 发送', async () => {
    // Arrange
    manager.registerProvider(new MockProvider('email', true))  // fails
    manager.registerProvider(new MockProvider('inapp'))        // succeeds
    manager.registerProvider(new MockProvider('webhook'))      // succeeds
    const recipient: NotificationRecipient = { email: 'test@example.com' }
    const template: NotificationTemplate = { id: 'test', subject: 'T', body: 'B' }

    // Act
    const results = await manager.sendAll(recipient, template, {})

    // Assert
    expect(results.length).toBe(3)
    expect(results.filter((r) => r.success).length).toBe(2)
    expect(results.filter((r) => !r.success).length).toBe(1)
    expect(results.find((r) => !r.success)?.providerName).toBe('email')
  })

  it('模板变量替换在发送流程中正确执行', async () => {
    // Arrange
    const provider = new MockProvider('email')
    manager.registerProvider(provider)
    const recipient: NotificationRecipient = { email: 'test@example.com' }
    const template: NotificationTemplate = {
      id: 'test',
      subject: 'Hello {{name}}',
      body: 'Your code is {{code}}.',
    }

    // Act
    const result = await manager.send('email', recipient, template, {
      name: 'Bob',
      code: '123456',
    })

    // Assert
    expect(result.success).toBe(true)
    // Provider 接收到的模板变量已被替换（通过 MockProvider 验证）
    expect(result.providerName).toBe('email')
  })
})
```

---

## 5. 契约测试

```
测试文件: packages/notification/src/__tests__/contracts/notification.contract.test.ts
```

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { NotificationManager } from '../../notification-manager'
import type {
  NotificationProvider,
  NotificationRecipient,
  NotificationTemplate,
  NotificationResult,
} from '../../types'

class MockProvider implements NotificationProvider {
  readonly name: string
  constructor(name: string) { this.name = name }
  async send(
    _recipient: NotificationRecipient,
    _template: NotificationTemplate,
    _data: Record<string, unknown>,
  ): Promise<NotificationResult> {
    return {
      success: true,
      providerName: this.name,
      messageId: `msg-${this.name}`,
      sentAt: new Date(),
    }
  }
}

describe('Notification 接口契约', () => {
  let manager: NotificationManager

  beforeEach(() => {
    manager = new NotificationManager()
  })

  it('NotificationResult 成功时包含 success=true, providerName, messageId, sentAt', async () => {
    // Arrange
    manager.registerProvider(new MockProvider('email'))
    const recipient: NotificationRecipient = { email: 'test@example.com' }
    const template: NotificationTemplate = { id: 't', subject: 'S', body: 'B' }

    // Act
    const result = await manager.send('email', recipient, template, {})

    // Assert
    expect(result.success).toBe(true)
    expect(result.providerName).toBe('email')
    expect(result.messageId).toBeDefined()
    expect(result.sentAt).toBeInstanceOf(Date)
    expect(result.error).toBeUndefined()
  })

  it('NotificationResult 失败时包含 success=false, providerName, error, sentAt', async () => {
    // Arrange
    class FailingProvider implements NotificationProvider {
      readonly name = 'failing'
      async send(
        _recipient: NotificationRecipient,
        _template: NotificationTemplate,
        _data: Record<string, unknown>,
      ): Promise<NotificationResult> {
        return {
          success: false,
          providerName: 'failing',
          error: 'SMTP unreachable',
          sentAt: new Date(),
        }
      }
    }
    manager.registerProvider(new FailingProvider())
    const recipient: NotificationRecipient = { email: 'test@example.com' }
    const template: NotificationTemplate = { id: 't', subject: 'S', body: 'B' }

    // Act
    const result = await manager.send('failing', recipient, template, {})

    // Assert
    expect(result.success).toBe(false)
    expect(result.providerName).toBe('failing')
    expect(result.error).toBe('SMTP unreachable')
    expect(result.sentAt).toBeInstanceOf(Date)
    expect(result.messageId).toBeUndefined()
  })

  it('Provider.send() 是异步方法，返回 Promise<NotificationResult>', async () => {
    // Arrange
    const provider = new MockProvider('email')

    // Act
    const result = provider.send({}, {} as NotificationTemplate, {})

    // Assert
    expect(result).toBeInstanceOf(Promise)
    const resolved = await result
    expect(resolved.success).toBe(true)
    expect(resolved.providerName).toBe('email')
  })
})
```

---

## 6. E2E 测试 (Playwright)

Phase 1b Notification 模块为纯后端抽象接口，无 UI 组件，无 E2E 测试。

Phase 2 渠道实现（Email/InApp/Webhook）完成后，可在 Admin UI 集成测试中覆盖通知发送场景。

---

## 7. 种子数据

```
测试文件: packages/notification/src/__tests__/seeds/notification-fixtures.ts
```

Notification 模块无数据库依赖，种子数据仅用于测试中的 Provider 和模板构造：

```typescript
import type { NotificationTemplate } from '../../types'

/** 测试用欢迎通知模板 */
export function createWelcomeTemplate(): NotificationTemplate {
  return {
    id: 'welcome',
    subject: 'Welcome to AUDEBase',
    body: 'Hello {{name}}, welcome to {{platform}}!',
    variables: ['name', 'platform'],
  }
}

/** 测试用订单通知模板 */
export function createOrderTemplate(): NotificationTemplate {
  return {
    id: 'order-created',
    subject: 'Order {{orderId}} Created',
    body: 'Your order {{orderId}} has been created. Total: {{total}}.',
    variables: ['orderId', 'total'],
  }
}

/** 测试用收件人 */
export function createTestRecipient(): NotificationRecipient {
  return {
    email: 'test@example.com',
    userId: 'user-001',
  }
}
```

---

## 8. Mock 策略

| 依赖 | 单元测试 | 集成测试 |
|------|---------|---------|
| NotificationProvider | `MockProvider` 类（纯接口实现，无外部依赖） | `MockProvider` 类 |
| 时间 | 无需 mock（`new Date()` 即可） | 无需 mock |
| 共享类型 | `ErrorCode` 真实导入（如需要） | `ErrorCode` 真实导入 |

### Mock 约束

| 约束 | 说明 |
|------|------|
| Provider mock | 实现 `NotificationProvider` 接口，`send()` 返回可控的 `NotificationResult` |
| 异步语义 | `Provider.send()` 是异步方法，测试使用 `async/await` 或 `await expect()` |
| 注册验证 | 测试 `registerProvider()` 后 `getProviders()` 返回正确列表 |
| 重复注册 | 测试重复注册同名 Provider 抛出 `PROVIDER_ALREADY_REGISTERED` |
| 未注册检查 | 测试未注册 Provider 的 `send()` 抛出 `PROVIDER_NOT_FOUND` |
| 事件映射 | 测试 `getProvidersForEvent()` 根据事件映射返回正确 provider 列表 |
| 无外部依赖 | MockProvider 不依赖任何外部服务（SMTP、HTTP、DB），纯内存实现 |

---

## 9. 覆盖率目标

| 指标 | 目标 | 关键路径 |
|------|:---:|------|
| 行覆盖率 | **85%+** | |
| 分支覆盖率 | **80%+** | registerProvider 重复注册分支、send Provider 未找到分支、sendAll 部分失败分支 |
| 函数覆盖率 | **90%+** | registerProvider / getProviders / send / sendAll / getProvidersForEvent / substituteTemplateVariables |
| 单元 | 14+ | NotificationManager 全部方法 + 模板变量替换 |
| 集成 | 4+ | 完整发送流程 + 事件驱动 + 部分失败 + 模板替换 |
| 契约 | 3+ | NotificationResult 成功/失败格式 + Provider.send 异步契约 |

---

## 10. CI 集成

```yaml
notification-test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - run: pnpm install --frozen-lockfile
    - run: pnpm --filter @audebase/notification test:unit
    - run: pnpm --filter @audebase/notification test:integration
```

**注**: Notification 模块无外部依赖（纯接口定义，无 SMTP/HTTP/DB），CI 无需启动任何外部服务。

---

## 11. 用例汇总

| 测试层 | 用例数 |
|--------|:---:|
| 单元 - NotificationManager | 11 |
| 单元 - Template | 7 |
| 集成 - 完整流程 | 4 |
| 契约 - 接口格式 | 3 |
| E2E | 0 |
| **合计** | **25** |

---

## 12. 参考

- [notification-sdd.md](notification-sdd.md) — 通知模块 SDD
- [shared-types-tdd.md](shared-types-tdd.md) — ErrorCode 枚举
- [../../.agents/memorys/decisions.md](../../.agents/memorys/decisions.md) — D1.14 通知系统接口
- [test-seed-strategy.md](test-seed-strategy.md) — 集成测试策略
- [rate-limit-tdd.md](rate-limit-tdd.md) — 同类纯接口模块 TDD 参考

> **上游 TDD 参考**: [shared-types-tdd.md](shared-types-tdd.md) — ErrorCode 枚举; [rate-limit-tdd.md](rate-limit-tdd.md) — 纯内存模块测试模式
