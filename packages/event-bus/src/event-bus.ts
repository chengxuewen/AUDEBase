import type {
  EventBus,
  EventHandler,
  EventOptions,
  EventContext,
  EventScope,
  PubSubAdapter,
  SubscribeOptions,
  Subscriber,
} from "./types";

// ── Internal Types ─────────────────────────────────────────────────

interface InMemoryEventBusOptions {
  /**
   * Optional cross-process adapter. When provided, global-scope
   * publishes also go through the adapter. Phase 1b: not set.
   */
  readonly adapter?: PubSubAdapter;
  /**
   * Called when a handler throws. Default: no-op.
   */
  readonly onError?: (error: unknown, context: EventContext) => void;
}

// ── Implementation ─────────────────────────────────────────────────

/**
 * In-memory event bus backed by a `Map<string, Set<Subscriber>>`.
 *
 * ## Error isolation
 * Each handler runs inside its own try/catch. A throwing handler
 * is reported via `onError` and does not prevent remaining handlers
 * from executing.
 *
 * ## Scope filtering
 * - `local`  events only reach `local` subscribers
 * - `global` events reach both `local` and `global` subscribers
 *
 * ## Phase 2 readiness
 * When a {@link PubSubAdapter} is provided, `global` publishes
 * are forwarded to the adapter so other processes can receive them.
 * Incoming adapter messages are dispatched to local `global` subscribers.
 */
export class InMemoryEventBus implements EventBus {
  private readonly subscribers = new Map<string, Set<Subscriber>>();
  private readonly adapter?: PubSubAdapter;
  private readonly onError: (error: unknown, context: EventContext) => void;

  constructor(options: InMemoryEventBusOptions = {}) {
    this.adapter = options.adapter;
    this.onError =
      options.onError ??
      (() => {
        /* no-op */
      });
  }

  // ── publish ────────────────────────────────────────────────────

  async publish<T = unknown>(
    subject: string,
    payload: T,
    options: EventOptions = {},
  ): Promise<void> {
    const scope: EventScope = options.scope ?? "local";
    const ctx: EventContext = {
      subject,
      timestamp: Date.now(),
      scope,
    };

    // Run local subscribers
    const subs = this.getOrEmpty(subject);
    for (const sub of subs) {
      // Scope gate: global subscribers receive both; local only local
      if (scope === "local" && sub.scope === "global") {
        continue;
      }

      // Schema validation
      if (sub.schema) {
        try {
          sub.schema.parse(payload);
        } catch (err: unknown) {
          this.onError(err, ctx);
          continue; // skip this handler — payload invalid
        }
      }

      try {
        await sub.handler(payload, ctx);
      } catch (err: unknown) {
        this.onError(err, ctx);
      }
    }

    // Forward global events to cross-process adapter
    if (scope === "global" && this.adapter) {
      await this.adapter.publish(
        this.subjectToChannel(subject),
        JSON.stringify({ subject, payload, scope, timestamp: ctx.timestamp }),
      );
    }
  }

  // ── subscribe ──────────────────────────────────────────────────

  subscribe<T = unknown>(
    subject: string,
    handler: EventHandler<T>,
    options: SubscribeOptions = {},
  ): () => void {
    const sub: Subscriber = {
      handler: handler as EventHandler,
      scope: options.scope ?? "local",
      schema: options.schema,
    };

    const existing = this.subscribers.get(subject);
    if (existing) {
      existing.add(sub);
    } else {
      this.subscribers.set(subject, new Set([sub]));
    }

    return () => {
      this.unsubscribe(subject, handler as EventHandler);
    };
  }

  // ── unsubscribe ────────────────────────────────────────────────

  unsubscribe(subject: string, handler: EventHandler): boolean {
    const subs = this.subscribers.get(subject);
    if (!subs) return false;

    for (const sub of subs) {
      if (sub.handler === handler) {
        subs.delete(sub);
        // Clean up empty sets
        if (subs.size === 0) {
          this.subscribers.delete(subject);
        }
        return true;
      }
    }

    return false;
  }

  // ── subscriberCount ────────────────────────────────────────────

  subscriberCount(subject: string): number {
    return this.subscribers.get(subject)?.size ?? 0;
  }

  // ── Adapter integration (Phase 2) ──────────────────────────────

  /**
   * Register adapter-based global subscribers.
   * Called by the adapter when remote events arrive.
   * @internal
   */
  dispatchRemote(subject: string, payload: unknown, timestamp: number): void {
    const ctx: EventContext = {
      subject,
      timestamp,
      scope: "global",
    };

    const subs = this.getOrEmpty(subject);
    for (const sub of subs) {
      if (sub.scope !== "global") continue;

      try {
        void sub.handler(payload, ctx);
      } catch (err: unknown) {
        this.onError(err, ctx);
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────

  private getOrEmpty(subject: string): ReadonlySet<Subscriber> {
    return this.subscribers.get(subject) ?? emptySet;
  }

  private subjectToChannel(subject: string): string {
    return `audebase:events:${subject}`;
  }
}

// ── Constants ──────────────────────────────────────────────────────

const emptySet: ReadonlySet<Subscriber> = new Set();
