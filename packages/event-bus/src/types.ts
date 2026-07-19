import type { ZodSchema } from "zod";

// ── Event Handler ──────────────────────────────────────────────────

/**
 * Event handler function. May be synchronous or return a Promise.
 * Handlers execute in subscription order within the same scope.
 */
export type EventHandler<T = unknown> = (payload: T, context: EventContext) => void | Promise<void>;

// ── Event Context ──────────────────────────────────────────────────

/**
 * Metadata passed to every event handler.
 */
export interface EventContext {
  /** Dot-separated event subject (e.g. "order.created") */
  readonly subject: string;
  /** Tenant context, if available */
  readonly tenantId?: string;
  /** Unix-epoch timestamp (ms) when the event was published */
  readonly timestamp: number;
  /** Publication scope */
  readonly scope: EventScope;
}

// ── Event Options ──────────────────────────────────────────────────

/**
 * Scope determines whether an event propagates within the local partition
 * or across partitions (via Redis Pub/Sub in Phase 2).
 *
 * - `local`  (default): only handlers in the same process
 * - `global`: handlers in any process (same-partition + cross-partition via adapter)
 */
export type EventScope = "local" | "global";

export interface EventOptions {
  readonly scope?: EventScope;
}

// ── Subscription ───────────────────────────────────────────────────

/**
 * Options when subscribing to an event.
 */
export interface SubscribeOptions {
  /**
   * Zod schema for runtime payload validation.
   * When set, publish() validates the payload before dispatching.
   */
  readonly schema?: ZodSchema;
  /**
   * Scope filter. Handlers only receive events published with
   * a matching (or wider) scope. Default: "local".
   */
  readonly scope?: EventScope;
}

// ── Pub/Sub Adapter (Phase 2) ──────────────────────────────────────

/**
 * Pluggable cross-process adapter.
 * Phase 1b ships without one (in-memory only).
 * Phase 2 provides a Redis-based implementation.
 */
export interface PubSubAdapter {
  /** Publish a JSON-serialized event to a channel. */
  publish(channel: string, message: string): Promise<void>;
  /** Subscribe to a channel. The callback receives the raw JSON message. */
  subscribe(channel: string, handler: (message: string) => void): Promise<void>;
  /** Unsubscribe from a channel. */
  unsubscribe(channel: string): Promise<void>;
}

// ── Event Bus Interface ────────────────────────────────────────────

/**
 * Application-layer event bus.
 *
 * Plugins use `publish(subject, payload)` / `subscribe(subject, handler)`.
 * Phase 1b: synchronous in-memory dispatch.
 * Phase 2:   automatic cross-process propagation via {@link PubSubAdapter}.
 */
export interface EventBus {
  /**
   * Publish an event. All registered handlers for `subject` are invoked
   * in subscription order. Handlers are isolated — one throwing does not
   * prevent remaining handlers from running.
   *
   * @param subject  Dot-separated event name (e.g. "order.created")
   * @param payload  Event data — validated against any registered Zod schema
   * @param options  Scope control (default: local)
   */
  publish<T = unknown>(subject: string, payload: T, options?: EventOptions): Promise<void>;

  /**
   * Register an event handler.
   *
   * @returns A disposer function — call it to unsubscribe.
   */
  subscribe<T = unknown>(
    subject: string,
    handler: EventHandler<T>,
    options?: SubscribeOptions,
  ): () => void;

  /**
   * Remove a previously registered handler.
   *
   * @returns `true` if the handler was found and removed.
   */
  unsubscribe(subject: string, handler: EventHandler): boolean;

  /**
   * Return the number of registered handlers for a subject.
   * Useful for testing and diagnostics.
   */
  subscriberCount(subject: string): number;
}

// ── Internal Subscriber Record ─────────────────────────────────────

/** @internal */
export interface Subscriber {
  readonly handler: EventHandler;
  readonly scope: EventScope;
  readonly schema?: ZodSchema;
}
