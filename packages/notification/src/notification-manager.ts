/**
 * @audebase/notification - NotificationManager
 *
 * Manages provider registration and notification dispatch (D1.14).
 * Pure orchestration — no channel implementations.
 */

import type { NotificationProvider, NotificationRecipient, NotificationTemplate, NotificationResult } from './types.js'

/** Thrown when registerProvider() is called with an already-registered name. */
export class ProviderAlreadyRegisteredError extends Error {
  constructor(public readonly providerName: string) {
    super(`Notification provider already registered: ${providerName}`)
    this.name = 'ProviderAlreadyRegisteredError'
    Object.setPrototypeOf(this, ProviderAlreadyRegisteredError.prototype)
  }
}

/** Thrown when send() is called with a provider name that is not registered. */
export class ProviderNotFoundError extends Error {
  constructor(public readonly providerName: string) {
    super(`Notification provider not found: ${providerName}`)
    this.name = 'ProviderNotFoundError'
    Object.setPrototypeOf(this, ProviderNotFoundError.prototype)
  }
}

export class NotificationManager {
  private readonly providers = new Map<string, NotificationProvider>()

  /**
   * Register a notification provider.
   * @throws {ProviderAlreadyRegisteredError} if a provider with the same name exists
   */
  registerProvider(provider: NotificationProvider): void {
    if (this.providers.has(provider.name)) {
      throw new ProviderAlreadyRegisteredError(provider.name)
    }
    this.providers.set(provider.name, provider)
  }

  /** Remove a registered provider by name. No-op if not found. */
  unregisterProvider(name: string): void {
    this.providers.delete(name)
  }

  /** List all registered provider names. */
  getProviders(): string[] {
    return [...this.providers.keys()]
  }

  /**
   * Send a notification via a specific provider.
   * @throws {ProviderNotFoundError} if providerName is not registered
   * Provider internal failures return NotificationResult with success: false (never throws).
   */
  async send(
    providerName: string,
    recipient: NotificationRecipient,
    template: NotificationTemplate,
    data: Record<string, unknown> = {},
  ): Promise<NotificationResult> {
    const provider = this.providers.get(providerName)
    if (!provider) {
      throw new ProviderNotFoundError(providerName)
    }

    const resolvedTemplate = resolveTemplate(template, data)

    try {
      return await provider.send(recipient, resolvedTemplate, data)
    } catch (error: unknown) {
      return {
        success: false,
        providerName,
        error: error instanceof Error ? error.message : 'Unknown error',
        sentAt: new Date(),
      }
    }
  }

  /**
   * Send a notification via ALL registered providers (fan-out).
   * Collects all results, never short-circuits on failure.
   */
  async sendAll(
    recipient: NotificationRecipient,
    template: NotificationTemplate,
    data: Record<string, unknown> = {},
  ): Promise<NotificationResult[]> {
    const names = this.getProviders()
    const results: NotificationResult[] = []

    for (const name of names) {
      // send() catches provider errors internally, so this won't throw
      const result = await this.send(name, recipient, template, data)
      results.push(result)
    }

    return results
  }
}

/**
 * Replace {{variableName}} placeholders in template subject and body.
 * Missing variables resolve to empty string.
 */
function resolveTemplate(
  template: NotificationTemplate,
  data: Record<string, unknown>,
): NotificationTemplate {
  const replace = (text: string): string =>
    text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(data[key] ?? ''))

  return {
    ...template,
    subject: replace(template.subject),
    body: replace(template.body),
  }
}
