import { describe, test, expect, vi } from "vitest";
import { z } from "zod";
import { InMemoryEventBus } from "../event-bus";
import type { EventBus, EventContext } from "../types";

// ── Helpers ─────────────────────────────────────────────────────────

function createBus(onError?: (error: unknown, ctx: EventContext) => void): EventBus {
  return new InMemoryEventBus({ onError });
}

function makeHandler() {
  return vi.fn<(_payload: unknown, _ctx: EventContext) => void>();
}

// ── Publish / Subscribe ─────────────────────────────────────────────

describe("publish / subscribe", () => {
  test("delivers payload to a single registered handler", async () => {
    // Arrange
    const bus = createBus();
    const handler = makeHandler();
    bus.subscribe("user.created", handler);

    // Act
    await bus.publish("user.created", { id: 1, name: "Alice" });

    // Assert
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      { id: 1, name: "Alice" },
      expect.objectContaining({ subject: "user.created", scope: "local" }),
    );
  });

  test("delivers to multiple handlers for the same subject", async () => {
    // Arrange
    const bus = createBus();
    const h1 = makeHandler();
    const h2 = makeHandler();
    bus.subscribe("order.created", h1);
    bus.subscribe("order.created", h2);

    // Act
    await bus.publish("order.created", { id: 42 });

    // Assert
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  test("does not deliver to handlers of different subjects", async () => {
    // Arrange
    const bus = createBus();
    const hUser = makeHandler();
    const hOrder = makeHandler();
    bus.subscribe("user.created", hUser);
    bus.subscribe("order.created", hOrder);

    // Act
    await bus.publish("user.created", {});

    // Assert
    expect(hUser).toHaveBeenCalledTimes(1);
    expect(hOrder).not.toHaveBeenCalled();
  });

  test("no-op when publishing to subject with zero subscribers", async () => {
    // Arrange
    const bus = createBus();

    // Act & Assert — should not throw
    await expect(bus.publish("nonexistent", {})).resolves.toBeUndefined();
  });

  test("context includes correct timestamp", async () => {
    // Arrange
    const bus = createBus();
    const handler = makeHandler();
    bus.subscribe("test.event", handler);
    const before = Date.now();

    // Act
    await bus.publish("test.event", {});

    // Assert
    const ctx = handler.mock.calls[0]?.[1];
    expect(ctx?.timestamp).toBeGreaterThanOrEqual(before);
    expect(ctx?.timestamp).toBeLessThanOrEqual(Date.now());
  });
});

// ── Unsubscribe ─────────────────────────────────────────────────────

describe("unsubscribe", () => {
  test("removes handler so it no longer receives events", async () => {
    // Arrange
    const bus = createBus();
    const handler = makeHandler();
    bus.subscribe("user.created", handler);
    bus.unsubscribe("user.created", handler);

    // Act
    await bus.publish("user.created", {});

    // Assert
    expect(handler).not.toHaveBeenCalled();
  });

  test("returns true when handler existed and was removed", () => {
    // Arrange
    const bus = createBus();
    const handler = makeHandler();
    bus.subscribe("user.created", handler);

    // Act
    const result = bus.unsubscribe("user.created", handler);

    // Assert
    expect(result).toBe(true);
  });

  test("returns false when handler was not registered", () => {
    // Arrange
    const bus = createBus();
    const handler = makeHandler();

    // Act
    const result = bus.unsubscribe("user.created", handler);

    // Assert
    expect(result).toBe(false);
  });

  test("returns false for unknown subject", () => {
    // Arrange
    const bus = createBus();
    const handler = makeHandler();

    // Act
    const result = bus.unsubscribe("nonexistent", handler);

    // Assert
    expect(result).toBe(false);
  });

  test("disposer returned by subscribe() removes the handler", async () => {
    // Arrange
    const bus = createBus();
    const handler = makeHandler();
    const dispose = bus.subscribe("user.created", handler);

    // Act
    dispose();

    // Assert
    expect(bus.subscriberCount("user.created")).toBe(0);
  });
});

// ── subscriberCount ─────────────────────────────────────────────────

describe("subscriberCount", () => {
  test("returns 0 for a subject with no subscribers", () => {
    // Arrange
    const bus = createBus();

    // Act
    const count = bus.subscriberCount("nonexistent");

    // Assert
    expect(count).toBe(0);
  });

  test("returns the exact number of registered handlers", () => {
    // Arrange
    const bus = createBus();
    bus.subscribe("user.created", makeHandler());
    bus.subscribe("user.created", makeHandler());
    bus.subscribe("user.created", makeHandler());

    // Act
    const count = bus.subscriberCount("user.created");

    // Assert
    expect(count).toBe(3);
  });

  test("reflects unsubscribe", () => {
    // Arrange
    const bus = createBus();
    const h1 = makeHandler();
    const h2 = makeHandler();
    bus.subscribe("user.created", h1);
    bus.subscribe("user.created", h2);

    // Act
    bus.unsubscribe("user.created", h1);

    // Assert
    expect(bus.subscriberCount("user.created")).toBe(1);
  });
});

// ── Error Isolation ─────────────────────────────────────────────────

describe("error isolation", () => {
  test("one handler throwing does not prevent remaining handlers from running", async () => {
    // Arrange
    const bus = createBus();
    const good = makeHandler();
    const bad = vi.fn(() => {
      throw new Error("boom");
    });
    bus.subscribe("user.created", bad);
    bus.subscribe("user.created", good);

    // Act
    await bus.publish("user.created", {});

    // Assert
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
  });

  test("calls onError callback when a handler throws", async () => {
    // Arrange
    const onError = vi.fn();
    const bus = createBus(onError);
    const bad = vi.fn(() => {
      throw new Error("handler error");
    });
    bus.subscribe("user.created", bad);

    // Act
    await bus.publish("user.created", {});

    // Assert
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "handler error" }),
      expect.objectContaining({ subject: "user.created" }),
    );
  });

  test("schema validation failure calls onError and skips handler", async () => {
    // Arrange
    const onError = vi.fn();
    const bus = createBus(onError);
    const handler = makeHandler();
    const schema = z.object({ name: z.string() });
    bus.subscribe("user.created", handler, { schema });

    // Act
    await bus.publish("user.created", { name: 123 });

    // Assert
    expect(handler).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  test("schema validation passes for valid payloads", async () => {
    // Arrange
    const bus = createBus();
    const handler = makeHandler();
    const schema = z.object({ name: z.string() });
    bus.subscribe("user.created", handler, { schema });

    // Act
    await bus.publish("user.created", { name: "Alice" });

    // Assert
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

// ── Scope Filtering ─────────────────────────────────────────────────

describe("scope filtering", () => {
  test("local publish reaches local subscribers", async () => {
    // Arrange
    const bus = createBus();
    const handler = makeHandler();
    bus.subscribe("user.created", handler, { scope: "local" });

    // Act
    await bus.publish("user.created", {}, { scope: "local" });

    // Assert
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("global publish reaches global subscribers", async () => {
    // Arrange
    const bus = createBus();
    const handler = makeHandler();
    bus.subscribe("user.created", handler, { scope: "global" });

    // Act
    await bus.publish("user.created", {}, { scope: "global" });

    // Assert
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("local publish does NOT reach global-only subscribers", async () => {
    // Arrange
    const bus = createBus();
    const handler = makeHandler();
    bus.subscribe("user.created", handler, { scope: "global" });

    // Act
    await bus.publish("user.created", {}, { scope: "local" });

    // Assert
    expect(handler).not.toHaveBeenCalled();
  });

  test("global publish reaches both local and global subscribers", async () => {
    // Arrange
    const bus = createBus();
    const local = makeHandler();
    const global = makeHandler();
    bus.subscribe("user.created", local, { scope: "local" });
    bus.subscribe("user.created", global, { scope: "global" });

    // Act
    await bus.publish("user.created", {}, { scope: "global" });

    // Assert
    expect(local).toHaveBeenCalledTimes(1);
    expect(global).toHaveBeenCalledTimes(1);
  });

  test("default scope is local for both publish and subscribe", async () => {
    // Arrange
    const bus = createBus();
    const handler = makeHandler();
    bus.subscribe("user.created", handler); // no scope option

    // Act
    await bus.publish("user.created", {}); // no scope option

    // Assert
    expect(handler).toHaveBeenCalledTimes(1);
    const ctx = handler.mock.calls[0]?.[1];
    expect(ctx?.scope).toBe("local");
  });
});

// ── Async Handlers ──────────────────────────────────────────────────

describe("async handlers", () => {
  test("awaits async handlers", async () => {
    // Arrange
    const bus = createBus();
    let resolved = false;
    const handler = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      resolved = true;
    });
    bus.subscribe("user.created", handler);

    // Act
    await bus.publish("user.created", {});

    // Assert
    expect(handler).toHaveBeenCalledTimes(1);
    expect(resolved).toBe(true);
  });

  test("error in async handler is isolated", async () => {
    // Arrange
    const onError = vi.fn();
    const bus = createBus(onError);
    const good = makeHandler();
    const bad = vi.fn(async () => {
      throw new Error("async boom");
    });
    bus.subscribe("user.created", bad);
    bus.subscribe("user.created", good);

    // Act
    await bus.publish("user.created", {});

    // Assert
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

// ── Handler Order ───────────────────────────────────────────────────

describe("handler order", () => {
  test("invokes handlers in subscription order", async () => {
    // Arrange
    const bus = createBus();
    const calls: string[] = [];
    bus.subscribe("user.created", () => {
      calls.push("first");
    });
    bus.subscribe("user.created", () => {
      calls.push("second");
    });
    bus.subscribe("user.created", () => {
      calls.push("third");
    });

    // Act
    await bus.publish("user.created", {});

    // Assert
    expect(calls).toEqual(["first", "second", "third"]);
  });
});

// ── Same Handler Duplicate ──────────────────────────────────────────

describe("duplicate handler", () => {
  test("same handler registered twice is called twice", async () => {
    // Arrange
    const bus = createBus();
    const handler = makeHandler();
    bus.subscribe("user.created", handler);
    bus.subscribe("user.created", handler);

    // Act
    await bus.publish("user.created", {});

    // Assert
    expect(handler).toHaveBeenCalledTimes(2);
  });

  test("unsubscribe removes only one registration of a duplicate handler", async () => {
    // Arrange
    const bus = createBus();
    const handler = makeHandler();
    bus.subscribe("user.created", handler);
    bus.subscribe("user.created", handler);

    // Act
    const removed = bus.unsubscribe("user.created", handler);

    // Assert
    expect(removed).toBe(true);
    expect(bus.subscriberCount("user.created")).toBe(1);
  });
});

// ── Adapter readiness ───────────────────────────────────────────────

describe("adapter readiness (Phase 2)", () => {
  test("dispatchRemote delivers to global subscribers", () => {
    // Arrange
    const bus = new InMemoryEventBus();
    const handler = makeHandler();
    bus.subscribe("user.created", handler, { scope: "global" });

    // Act
    bus.dispatchRemote("user.created", { id: 99 }, 1700000000000);

    // Assert
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      { id: 99 },
      expect.objectContaining({
        subject: "user.created",
        scope: "global",
        timestamp: 1700000000000,
      }),
    );
  });

  test("dispatchRemote does not deliver to local-only subscribers", () => {
    // Arrange
    const bus = new InMemoryEventBus();
    const handler = makeHandler();
    bus.subscribe("user.created", handler, { scope: "local" });

    // Act
    bus.dispatchRemote("user.created", {}, 0);

    // Assert
    expect(handler).not.toHaveBeenCalled();
  });
});
