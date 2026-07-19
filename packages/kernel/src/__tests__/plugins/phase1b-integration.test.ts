import { describe, test, expect, afterAll, vi } from "vitest";
import Fastify from "fastify";
import eventBusPlugin from "../../plugins/eventbus";
import commsPlugin from "../../plugins/comms";
import cronPlugin from "../../plugins/cron";

// ── Mock BullMQ (same approach as cron package tests) ──────────────

const mockQueueClose = vi.fn().mockResolvedValue(undefined);
const mockWorkerClose = vi.fn().mockResolvedValue(undefined);
const mockQueueAdd = vi.fn().mockResolvedValue(undefined);
const mockQueueRemoveRepeatable = vi.fn().mockResolvedValue(undefined);
const mockGetRepeatableJobs = vi.fn().mockResolvedValue([]);

vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: mockQueueAdd,
    removeRepeatable: mockQueueRemoveRepeatable,
    getRepeatableJobs: mockGetRepeatableJobs,
    close: mockQueueClose,
  })),
  Worker: vi.fn().mockImplementation(() => ({
    close: mockWorkerClose,
  })),
}));

// ── Helpers ───────────────────────────────────────────────────────

async function createAppWithPlugins(plugins: Array<"eventbus" | "comms" | "cron">) {
  const app = Fastify({ logger: false });

  for (const name of plugins) {
    switch (name) {
      case "eventbus":
        await app.register(eventBusPlugin, {});
        break;
      case "comms":
        await app.register(commsPlugin);
        break;
      case "cron":
        await app.register(cronPlugin, { redisUrl: "redis://localhost:6379" });
        break;
    }
  }

  return app;
}

// ── Tests ─────────────────────────────────────────────────────────

describe("phase1b integration: EventBus + Comms + Cron", () => {
  afterAll(() => {
    vi.restoreAllMocks();
  });

  // ── EventBus ──────────────────────────────────────────────────

  describe("eventBusPlugin", () => {
    test("decorates fastify with eventBus", async () => {
      const app = await createAppWithPlugins(["eventbus"]);
      expect(app.eventBus).toBeDefined();
      expect(typeof app.eventBus.publish).toBe("function");
      expect(typeof app.eventBus.subscribe).toBe("function");
      expect(typeof app.eventBus.subscriberCount).toBe("function");
      await app.close();
    });

    test("can publish and subscribe to events", async () => {
      const app = await createAppWithPlugins(["eventbus"]);
      const received: unknown[] = [];

      const unsub = app.eventBus.subscribe("test.event", (payload: unknown) => {
        received.push(payload);
      });

      await app.eventBus.publish("test.event", { data: "hello" });
      await app.eventBus.publish("test.event", { data: "world" });

      expect(received).toHaveLength(2);
      expect(received).toEqual([{ data: "hello" }, { data: "world" }]);

      unsub();
      expect(app.eventBus.subscriberCount("test.event")).toBe(0);

      await app.close();
    });

    test("handlers are isolated — one error does not block others", async () => {
      const errors: Array<{ err: unknown; subject: string }> = [];
      const app = Fastify({ logger: false });
      await app.register(eventBusPlugin, {
        onError: (err, ctx) => errors.push({ err, subject: ctx.subject }),
      });

      const received: string[] = [];
      app.eventBus.subscribe("test.isolated", () => {
        throw new Error("handler 1 failed");
      });
      app.eventBus.subscribe("test.isolated", () => {
        received.push("handler 2 ok");
      });

      await app.eventBus.publish("test.isolated", {});

      expect(received).toHaveLength(1);
      expect(received[0]).toBe("handler 2 ok");
      expect(errors).toHaveLength(1);
      expect(errors[0].subject).toBe("test.isolated");

      await app.close();
    });
  });

  // ── Comms ─────────────────────────────────────────────────────

  describe("commsPlugin", () => {
    test("decorates fastify with serviceRegistry", async () => {
      const app = await createAppWithPlugins(["comms"]);
      expect(app.serviceRegistry).toBeDefined();
      expect(typeof app.serviceRegistry.register).toBe("function");
      expect(typeof app.serviceRegistry.resolve).toBe("function");
      expect(typeof app.serviceRegistry.list).toBe("function");
      await app.close();
    });

    test("can register and resolve services", async () => {
      const app = await createAppWithPlugins(["comms"]);

      app.serviceRegistry.register({
        method: "erp:order.create",
        pluginName: "test-plugin",
        handler: async () => ({ id: "1" }),
      });

      const registration = app.serviceRegistry.resolve("erp:order.create");
      expect(registration).toBeDefined();
      expect(registration?.method).toBe("erp:order.create");
      expect(registration?.pluginName).toBe("test-plugin");

      // Verify handler works
      const result = await registration?.handler?.({});
      expect(result).toEqual({ id: "1" });

      await app.close();
    });

    test("resolve returns undefined for unknown service", async () => {
      const app = await createAppWithPlugins(["comms"]);

      const registration = app.serviceRegistry.resolve("nonexistent:method");
      expect(registration).toBeUndefined();

      await app.close();
    });
  });

  // ── Cron ──────────────────────────────────────────────────────

  describe("cronPlugin", () => {
    afterEach(() => {
      vi.clearAllMocks();
    });

    test("decorates fastify with cron registry", async () => {
      const app = await createAppWithPlugins(["cron"]);
      expect(app.cron).toBeDefined();
      expect(typeof app.cron.add).toBe("function");
      expect(typeof app.cron.remove).toBe("function");
      expect(typeof app.cron.list).toBe("function");
      await app.close();
    });
  });

  // ── All Three Together ────────────────────────────────────────
  describe("all three plugins together", () => {
    test("all plugins decorate without conflict", async () => {
      const app = await createAppWithPlugins(["eventbus", "comms", "cron"]);

      // Verify all decorations
      expect(app.eventBus).toBeDefined();
      expect(app.serviceRegistry).toBeDefined();
      expect(app.cron).toBeDefined();

      // Verify cross-plugin interaction: register comms, fire event
      app.serviceRegistry.register({
        method: "test:ping",
        pluginName: "integration",
        handler: async () => "pong",
      });

      const received: unknown[] = [];
      app.eventBus.subscribe("integration.ready", (payload: unknown) => {
        received.push(payload);
      });

      await app.eventBus.publish("integration.ready", { status: "ok" });

      expect(received).toHaveLength(1);

      await app.close();
    });
  });
});
