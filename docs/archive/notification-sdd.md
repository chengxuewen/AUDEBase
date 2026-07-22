# SDD: Notification Interface Module

**Module**: `@audebase/notification`
**Package Path**: `packages/notification/`
**Phase**: Phase 1b (#15)
**Status**: SDD Complete
**Decision References**: D1.14, architecture.md 通知系统, phase-planning.md #15

---

## 1. 概要

### 模块定位

Notification 模块为 AUDEBase 平台提供通知发送的抽象接口定义。作为横切关注点，允许插件声明通知需求而不依赖具体通知渠道实现。纯接口定义模块，不包含任何渠道实现。

### 职责边界

| 范围 | 说明 |
|------|------|
| **负责** | 通知抽象接口定义（`NotificationProvider`）、收件人/模板模型、Provider 注册与管理、manifest.yaml 通知声明解析 |
| **不负责** | Email 发送（Phase 2）、InApp 通知存储与展示（Phase 2）、Webhook 投递（Phase 2）、通知模板渲染、消息队列、重试策略 |

### 设计目标

1. **零渠道实现** - Phase 1b 仅定义接口契约，不引入任何邮件/短信/Webhook 依赖
2. **可插拔** - 通过 `NotificationProvider` 接口，Phase 2 可注册任意渠道实现
3. **插件友好** - 插件通过 manifest.yaml 声明通知需求，无需硬编码 Provider 引用
4. **标准化** - 统一的收件人、模板、结果模型，跨插件一致
5. **最小化** - 尽可能少的接口方法，降低实现成本

---

## 2. 接口定义

### NotificationRecipient

```typescript
interface NotificationRecipient {
  /** 系统用户 ID（用于 InApp 通知定位用户） */
  userId?: string
  /** Email 地址（用于 Email 渠道） */
  email?: string
  /** 手机号（用于短信渠道，Phase 2+） */
  phone?: string
  /** 额外元数据（渠道特定参数，如语言偏好、时区） */
  metadata?: Record<string, unknown>
}
```

### NotificationTemplate

```typescript
interface NotificationTemplate {
  /** 模板唯一标识 */
  id: string
  /** 主题行（Email 标题、InApp 标题） */
  subject: string
  /** 正文内容（支持模板变量占位符，如 `{{userName}}`） */
  body: string
  /** 模板变量名列表，用于校验 data 参数完整性 */
  variables?: string[]
}
```

### NotificationResult

```typescript
interface NotificationResult {
  /** 是否发送成功 */
  success: boolean
  /** 执行发送的 Provider 名称 */
  providerName: string
  /** 渠道侧消息 ID（如 Email 的 Message-ID），可用于追踪 */
  messageId?: string
  /** 失败时的错误描述 */
  error?: string
  /** 发送时间戳 */
  sentAt: Date
}
```

### NotificationProvider 抽象接口

```typescript
interface NotificationProvider {
  /** Provider 唯一名称（如 'email', 'inapp', 'webhook'） */
  readonly name: string

  /**
   * 发送通知。
   * @param recipient - 收件人信息
   * @param template - 通知模板
   * @param data - 模板变量填充数据
   * @returns 发送结果
   */
  send(
    recipient: NotificationRecipient,
    template: NotificationTemplate,
    data: Record<string, unknown>,
  ): Promise<NotificationResult>
}
```

### NotificationManager 类

```typescript
class NotificationManager {
  /**
   * 注册一个通知 Provider。
   * 同名 Provider 重复注册抛出 PROVIDER_ALREADY_REGISTERED 错误。
   */
  registerProvider(provider: NotificationProvider): void

  /**
   * 使用指定 Provider 发送通知。
   * @param providerName - Provider 名称
   * @param recipient - 收件人
   * @param template - 模板
   * @param data - 模板数据
   * @throws PROVIDER_NOT_FOUND 若 Provider 未注册
   */
  send(
    providerName: string,
    recipient: NotificationRecipient,
    template: NotificationTemplate,
    data: Record<string, unknown>,
  ): Promise<NotificationResult>

  /** 获取所有已注册的 Provider 名称列表 */
  getProviders(): string[]

  /**
   * 根据事件名称查找匹配的 Provider 列表。
   * 遍历所有插件的 manifest.yaml notifications 声明，返回匹配的 provider 名。
   */
  getProvidersForEvent(event: string): string[]
}
```

### manifest.yaml 通知声明

插件在 manifest.yaml 中声明对通知的需求：

```yaml
notifications:
  - event: 'order.created'
    template: 'order-created-email'
    provider: 'email'
  - event: 'order.shipped'
    template: 'order-shipped-email'
    provider: 'email'
  - event: 'order.cancelled'
    template: 'order-cancelled-inapp'
    provider: 'inapp'
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `event` | string | 是 | 事件名称，与 EventBus 事件名一致 |
| `template` | string | 是 | 模板 ID，对应 `NotificationTemplate.id` |
| `provider` | string | 是 | Provider 名称，对应 `NotificationProvider.name` |

### Public Exports (index.ts)

```typescript
export { NotificationManager } from './notification-manager.js'
export type { NotificationProvider } from './types.js'
export type { NotificationRecipient, NotificationTemplate, NotificationResult } from './types.js'
```

---

## 3. 生命周期

### 初始化

```
Core 启动
  -> new NotificationManager()
  -> 扫描所有已加载插件的 manifest.yaml notifications 声明
  -> 建立 event -> provider 映射表
  -> 插件可在 load() 阶段注册自定义 Provider
     plugin.load() {
       this.app.notification.registerProvider(new EmailProvider(...))
     }
```

### 通知发送流程

```
插件触发通知
  -> 通过 EventBus 发布事件（如 'order.created'）
  -> EventBus 消费者回调 NotificationManager
  -> NotificationManager.getProvidersForEvent('order.created')
  -> 对每个匹配的 Provider，调用 provider.send(recipient, template, data)
  -> 收集 NotificationResult 返回
```

### 关闭

无特殊关闭逻辑。NotificationManager 随 Core 进程退出自动释放。

---

## 4. 依赖关系

| 依赖 | 类型 | 用途 |
|------|------|------|
| `@audebase/shared-types` | workspace | `ErrorCode.NOTIFICATION_PROVIDER_NOT_FOUND` 等错误码 |

**无运行时通知渠道依赖**。不引入 nodemailer、WebSocket 或其他投递库。

### Phase 1b 预留接口

```typescript
// Phase 2: Email 渠道实现 (not implemented in Phase 1b)
class EmailProvider implements NotificationProvider {
  readonly name = 'email'
  constructor(private config: EmailConfig) {}
  async send(recipient: NotificationRecipient, template: NotificationTemplate, data: Record<string, unknown>): Promise<NotificationResult> {
    // 使用 nodemailer 发送
  }
}

// Phase 2: InApp 渠道实现
class InAppProvider implements NotificationProvider {
  readonly name = 'inapp'
  async send(recipient: NotificationRecipient, template: NotificationTemplate, data: Record<string, unknown>): Promise<NotificationResult> {
    // 写入数据库 notification 表，UI 轮询展示
  }
}

// Phase 2: Webhook 渠道实现
class WebhookProvider implements NotificationProvider {
  readonly name = 'webhook'
  constructor(private config: WebhookConfig) {}
  async send(recipient: NotificationRecipient, template: NotificationTemplate, data: Record<string, unknown>): Promise<NotificationResult> {
    // HTTP POST 到配置的 URL
  }
}
```

---

## 5. 错误码与错误处理

| 错误码 | 场景 | 恢复策略 |
|--------|------|----------|
| `NOTIFICATION_PROVIDER_NOT_FOUND` | `send()` 指定的 providerName 未注册 | 调用方检查 `getProviders()` 后重试 |
| `NOTIFICATION_PROVIDER_ALREADY_REGISTERED` | `registerProvider()` 注册同名 Provider | 使用不同名称注册，或先移除旧 Provider |
| `NOTIFICATION_SEND_FAILED` | Provider.send() 内部失败（如 SMTP 不可达） | 记录错误日志，返回 `success: false` 的 result |

### send 失败处理

Provider 内部发送失败不抛出异常，而是返回 `NotificationResult` 并标记 `success: false` 和 `error` 字段。NotificationManager 记录错误日志并继续处理其他 Provider。

```typescript
// 伪代码: NotificationManager.send()
async send(providerName: string, recipient: NotificationRecipient, template: NotificationTemplate, data: Record<string, unknown>): Promise<NotificationResult> {
  const provider = this.providers.get(providerName)
  if (!provider) {
    throw new AppError('NOTIFICATION_PROVIDER_NOT_FOUND', `Provider "${providerName}" not registered`)
  }
  try {
    return await provider.send(recipient, template, data)
  } catch (error: unknown) {
    logger.error('Notification send failed', { providerName, error })
    return {
      success: false,
      providerName,
      error: error instanceof Error ? error.message : 'Unknown error',
      sentAt: new Date(),
    }
  }
}
```

---

## 6. 安全考虑

### Provider 注册控制

- 仅 SYSTEM 分组的插件可注册 Provider（防止非信任插件注册恶意 Provider 劫持通知）
- 插件注册 Provider 需 Core 验证 manifest.yaml 权限声明

### 敏感信息泄露防护

- `NotificationResult.error` 仅返回通用错误消息，不暴露 SMTP 凭据、API Key 等敏感信息
- 详细错误（含堆栈）由 Core 日志系统记录，不返回给调用方

### 模板注入防护

- 模板变量通过 `{{variableName}}` 占位符替换，不执行任意代码
- `data` 参数在传入 Provider 前不做 eval 或动态执行
- Phase 2 渠道实现不得使用 `eval` 或 `new Function` 处理模板

### 通知风暴防护

- Phase 1b 无内置限流（依赖 Rate Limit 模块或渠道自行实现）
- Phase 2 建议 EmailProvider 实现发送频率限制，防止误触发导致邮件风暴

---

## 7. Mock 约束

### NotificationManager 测试的 mock 约束

| 约束 | 说明 |
|------|------|
| Provider mock | 实现 `NotificationProvider` 接口的 mock 类，`send()` 返回可控的 `NotificationResult` |
| 同步语义 | Provider.send() 是异步方法，测试使用 `async/await` 或 `await expect()` |
| 注册验证 | 测试 `registerProvider()` 后 `getProviders()` 返回正确列表 |
| 重复注册 | 测试重复注册同名 Provider 抛出 `PROVIDER_ALREADY_REGISTERED` |
| 未注册检查 | 测试未注册 Provider 的 `send()` 抛出 `PROVIDER_NOT_FOUND` |
| 事件映射 | 测试 `getProvidersForEvent()` 根据 manifest notifications 声明返回正确 provider 列表 |

### MockProvider 示例

```typescript
// 测试用的 MockProvider
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
      messageId: `mock-${Date.now()}`,
      sentAt: new Date(),
    }
  }
}

// 测试用例
test('send with registered provider returns success', async () => {
  // Arrange
  const manager = new NotificationManager()
  manager.registerProvider(new MockProvider('email'))
  const recipient: NotificationRecipient = { email: 'test@example.com' }
  const template: NotificationTemplate = { id: 'test', subject: 'Test', body: 'Hello {{name}}' }

  // Act
  const result = await manager.send('email', recipient, template, { name: 'Alice' })

  // Assert
  expect(result.success).toBe(true)
  expect(result.providerName).toBe('email')
})

test('send with unregistered provider throws', async () => {
  // Arrange
  const manager = new NotificationManager()

  // Act & Assert
  await expect(
    manager.send('nonexistent', {} as NotificationRecipient, {} as NotificationTemplate, {}),
  ).rejects.toThrow('NOTIFICATION_PROVIDER_NOT_FOUND')
})
```

---

## 8. 变更记录

| 日期 | 变更 |
|------|------|
| 2026-07-17 | 初始 SDD 创建 - Phase 1b 纯接口定义，无渠道实现 |