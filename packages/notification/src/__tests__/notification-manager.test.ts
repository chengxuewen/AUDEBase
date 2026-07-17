/**
 * @audebase/notification - NotificationManager unit tests
 *
 * AAA pattern. Each test creates a fresh manager.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  NotificationManager,
  ProviderAlreadyRegisteredError,
  ProviderNotFoundError,
} from '../notification-manager.js'
import type {
  NotificationProvider,
  NotificationRecipient,
  NotificationTemplate,
  NotificationResult,
} from '../types.js'

// --- Mock Provider ---

class MockNotificationProvider implements NotificationProvider {
  readonly name: string
  shouldFail = false
  sent: Array<{
    recipient: NotificationRecipient
    template: NotificationTemplate
    data: Record<string, unknown>
  }> = []

  constructor(name: string, shouldFail = false) {
    this.name = name
    this.shouldFail = shouldFail
  }

  async send(
    recipient: NotificationRecipient,
    template: NotificationTemplate,
    data: Record<string, unknown>,
  ): Promise<NotificationResult> {
    if (this.shouldFail) {
      return {
        success: false,
        providerName: this.name,
        error: 'Mock failure',
        sentAt: new Date(),
      }
    }
    this.sent.push({ recipient, template, data })
    return {
      success: true,
      providerName: this.name,
      messageId: `mock-${Date.now()}`,
      sentAt: new Date(),
    }
  }
}

// --- Tests ---

describe('NotificationManager', () => {
  let manager: NotificationManager

  beforeEach(() => {
    manager = new NotificationManager()
  })

  // --- Provider Registration ---

  describe('provider registration', () => {
    it('registers a provider and it appears in getProviders', () => {
      // Arrange
      const provider = new MockNotificationProvider('email')

      // Act
      manager.registerProvider(provider)

      // Assert
      expect(manager.getProviders()).toEqual(['email'])
    })

    it('unregisters a provider and it is removed from getProviders', () => {
      // Arrange
      manager.registerProvider(new MockNotificationProvider('email'))

      // Act
      manager.unregisterProvider('email')

      // Assert
      expect(manager.getProviders()).toEqual([])
    })

    it('unregister is a no-op for a non-existent provider', () => {
      // Arrange
      // (nothing registered)

      // Act
      manager.unregisterProvider('nonexistent')

      // Assert
      expect(manager.getProviders()).toEqual([])
    })

    it('throws ProviderAlreadyRegisteredError on duplicate name', () => {
      // Arrange
      manager.registerProvider(new MockNotificationProvider('email'))

      // Act & Assert
      expect(() => manager.registerProvider(new MockNotificationProvider('email'))).toThrow(
        ProviderAlreadyRegisteredError,
      )
      expect(() => manager.registerProvider(new MockNotificationProvider('email'))).toThrow(
        'Notification provider already registered: email',
      )
    })

    it('registers multiple providers and all appear in getProviders', () => {
      // Arrange
      manager.registerProvider(new MockNotificationProvider('email'))
      manager.registerProvider(new MockNotificationProvider('inapp'))
      manager.registerProvider(new MockNotificationProvider('webhook'))

      // Act
      const providers = manager.getProviders()

      // Assert
      expect(providers).toHaveLength(3)
      expect(providers).toContain('email')
      expect(providers).toContain('inapp')
      expect(providers).toContain('webhook')
    })
  })

  // --- Send via single provider ---

  describe('send', () => {
    it('sends via a registered provider and returns success result', async () => {
      // Arrange
      const provider = new MockNotificationProvider('email')
      manager.registerProvider(provider)
      const recipient: NotificationRecipient = { email: 'test@example.com' }
      const template: NotificationTemplate = { id: 't1', subject: 'Hello', body: 'World' }

      // Act
      const result = await manager.send('email', recipient, template, {})

      // Assert
      expect(result.success).toBe(true)
      expect(result.providerName).toBe('email')
      expect(result.messageId).toBeDefined()
      expect(result.sentAt).toBeInstanceOf(Date)
      expect(provider.sent).toHaveLength(1)
    })

    it('throws ProviderNotFoundError for unregistered provider', async () => {
      // Arrange
      const recipient: NotificationRecipient = { email: 'test@example.com' }
      const template: NotificationTemplate = { id: 't1', subject: 'Hi', body: 'Body' }

      // Act & Assert
      await expect(manager.send('nonexistent', recipient, template, {})).rejects.toThrow(
        ProviderNotFoundError,
      )
      await expect(manager.send('nonexistent', recipient, template, {})).rejects.toThrow(
        'Notification provider not found: nonexistent',
      )
    })

    it('substitutes template variables in subject and body', async () => {
      // Arrange
      const provider = new MockNotificationProvider('email')
      manager.registerProvider(provider)
      const recipient: NotificationRecipient = { email: 'test@example.com' }
      const template: NotificationTemplate = {
        id: 't1',
        subject: 'Hello {{userName}}',
        body: 'Welcome, {{userName}}! Your order {{orderId}} is ready.',
      }

      // Act
      await manager.send('email', recipient, template, { userName: 'Alice', orderId: '12345' })

      // Assert
      expect(provider.sent).toHaveLength(1)
      const sentTemplate = provider.sent[0]!.template
      expect(sentTemplate.subject).toBe('Hello Alice')
      expect(sentTemplate.body).toBe('Welcome, Alice! Your order 12345 is ready.')
    })

    it('replaces missing variables with empty string', async () => {
      // Arrange
      const provider = new MockNotificationProvider('email')
      manager.registerProvider(provider)
      const recipient: NotificationRecipient = { email: 'test@example.com' }
      const template: NotificationTemplate = {
        id: 't1',
        subject: 'Hello {{name}}',
        body: 'Code: {{code}}',
      }

      // Act
      await manager.send('email', recipient, template, { name: 'Bob' })

      // Assert
      const sentTemplate = provider.sent[0]!.template
      expect(sentTemplate.subject).toBe('Hello Bob')
      expect(sentTemplate.body).toBe('Code: ')
    })

    it('sends template as-is when data is empty and no placeholders', async () => {
      // Arrange
      const provider = new MockNotificationProvider('email')
      manager.registerProvider(provider)
      const recipient: NotificationRecipient = { email: 'test@example.com' }
      const template: NotificationTemplate = {
        id: 't1',
        subject: 'Static Subject',
        body: 'Static body content',
      }

      // Act
      await manager.send('email', recipient, template)

      // Assert
      const sentTemplate = provider.sent[0]!.template
      expect(sentTemplate.subject).toBe('Static Subject')
      expect(sentTemplate.body).toBe('Static body content')
    })

    it('returns NotificationResult with success:false when provider fails', async () => {
      // Arrange
      const provider = new MockNotificationProvider('email', true)
      manager.registerProvider(provider)
      const recipient: NotificationRecipient = { email: 'test@example.com' }
      const template: NotificationTemplate = { id: 't1', subject: 'Hi', body: 'Body' }

      // Act
      const result = await manager.send('email', recipient, template, {})

      // Assert
      expect(result.success).toBe(false)
      expect(result.providerName).toBe('email')
      expect(result.error).toBe('Mock failure')
      expect(result.sentAt).toBeInstanceOf(Date)
    })

    it('catches provider exceptions and returns failure result', async () => {
      // Arrange
      const throwingProvider: NotificationProvider = {
        name: 'throwing',
        async send(): Promise<NotificationResult> {
          throw new Error('SMTP connection refused')
        },
      }
      manager.registerProvider(throwingProvider)
      const recipient: NotificationRecipient = { email: 'test@example.com' }
      const template: NotificationTemplate = { id: 't1', subject: 'Hi', body: 'Body' }

      // Act
      const result = await manager.send('throwing', recipient, template, {})

      // Assert
      expect(result.success).toBe(false)
      expect(result.providerName).toBe('throwing')
      expect(result.error).toBe('SMTP connection refused')
    })

    it('catches non-Error throws and returns generic message', async () => {
      // Arrange
      const throwingProvider: NotificationProvider = {
        name: 'throwing',
        async send(): Promise<NotificationResult> {
          throw 'string error'
        },
      }
      manager.registerProvider(throwingProvider)
      const recipient: NotificationRecipient = { email: 'test@example.com' }
      const template: NotificationTemplate = { id: 't1', subject: 'Hi', body: 'Body' }

      // Act
      const result = await manager.send('throwing', recipient, template, {})

      // Assert
      expect(result.success).toBe(false)
      expect(result.error).toBe('Unknown error')
    })

    it('passes data object to provider alongside resolved template', async () => {
      // Arrange
      const provider = new MockNotificationProvider('email')
      manager.registerProvider(provider)
      const recipient: NotificationRecipient = { email: 'test@example.com' }
      const template: NotificationTemplate = { id: 't1', subject: '{{name}}', body: 'Body' }
      const data = { name: 'Alice', extra: true }

      // Act
      await manager.send('email', recipient, template, data)

      // Assert
      expect(provider.sent[0]!.data).toEqual(data)
    })
  })

  // --- SendAll (fan-out) ---

  describe('sendAll', () => {
    it('sends to all registered providers and returns array of results', async () => {
      // Arrange
      manager.registerProvider(new MockNotificationProvider('email'))
      manager.registerProvider(new MockNotificationProvider('inapp'))
      const recipient: NotificationRecipient = { userId: 'u1' }
      const template: NotificationTemplate = { id: 't1', subject: 'Hi', body: 'Body' }

      // Act
      const results = await manager.sendAll(recipient, template, {})

      // Assert
      expect(results).toHaveLength(2)
      expect(results.every((r) => r.success)).toBe(true)
      const providerNames = results.map((r) => r.providerName)
      expect(providerNames).toContain('email')
      expect(providerNames).toContain('inapp')
    })

    it('returns empty array when no providers registered', async () => {
      // Arrange
      const recipient: NotificationRecipient = { userId: 'u1' }
      const template: NotificationTemplate = { id: 't1', subject: 'Hi', body: 'Body' }

      // Act
      const results = await manager.sendAll(recipient, template, {})

      // Assert
      expect(results).toEqual([])
    })

    it('returns results for all providers even when one fails', async () => {
      // Arrange
      manager.registerProvider(new MockNotificationProvider('email'))
      manager.registerProvider(new MockNotificationProvider('inapp', true))
      manager.registerProvider(new MockNotificationProvider('webhook'))
      const recipient: NotificationRecipient = { userId: 'u1' }
      const template: NotificationTemplate = { id: 't1', subject: 'Hi', body: 'Body' }

      // Act
      const results = await manager.sendAll(recipient, template, {})

      // Assert
      expect(results).toHaveLength(3)
      const emailResult = results.find((r) => r.providerName === 'email')
      const inappResult = results.find((r) => r.providerName === 'inapp')
      const webhookResult = results.find((r) => r.providerName === 'webhook')
      expect(emailResult?.success).toBe(true)
      expect(inappResult?.success).toBe(false)
      expect(inappResult?.error).toBe('Mock failure')
      expect(webhookResult?.success).toBe(true)
    })

    it('substitutes template variables before sending to each provider', async () => {
      // Arrange
      const emailProvider = new MockNotificationProvider('email')
      const inappProvider = new MockNotificationProvider('inapp')
      manager.registerProvider(emailProvider)
      manager.registerProvider(inappProvider)
      const recipient: NotificationRecipient = { userId: 'u1' }
      const template: NotificationTemplate = {
        id: 't1',
        subject: 'Order {{orderId}}',
        body: 'Hi {{name}}, order {{orderId}} shipped.',
      }

      // Act
      await manager.sendAll(recipient, template, { orderId: '42', name: 'Alice' })

      // Assert
      for (const p of [emailProvider, inappProvider]) {
        expect(p.sent[0]!.template.subject).toBe('Order 42')
        expect(p.sent[0]!.template.body).toBe('Hi Alice, order 42 shipped.')
      }
    })
  })
})
