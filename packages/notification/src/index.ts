/**
 * Notification system interfaces and service.
 * Phase 1b: abstract provider interface + concrete providers (D1.14).
 * Phase 2+: Email, InApp, Webhook concrete providers.
 */

/**
 * A notification provider handles delivery for a specific channel.
 * Concrete implementations (Email, InApp, Webhook) come in Phase 2.
 */
export interface NotificationProvider {
  /** Deliver a notification through this channel. */
  send(recipient: string, template: string, data: Record<string, unknown>): Promise<void>;

  /** Return the channels this provider handles. */
  getChannels(): string[];
}

/** Error thrown by NotificationService. */
export class NotificationError extends Error {
  constructor(
    message: string,
    public readonly code: "CHANNEL_NOT_FOUND" | "PROVIDER_EXISTS" | "SEND_FAILED",
  ) {
    super(message);
    this.name = "NotificationError";
  }
}

/**
 * Central notification service that routes messages to registered providers.
 * Channel-based routing: `send("email", ...)` → EmailProvider.
 */
export class NotificationService {
  private readonly providers = new Map<string, NotificationProvider>();

  /**
   * Register a provider for one or more channels.
   * Throws if any channel already has a provider.
   */
  registerProvider(provider: NotificationProvider): void {
    const channels = provider.getChannels();
    // Must be called synchronously during bootstrap — channels are static per provider.

    for (const channel of channels) {
      if (this.providers.has(channel)) {
        throw new NotificationError(
          `Channel "${channel}" already has a registered provider`,
          "PROVIDER_EXISTS",
        );
      }
      this.providers.set(channel, provider);
    }
  }

  /**
   * Send a notification through the named channel.
   * Throws if the channel is not registered.
   */
  async send(
    channel: string,
    recipient: string,
    template: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const provider = this.providers.get(channel);
    if (!provider) {
      throw new NotificationError(
        `No provider registered for channel "${channel}"`,
        "CHANNEL_NOT_FOUND",
      );
    }

    try {
      await provider.send(recipient, template, data);
    } catch (error: unknown) {
      throw new NotificationError(
        `Failed to send notification via ${channel}: ${error instanceof Error ? error.message : "unknown error"}`,
        "SEND_FAILED",
      );
    }
  }

  /** List all registered channel names. */
  listChannels(): string[] {
    return Array.from(this.providers.keys());
  }
}

// Re-export concrete providers
export { EmailNotificationProvider, readSmtpConfigFromEnv } from "./providers/email";
export type { EmailTransporter, SmtpConfig } from "./providers/email";
export { InAppNotificationProvider } from "./providers/in-app";
export type { InAppStore } from "./providers/in-app";
