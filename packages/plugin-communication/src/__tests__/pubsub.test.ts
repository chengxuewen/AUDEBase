/**
 * Tests for EventPubSub and RedisPubSub.
 */
import { describe, it, expect, vi } from "vitest";
import { EventPubSub, RedisPubSub } from "../pubsub.js";
import type { PublishMessage } from "../types.js";

// ── Helpers ────────────────────────────────────────────────────

function makeMessage(overrides: Partial<PublishMessage> = {}): PublishMessage {
  return {
    channel: "orders",
    payload: JSON.stringify({ orderId: "123" }),
    publisher: "erp-plugin",
    tenant_id: "tenant-1",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ── Tests: EventPubSub ─────────────────────────────────────────

describe("EventPubSub", () => {
  describe("publish + subscribe", () => {
    it("delivers published message to subscriber", async () => {
      // Arrange
      const pubsub = new EventPubSub();
      const handler = vi.fn();
      const message = makeMessage();

      // Act
      await pubsub.subscribe("orders", handler);
      await pubsub.publish("orders", message);

      // Assert
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith("orders", JSON.stringify(message));
    });

    it("does not deliver to unsubscribed handlers", async () => {
      // Arrange
      const pubsub = new EventPubSub();
      const handler = vi.fn();
      const message = makeMessage();

      // Act
      await pubsub.subscribe("orders", handler);
      await pubsub.unsubscribe("orders", handler);
      await pubsub.publish("orders", message);

      // Assert
      expect(handler).not.toHaveBeenCalled();
    });

    it("delivers to multiple subscribers on same channel", async () => {
      // Arrange
      const pubsub = new EventPubSub();
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const message = makeMessage();

      // Act
      await pubsub.subscribe("orders", handler1);
      await pubsub.subscribe("orders", handler2);
      await pubsub.publish("orders", message);

      // Assert
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it("isolates messages by channel", async () => {
      // Arrange
      const pubsub = new EventPubSub();
      const ordersHandler = vi.fn();
      const usersHandler = vi.fn();

      // Act
      await pubsub.subscribe("orders", ordersHandler);
      await pubsub.subscribe("users", usersHandler);
      await pubsub.publish("orders", makeMessage({ channel: "orders" }));

      // Assert
      expect(ordersHandler).toHaveBeenCalledTimes(1);
      expect(usersHandler).not.toHaveBeenCalled();
    });

    it("does not throw when publishing to channel with no subscribers", async () => {
      // Arrange
      const pubsub = new EventPubSub();

      // Act & Assert
      await expect(pubsub.publish("empty", makeMessage())).resolves.toBeUndefined();
    });
  });

  describe("validation", () => {
    it("throws when message fails Zod validation", async () => {
      // Arrange
      const pubsub = new EventPubSub();

      // Act & Assert
      await expect(pubsub.publish("", makeMessage({ channel: "" }))).rejects.toThrow();
    });
  });

  describe("subscriberCount", () => {
    it("returns correct subscriber count", async () => {
      // Arrange
      const pubsub = new EventPubSub();
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      // Act
      await pubsub.subscribe("orders", handler1);
      await pubsub.subscribe("orders", handler2);
      await pubsub.subscribe("users", vi.fn());

      // Assert
      expect(pubsub.subscriberCount("orders")).toBe(2);
      expect(pubsub.subscriberCount("users")).toBe(1);
      expect(pubsub.subscriberCount("empty")).toBe(0);
    });
  });

  describe("channels", () => {
    it("returns all active channel names", async () => {
      // Arrange
      const pubsub = new EventPubSub();

      // Act
      await pubsub.subscribe("orders", vi.fn());
      await pubsub.subscribe("users", vi.fn());

      // Assert
      const channels = pubsub.channels();
      expect(channels).toContain("orders");
      expect(channels).toContain("users");
      expect(channels).toHaveLength(2);
    });
  });

  describe("close", () => {
    it("removes all listeners", async () => {
      // Arrange
      const pubsub = new EventPubSub();
      const handler = vi.fn();
      await pubsub.subscribe("orders", handler);

      // Act
      await pubsub.close();
      await pubsub.publish("orders", makeMessage());

      // Assert
      expect(handler).not.toHaveBeenCalled();
      expect(pubsub.channels()).toHaveLength(0);
    });
  });

  describe("async handler", () => {
    it("supports async subscription handlers", async () => {
      // Arrange
      const pubsub = new EventPubSub();
      const results: string[] = [];
      const handler = async (_channel: string, payload: string) => {
        const envelope = JSON.parse(payload) as PublishMessage;
        const data = JSON.parse(envelope.payload) as { orderId: string };
        results.push(data.orderId);
      };

      // Act
      await pubsub.subscribe("orders", handler);
      await pubsub.publish("orders", makeMessage());

      // Assert
      expect(results).toContain("123");
    });
  });
});

// ── Tests: RedisPubSub (Phase 2 stub) ──────────────────────────

describe("RedisPubSub", () => {
  it("throws on publish (not implemented in Phase 1b)", async () => {
    // Arrange
    const pubsub = new RedisPubSub("redis://localhost:6379");

    // Act & Assert
    await expect(pubsub.publish("orders", makeMessage())).rejects.toThrow("not implemented");
  });

  it("throws on subscribe (not implemented in Phase 1b)", async () => {
    // Arrange
    const pubsub = new RedisPubSub("redis://localhost:6379");

    // Act & Assert
    await expect(pubsub.subscribe("orders", vi.fn())).rejects.toThrow("not implemented");
  });

  it("throws on unsubscribe (not implemented in Phase 1b)", async () => {
    // Arrange
    const pubsub = new RedisPubSub("redis://localhost:6379");

    // Act & Assert
    await expect(pubsub.unsubscribe("orders", vi.fn())).rejects.toThrow("not implemented");
  });

  it("close resolves without error", async () => {
    // Arrange
    const pubsub = new RedisPubSub("redis://localhost:6379");

    // Act & Assert
    await expect(pubsub.close()).resolves.toBeUndefined();
  });
});
