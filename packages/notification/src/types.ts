/**
 * @audebase/notification - Type definitions
 *
 * Pure interface module (D1.14). No channel implementations.
 */

/** Recipient descriptor - channel-agnostic addressing. */
export interface NotificationRecipient {
  /** System user ID (for InApp delivery) */
  userId?: string
  /** Email address (for Email channel) */
  email?: string
  /** Phone number (for SMS channel, Phase 2+) */
  phone?: string
  /** Extra channel-specific metadata (language preference, timezone, etc.) */
  metadata?: Record<string, unknown>
}

/** Notification template with optional variable placeholders. */
export interface NotificationTemplate {
  /** Unique template identifier */
  id: string
  /** Subject line (Email subject, InApp title) */
  subject: string
  /** Body content (supports {{variableName}} placeholders) */
  body: string
  /** Expected variable names for data completeness validation */
  variables?: string[]
}

/** Result of a single send operation. */
export interface NotificationResult {
  /** Whether the send succeeded */
  success: boolean
  /** Name of the provider that attempted the send */
  providerName: string
  /** Channel-side message ID for tracking (present on success) */
  messageId?: string
  /** Error description (present on failure) */
  error?: string
  /** Send timestamp */
  sentAt: Date
}

/**
 * Abstract notification provider interface.
 * Phase 2 implementations: EmailProvider, InAppProvider, WebhookProvider.
 */
export interface NotificationProvider {
  /** Provider unique name (e.g. 'email', 'inapp', 'webhook') */
  readonly name: string

  /**
   * Send a notification.
   * @param recipient - Recipient info
   * @param template - Notification template
   * @param data - Template variable values
   * @returns Send result (success or failure — never throws)
   */
  send(
    recipient: NotificationRecipient,
    template: NotificationTemplate,
    data: Record<string, unknown>,
  ): Promise<NotificationResult>
}
