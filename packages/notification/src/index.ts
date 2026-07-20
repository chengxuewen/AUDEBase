/**
 * @audebase/notification - Public API
 *
 * Notification provider interface + concrete providers (D1.14).
 * Phase 2: WebhookProvider.
 */

export { NotificationManager, ProviderAlreadyRegisteredError, ProviderNotFoundError } from './notification-manager.js'
export type { NotificationProvider, NotificationRecipient, NotificationTemplate, NotificationResult } from './types.js'

// Concrete providers
export { EmailNotificationProvider, readSmtpConfigFromEnv } from './providers/email.js'
export type { EmailTransporter, SmtpConfig } from './providers/email.js'
export { InAppNotificationProvider } from './providers/in-app.js'
export type { InAppStore, InAppNotificationRow } from './providers/in-app.js'
