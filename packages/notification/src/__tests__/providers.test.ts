import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  EmailNotificationProvider,
  readSmtpConfigFromEnv,
  InAppNotificationProvider,
} from '../index.js'
import type { EmailTransporter } from '../providers/email.js'
import type { InAppStore } from '../providers/in-app.js'
import type { NotificationRecipient, NotificationTemplate } from '../types.js'
import type { SmtpConfig } from '../index.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEmailRecipient(email: string): NotificationRecipient {
  return { email }
}

function makeTemplate(overrides?: Partial<NotificationTemplate>): NotificationTemplate {
  return {
    id: 'test-template',
    subject: 'Test Subject',
    body: 'Hello {{name}}',
    variables: ['name'],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// EmailNotificationProvider
// ---------------------------------------------------------------------------

function createMockTransporter(): EmailTransporter & { sendMail: ReturnType<typeof vi.fn> } {
  const sendMail = vi.fn().mockResolvedValue({ messageId: 'msg-1' })
  return { sendMail }
}

describe('EmailNotificationProvider', () => {
  let transporter: ReturnType<typeof createMockTransporter>
  let provider: EmailNotificationProvider

  beforeEach(() => {
    transporter = createMockTransporter()
    provider = new EmailNotificationProvider(transporter, { from: 'test@audebase.local' })
  })

  test('has name "email"', () => {
    expect(provider.name).toBe('email')
  })

  test('send calls transporter.sendMail with correct options', async () => {
    // Arrange
    const recipient = makeEmailRecipient('user@audebase.local')
    const template = makeTemplate({ id: 'welcome', subject: 'Welcome!' })

    // Act
    const result = await provider.send(recipient, template, { name: 'Alice' })

    // Assert
    expect(result.success).toBe(true)
    expect(result.providerName).toBe('email')
    expect(transporter.sendMail).toHaveBeenCalledTimes(1)
    expect(transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'test@audebase.local',
        to: 'user@audebase.local',
        subject: '[AUDEBase] Welcome!',
      }),
    )
  })

  test('send returns failure when recipient has no email', async () => {
    // Arrange
    const recipient: NotificationRecipient = { userId: 'user-1' }
    const template = makeTemplate()

    // Act
    const result = await provider.send(recipient, template, {})

    // Assert
    expect(result.success).toBe(false)
    expect(result.error).toContain('Recipient email is required')
    expect(transporter.sendMail).not.toHaveBeenCalled()
  })

  test('send returns failure when transporter throws', async () => {
    // Arrange
    transporter.sendMail.mockRejectedValueOnce(new Error('SMTP connection refused'))
    const recipient = makeEmailRecipient('user@audebase.local')
    const template = makeTemplate()

    // Act
    const result = await provider.send(recipient, template, {})

    // Assert
    expect(result.success).toBe(false)
    expect(result.providerName).toBe('email')
    expect(result.error).toContain('Email send failed')
    expect(result.error).toContain('SMTP connection refused')
  })

  test('send respects html field in data', async () => {
    // Arrange
    const recipient = makeEmailRecipient('user@audebase.local')
    const template = makeTemplate()

    // Act
    await provider.send(recipient, template, { body: 'Plain text fallback', html: '<b>HTML</b>' })

    // Assert
    expect(transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Plain text fallback',
        html: '<b>HTML</b>',
      }),
    )
  })

  test('send uses data body as text when no body field', async () => {
    // Arrange
    const recipient = makeEmailRecipient('user@audebase.local')
    const template = makeTemplate()

    // Act
    await provider.send(recipient, template, { other: 'value' })

    // Assert
    expect(transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: JSON.stringify({ other: 'value' }, null, 2),
      }),
    )
  })
})

// ---------------------------------------------------------------------------
// readSmtpConfigFromEnv
// ---------------------------------------------------------------------------

describe('readSmtpConfigFromEnv', () => {
  const envBackup = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...envBackup }
  })

  afterEach(() => {
    process.env = { ...envBackup }
  })

  test('returns null when AUDE_SMTP_HOST is not set', () => {
    delete process.env.AUDE_SMTP_HOST
    expect(readSmtpConfigFromEnv()).toBeNull()
  })

  test('returns null when AUDE_SMTP_PORT is not set', () => {
    process.env.AUDE_SMTP_HOST = 'smtp.example.com'
    delete process.env.AUDE_SMTP_PORT
    expect(readSmtpConfigFromEnv()).toBeNull()
  })

  test('returns null when AUDE_SMTP_PORT is NaN', () => {
    process.env.AUDE_SMTP_HOST = 'smtp.example.com'
    process.env.AUDE_SMTP_PORT = 'not-a-number'
    expect(readSmtpConfigFromEnv()).toBeNull()
  })

  test('returns SmtpConfig with secure=true for port 465', () => {
    process.env.AUDE_SMTP_HOST = 'smtp.example.com'
    process.env.AUDE_SMTP_PORT = '465'
    process.env.AUDE_SMTP_USER = 'user'
    process.env.AUDE_SMTP_PASS = 'pass'

    const config = readSmtpConfigFromEnv()
    expect(config).not.toBeNull()
    expect(config!.host).toBe('smtp.example.com')
    expect(config!.port).toBe(465)
    expect(config!.secure).toBe(true)
    expect(config!.auth.user).toBe('user')
    expect(config!.auth.pass).toBe('pass')
  })

  test('returns SmtpConfig with secure=false for port 587', () => {
    process.env.AUDE_SMTP_HOST = 'smtp.example.com'
    process.env.AUDE_SMTP_PORT = '587'

    const config = readSmtpConfigFromEnv()
    expect(config).not.toBeNull()
    expect(config!.port).toBe(587)
    expect(config!.secure).toBe(false)
  })

  test('uses empty strings for missing user/pass', () => {
    process.env.AUDE_SMTP_HOST = 'smtp.example.com'
    process.env.AUDE_SMTP_PORT = '25'

    const config: SmtpConfig | null = readSmtpConfigFromEnv()
    expect(config).not.toBeNull()
    expect(config!.auth.user).toBe('')
    expect(config!.auth.pass).toBe('')
  })
})

// ---------------------------------------------------------------------------
// InAppNotificationProvider
// ---------------------------------------------------------------------------

function createMockStore(): InAppStore & { insert: ReturnType<typeof vi.fn> } {
  const insert = vi.fn().mockResolvedValue({ id: 'notif-1' })
  return { insert }
}

describe('InAppNotificationProvider', () => {
  let store: ReturnType<typeof createMockStore>
  let provider: InAppNotificationProvider

  beforeEach(() => {
    store = createMockStore()
    provider = new InAppNotificationProvider(store)
  })

  test('has name "in-app"', () => {
    expect(provider.name).toBe('in-app')
  })

  test('send inserts a row and returns success', async () => {
    // Arrange
    const recipient: NotificationRecipient = { userId: 'user-abc' }
    const template = makeTemplate({ id: 'task-assigned', subject: 'New Task' })

    // Act
    const result = await provider.send(recipient, template, {
      title: 'Custom Title',
      body: 'Task body',
      link: '/tasks/42',
    })

    // Assert
    expect(result.success).toBe(true)
    expect(result.providerName).toBe('in-app')
    expect(result.messageId).toBe('notif-1')
    expect(store.insert).toHaveBeenCalledTimes(1)
    expect(store.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: 'user-abc',
        template: 'task-assigned',
        title: 'Custom Title',
        body: 'Task body',
        link: '/tasks/42',
      }),
    )
  })

  test('send falls back to template.subject as title', async () => {
    // Arrange
    const recipient: NotificationRecipient = { email: 'user@audebase.local' }
    const template = makeTemplate()

    // Act
    await provider.send(recipient, template, {})

    // Assert
    expect(store.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Test Subject',
        body: null,
        link: null,
        recipient: 'user@audebase.local',
      }),
    )
  })

  test('send returns failure when store throws', async () => {
    // Arrange
    store.insert.mockRejectedValueOnce(new Error('DB connection lost'))
    const recipient: NotificationRecipient = { userId: 'user-1' }
    const template = makeTemplate()

    // Act
    const result = await provider.send(recipient, template, {})

    // Assert
    expect(result.success).toBe(false)
    expect(result.providerName).toBe('in-app')
    expect(result.error).toContain('In-app notification insert failed')
    expect(result.error).toContain('DB connection lost')
  })
})
