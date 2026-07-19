import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { InMemoryEventBus } from "@audebase/event-bus";
import type { EventBus, EventContext } from "@audebase/event-bus";

/** Module-level reference, set during plugin registration */
let bus: EventBus | null = null;

declare module "fastify" {
  interface FastifyInstance {
    eventBus: EventBus;
  }
}

/**
 * Get the current EventBus instance (for testing / introspection).
 *
 * @internal
 */
export function getEventBus(): EventBus | null {
  return bus;
}

export interface EventBusPluginOptions {
  /** Optional error callback (default: no-op) */
  readonly onError?: (error: unknown, context: EventContext) => void;
}

/**
 * eventBusPlugin — Fastify EventBus 插件
 *
 * Creates an InMemoryEventBus and decorates the Fastify instance.
 * Plugins use `fastify.eventBus.publish()` / `fastify.eventBus.subscribe()`.
 *
 * Phase 1b: in-memory only. Phase 2: adds PubSubAdapter for cross-process.
 */
function eventBusPlugin(fastify: FastifyInstance, options: EventBusPluginOptions): void {
  bus = new InMemoryEventBus({
    onError:
      options.onError ??
      ((err: unknown, ctx: EventContext) => {
        fastify.log.error({ err, subject: ctx.subject }, "event handler error");
      }),
  });

  fastify.decorate("eventBus", bus);
}

export default fp(eventBusPlugin, {
  name: "audebase-eventbus",
  fastify: "5.x",
});
