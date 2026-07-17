/**
 * @audebase/notification - Public API
 *
 * Pure interface module (D1.14). No channel implementations.
 * Phase 2: EmailProvider, InAppProvider, WebhookProvider.
 */

export { NotificationManager, ProviderAlreadyRegisteredError, ProviderNotFoundError } from './notification-manager.js'
export type { NotificationProvider, NotificationRecipient, NotificationTemplate, NotificationResult } from './types.js'
