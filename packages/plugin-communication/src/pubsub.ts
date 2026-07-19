import type { PublishMessage, SubscriptionHandler, IPubSubAdapter } from "./types.js";
import { publishMessageSchema } from "./types.js";

export class EventPubSub implements IPubSubAdapter {
  readonly #channels = new Map<string, Set<SubscriptionHandler>>();

  async publish(channel: string, message: PublishMessage): Promise<void> {
    publishMessageSchema.parse(message);

    const handlers = this.#channels.get(channel);
    if (!handlers || handlers.size === 0) return;

    const payload = JSON.stringify(message);
    const promises = [...handlers].map(async (handler) => {
      try {
        await handler(channel, payload);
      } catch {
        /* Phase 2 logs */
      }
    });
    await Promise.all(promises);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async subscribe(channel: string, handler: SubscriptionHandler): Promise<void> {
    let handlers = this.#channels.get(channel);
    if (!handlers) {
      handlers = new Set();
      this.#channels.set(channel, handlers);
    }
    handlers.add(handler);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async unsubscribe(channel: string, handler: SubscriptionHandler): Promise<void> {
    this.#channels.get(channel)?.delete(handler);
  }

  channels(): string[] {
    return [...this.#channels.keys()];
  }

  subscriberCount(channel: string): number {
    return this.#channels.get(channel)?.size ?? 0;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async close(): Promise<void> {
    this.#channels.clear();
  }
}

export class RedisPubSub implements IPubSubAdapter {
  readonly #redisUrl: string;
  readonly #tenantScoped: boolean;

  constructor(redisUrl: string, tenantScoped = true) {
    this.#redisUrl = redisUrl;
    this.#tenantScoped = tenantScoped;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async publish(channel: string, message: PublishMessage): Promise<void> {
    publishMessageSchema.parse(message);
    const scoped =
      this.#tenantScoped && message.tenant_id ? `${message.tenant_id}:${channel}` : channel;
    throw new Error(`RedisPubSub.publish not implemented (Phase 2). Channel: ${scoped}.`);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async subscribe(channel: string, _handler: SubscriptionHandler): Promise<void> {
    const scoped = this.#tenantScoped ? `{tenant}:${channel}` : channel;
    throw new Error(`RedisPubSub.subscribe not implemented (Phase 2). Channel: ${scoped}.`);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async unsubscribe(channel: string, _handler: SubscriptionHandler): Promise<void> {
    const scoped = this.#tenantScoped ? `{tenant}:${channel}` : channel;
    throw new Error(`RedisPubSub.unsubscribe not implemented (Phase 2). Channel: ${scoped}.`);
  }

  async close(): Promise<void> {
    /* no-op for Phase 1b */
  }
}
