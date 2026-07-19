import { describe, test, expect, beforeAll, afterAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import wsPlugin from "../../plugins/ws";

// ---- helpers ----

async function createTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(wsPlugin);
  return app;
}

describe("wsPlugin", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── GET /ws — health check ───────────────────────────────────────

  describe("GET /ws", () => {
    test("returns ok status with manager state", async () => {
      // Act
      const res = await app.inject({ method: "GET", url: "/ws" });

      // Assert
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe("ok");
      expect(body.protocol).toBe("websocket");
      expect(body.connected).toBe(0);
      expect(body.subscriptions).toBe(0);
    });
  });

  // ── POST /ws/subscribe ──────────────────────────────────────────

  describe("POST /ws/subscribe", () => {
    test("subscribes a client with valid mock token", async () => {
      // Arrange
      const payload = {
        token: "mock-tenant1-user1",
        collection: "users",
        events: ["create", "update"],
      };

      // Act
      const res = await app.inject({
        method: "POST",
        url: "/ws/subscribe",
        payload,
      });

      // Assert
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toMatchObject({
        type: "subscribed",
        collection: "users",
        events: ["create", "update"],
      });
    });

    test("returns 401 for invalid token", async () => {
      // Act
      const res = await app.inject({
        method: "POST",
        url: "/ws/subscribe",
        payload: {
          token: "bad-token",
          collection: "users",
          events: ["create"],
        },
      });

      // Assert
      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.type).toBe("error");
    });

    test("returns 400 when token is missing", async () => {
      // Act
      const res = await app.inject({
        method: "POST",
        url: "/ws/subscribe",
        payload: { collection: "users", events: ["create"] },
      });

      // Assert
      expect(res.statusCode).toBe(400);
    });

    test("returns 400 when collection is missing", async () => {
      // Act
      const res = await app.inject({
        method: "POST",
        url: "/ws/subscribe",
        payload: { token: "mock-tenant1-user1", events: ["create"] },
      });

      // Assert
      expect(res.statusCode).toBe(400);
    });

    test("tracks connected clients via wsManager", async () => {
      // Arrange
      await app.inject({
        method: "POST",
        url: "/ws/subscribe",
        payload: {
          token: "mock-tenant1-u2",
          collection: "orders",
          events: ["update"],
        },
      });

      // Act
      const res = await app.inject({ method: "GET", url: "/ws" });
      const body = res.json();

      // Assert
      expect(body.connected).toBeGreaterThanOrEqual(1);
    });
  });

  // ── POST /ws/unsubscribe ────────────────────────────────────────

  describe("POST /ws/unsubscribe", () => {
    test("unsubscribes from a collection", async () => {
      // Arrange — subscribe first
      await app.inject({
        method: "POST",
        url: "/ws/subscribe",
        payload: {
          token: "mock-tenant1-u3",
          collection: "items",
          events: ["create"],
        },
      });

      // Act
      const res = await app.inject({
        method: "POST",
        url: "/ws/unsubscribe",
        payload: {
          token: "mock-tenant1-u3",
          collection: "items",
        },
      });

      // Assert
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toMatchObject({
        type: "unsubscribed",
        collection: "items",
      });
    });

    test("returns 400 when token is missing", async () => {
      // Act
      const res = await app.inject({
        method: "POST",
        url: "/ws/unsubscribe",
        payload: { collection: "users" },
      });

      // Assert
      expect(res.statusCode).toBe(400);
    });
  });

  // ── wsManager decoration ─────────────────────────────────────────

  test("decorates fastify with wsManager", () => {
    // Arrange — app should have wsManager after plugin registration
    // Act
    const mgr = app.wsManager;

    // Assert
    expect(mgr).toBeDefined();
    expect(typeof mgr.registerClient).toBe("function");
    expect(typeof mgr.handleChangeEvent).toBe("function");
  });
});
