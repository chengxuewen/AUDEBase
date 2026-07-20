/**
 * @audebase/notification - InAppNotificationProvider
 *
 * Concrete provider that stores notifications as in-app records (D1.14).
 * Accepts any store that satisfies the InAppStore interface.
 * Phase 2: Drizzle-backed store with notification_in_app table.
 */

import type { NotificationProvider, NotificationRecipient, NotificationTemplate, NotificationResult } from '../types.js'

/** Row shape for an in-app notification insert. */
export interface InAppNotificationRow {
  recipient: string
  template: string
  title: string
  body: string | null
  link: string | null
  data: Record<string, unknown>
}

/**
 * Minimal store interface for persisting in-app notifications.
 * Accepts any drizzle-compatible db instance or in-memory implementation.
 */
export interface InAppStore {
  insert(row: InAppNotificationRow): Promise<{ id: string }>
}

/**
 * Delivers notifications as in-app records stored via an InAppStore.
 *
 * The store is injected — callers provide their own persistence layer
 * (e.g. Drizzle pgTable, in-memory array for testing).
 */
export class InAppNotificationProvider implements NotificationProvider {
  readonly name = 'in-app'

  constructor(private readonly store: InAppStore) {}

  async send(
    recipient: NotificationRecipient,
    template: NotificationTemplate,
    data: Record<string, unknown>,
  ): Promise<NotificationResult> {
    try {
      const row: InAppNotificationRow = {
        recipient: recipient.userId ?? recipient.email ?? 'unknown',
        template: template.id,
        title: typeof data.title === 'string' ? data.title : template.subject,
        body: typeof data.body === 'string' ? data.body : null,
        link: typeof data.link === 'string' ? data.link : null,
        data,
      }
      const result = await this.store.insert(row)
      return {
        success: true,
        providerName: this.name,
        messageId: result.id,
        sentAt: new Date(),
      }
    } catch (error: unknown) {
      return {
        success: false,
        providerName: this.name,
        error: `In-app notification insert failed for template "${template.id}": ${error instanceof Error ? error.message : 'unknown error'}`,
        sentAt: new Date(),
      }
    }
  }
}
