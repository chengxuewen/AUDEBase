/**
 * @audebase/event-bus - Type definitions
 */

/** Handler invoked when a matching event is published. */
export type EventHandler = (payload: unknown) => void | Promise<void>

/** A subscription record returned by subscribe/subscribeOnce. */
export interface EventSubscription {
  subject: string
  handler: EventHandler
  /** One-time subscription (auto-unsubscribe after first fire) */
  once?: boolean
}

/** Constructor options for EventBus. */
export interface EventBusOptions {
  /** Partition name for this EventBus instance (e.g. 'SYSTEM', 'oa', 'erp') */
  partition: string
  /** Enable Zod payload validation (default: true) */
  validatePayload?: boolean
  /** Optional logger receiving handler errors. Default: no-op. */
  logger?: { error: (msg: string, err?: unknown) => void }
}

/** Events declared in a plugin's manifest.exports.events. */
export interface EventManifest {
  events: {
    name: string
    description?: string
    payloadSchema?: Record<string, unknown>
    scope?: 'partition' | 'global'
  }[]
  subscriptions?: {
    subject: string
    description?: string
  }[]
}
