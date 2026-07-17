/**
 * @audebase/event-bus - In-process pub/sub event bus (Phase 1b, D1.9)
 *
 * Fire-and-forget: handler errors are caught and logged, never propagated
 * to the publisher. Zod schema validation throws to the publisher on failure.
 */

import type { z } from 'zod'
import type { EventHandler, EventSubscription, EventBusOptions } from './types.js'
import { matchSubject } from './wildcard.js'

/** Thrown when a published payload fails registered Zod schema validation. */
export class EventBusValidationError extends Error {
  readonly validationError: unknown
  constructor(message: string, validationError: unknown) {
    super(message)
    this.name = 'EventBusValidationError'
    this.validationError = validationError
  }
}

interface InternalSubscription extends EventSubscription {
  /** Internal id for removal tracking. */
  readonly id: number
}

let nextId = 1

export class EventBus {
  private readonly partition: string
  private readonly validatePayload: boolean
  private readonly logger: { error: (msg: string, err?: unknown) => void }
  private readonly subscriptions: Map<string, InternalSubscription[]> = new Map()
  private readonly schemas: Map<string, z.ZodSchema> = new Map()

  constructor(options: EventBusOptions) {
    this.partition = options.partition
    this.validatePayload = options.validatePayload ?? true
    this.logger = options.logger ?? { error: () => {} }
  }

  /**
   * Publish an event to all subscribers matching `subject`.
   * Handlers are invoked synchronously in registration order (fire-and-forget).
   * Returns the number of handlers invoked.
   * Throws EventBusValidationError if a registered schema rejects the payload.
   */
  publish(subject: string, payload: unknown): number {
    // Schema validation (throws to publisher)
    if (this.validatePayload) {
      const schema = this.schemas.get(subject)
      if (schema !== undefined) {
        const result = schema.safeParse(payload)
        if (!result.success) {
          throw new EventBusValidationError(
            `Payload validation failed for subject "${subject}"`,
            result.error,
          )
        }
      }
    }

    // Collect matching handlers across all registered patterns
    const toInvoke: Array<{ sub: InternalSubscription }> = []

    for (const [pattern, subs] of this.subscriptions) {
      if (matchSubject(pattern, subject)) {
        for (const sub of subs) {
          toInvoke.push({ sub })
        }
      }
    }

    // Fire-and-forget: call each handler, catch errors
    let count = 0
    const onceIds: number[] = []

    for (const { sub } of toInvoke) {
      count++
      if (sub.once) {
        onceIds.push(sub.id)
      }
      try {
        const result = sub.handler(payload)
        // If the handler returns a promise, attach a catch so unhandled
        // rejections never surface to the publisher.
        if (result instanceof Promise) {
          result.catch((err: unknown) => {
            this.logger.error(
              `Event handler error for subject "${subject}"`,
              err,
            )
          })
        }
      } catch (err) {
        this.logger.error(
          `Event handler error for subject "${subject}"`,
          err,
        )
      }
    }

    // Remove once-subscriptions after dispatch
    for (const id of onceIds) {
      this.removeById(id)
    }

    return count
  }

  /**
   * Subscribe to events matching `subject`.
   * Supports wildcard: 'order.*' matches 'order.created', 'order.updated'.
   */
  subscribe(subject: string, handler: EventHandler): EventSubscription {
    return this.addSubscription(subject, handler, false)
  }

  /** Subscribe to a single matching event, then auto-unsubscribe. */
  subscribeOnce(subject: string, handler: EventHandler): EventSubscription {
    return this.addSubscription(subject, handler, true)
  }

  /** Unsubscribe a specific subscription by its reference. */
  unsubscribe(subscription: EventSubscription): void {
    const subs = this.subscriptions.get(subscription.subject)
    if (subs === undefined) {
      return
    }
    const idx = subs.findIndex(
      (s) => s.handler === subscription.handler && s.once === subscription.once,
    )
    if (idx >= 0) {
      subs.splice(idx, 1)
      if (subs.length === 0) {
        this.subscriptions.delete(subscription.subject)
      }
    }
  }

  /** Unsubscribe all handlers for a given subject pattern. */
  unsubscribeAll(subject: string): void {
    this.subscriptions.delete(subject)
  }

  /** Remove all subscriptions. Used during plugin disable/unload. */
  clear(): void {
    this.subscriptions.clear()
    this.schemas.clear()
  }

  /**
   * Register a Zod schema for a subject. Payload is validated against this
   * schema on publish. Throws EventBusValidationError on invalid payload.
   */
  registerSchema(subject: string, schema: z.ZodSchema): void {
    this.schemas.set(subject, schema)
  }

  /** Partition name for this EventBus instance. */
  getPartition(): string {
    return this.partition
  }

  // --- internals ---

  private addSubscription(
    subject: string,
    handler: EventHandler,
    once: boolean,
  ): EventSubscription {
    const sub: InternalSubscription = {
      subject,
      handler,
      ...(once ? { once: true } : {}),
      id: nextId++,
    }
    const existing = this.subscriptions.get(subject)
    if (existing === undefined) {
      this.subscriptions.set(subject, [sub])
    } else {
      existing.push(sub)
    }
    // Return a public view (without internal id)
    const pub: EventSubscription = {
      subject: sub.subject,
      handler: sub.handler,
      ...(sub.once !== undefined ? { once: sub.once } : {}),
    }
    return pub
  }

  private removeById(id: number): void {
    for (const [pattern, subs] of this.subscriptions) {
      const idx = subs.findIndex((s) => s.id === id)
      if (idx >= 0) {
        subs.splice(idx, 1)
        if (subs.length === 0) {
          this.subscriptions.delete(pattern)
        }
        return
      }
    }
  }
}
