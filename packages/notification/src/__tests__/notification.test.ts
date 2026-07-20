import { describe, test, expect, beforeEach } from 'vitest'
import {
  NotificationManager,
  ProviderAlreadyRegisteredError,
  ProviderNotFoundError,
  type NotificationProvider,
  type NotificationRecipient,
  type NotificationTemplate,
  type NotificationResult,
} from '../index'

function makeRecipient(userId?: string, email?: string): NotificationRecipient {
  return { userId, email }
}

function makeTemplate(id: string, subject: string, body: string): NotificationTemplate {
  return { id, subject, body }
}

function makeProvider(name: string): NotificationProvider {
  return {
    name,
    send: async (
      _recipient: NotificationRecipient,
      _template: NotificationTemplate,
      _data: Record<string, unknown>,
    ): Promise<NotificationResult> => ({
      success: true,
      providerName: name,
      messageId: `msg-${Date.now()}`,
      sentAt: new Date(),
    }),
  }
}

function makeFailingProvider(name: string): NotificationProvider {
  return {
    name,
    send: async (): Promise<NotificationResult> => {
      throw new Error('SMS gateway down')
    },
  }
}

describe('NotificationManager', () => {
  let service: NotificationManager

  beforeEach(() => {
    service = new NotificationManager()
  })

  describe('registerProvider', () => {
    test('registers a provider by name', () => {
      const p = makeProvider('email')
      service.registerProvider(p)
      expect(service.getProviders()).toEqual(['email'])
    })

    test('throws on duplicate provider name', () => {
      service.registerProvider(makeProvider('email'))
      expect(() => service.registerProvider(makeProvider('email'))).toThrow(
        ProviderAlreadyRegisteredError,
      )
    })

    test('registers multiple providers with different names', () => {
      service.registerProvider(makeProvider('email'))
      service.registerProvider(makeProvider('inapp'))
      expect(service.getProviders()).toEqual(['email', 'inapp'])
    })
  })

  describe('send', () => {
    test('sends via registered provider', async () => {
      service.registerProvider(makeProvider('email'))
      const result = await service.send('email', makeRecipient('u1', 'u1@test.com'), makeTemplate('t1', 'Hi', 'Hello'))
      expect(result.success).toBe(true)
      expect(result.providerName).toBe('email')
    })

    test('throws ProviderNotFoundError for unregistered name', async () => {
      await expect(
        service.send('sms', makeRecipient('u1'), makeTemplate('t1', 'S', 'B')),
      ).rejects.toThrow(ProviderNotFoundError)
    })

    test('wraps provider errors with success: false (never throws on send failure)', async () => {
      service.registerProvider(makeFailingProvider('sms'))
      const result = await service.send('sms', makeRecipient('u1'), makeTemplate('t1', 'S', 'B'))
      expect(result.success).toBe(false)
      expect(result.error).toBe('SMS gateway down')
      expect(result.providerName).toBe('sms')
    })
  })

  describe('getProviders', () => {
    test('returns empty array for new service', () => {
      expect(service.getProviders()).toEqual([])
    })

    test('returns all registered provider names', () => {
      service.registerProvider(makeProvider('email'))
      service.registerProvider(makeProvider('inapp'))
      expect(service.getProviders()).toEqual(['email', 'inapp'])
    })
  })
})
