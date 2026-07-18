import { describe, test, expect, beforeAll, afterAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { ErrorCode, UserError } from "@audebase/shared-types";
import type { AuditDatabase, AuditEvent } from "@audebase/audit";
import auditPlugin from "../../plugins/audit";

// ---- helpers ----

/** Mock AuditDatabase that records logged events */
function createMockAuditDb(): { db: AuditDatabase; events: AuditEvent[] } {
  const events: AuditEvent[] = [];

  const db: AuditDatabase = {
    insert: async (_table: string, values: Record<string, unknown>): Promise<unknown> => {
      events.push(values as unknown as AuditEvent);
      return { rowCount: 1 };
    },
    query: {
      audit_log: {
        findMany: async () => [],
      },
    },
    delete: async () => 0,
  };

  return { db, events };
}

/** Create a Fastify test app with all routes pre-registered */
async function createTestApp(mockAuditDb: AuditDatabase): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  app.setErrorHandler((rawError: unknown, _request, reply) => {
    if (rawError instanceof UserError) {
      const statusMap: Record<string, number> = {
        [ErrorCode.FORBIDDEN]: 403,
        [ErrorCode.AUTH_TOKEN_INVALID]: 401,
        [ErrorCode.GENERAL_INTERNAL_ERROR]: 500,
      };
      return reply.status(statusMap[rawError.code] ?? 500).send({
        error: rawError.toJSON(),
      });
    }
    return reply.status(500).send({ error: { code: "INTERNAL", message: "internal" } });
  });

  await app.register(auditPlugin, { db: mockAuditDb });

  // Register all routes before any inject call
  app.post("/api/users", async (_request, reply) => {
    return reply.status(201).send({ id: "u1", name: "Alice" });
  });

  app.get("/api/users", async () => ({ data: [] }));

  app.get("/api/health", async () => ({ status: "ok" }));

  app.delete("/api/users/error", async (_request, reply) => {
    return reply.status(400).send({ error: "bad request" });
  });

  app.put("/api/users/u2", async (_request, reply) => {
    return reply.send({ id: "u2", name: "Bob" });
  });

  return app;
}

describe("auditPlugin", () => {
  let app: FastifyInstance;
  const { db: mockDb, events } = createMockAuditDb();

  beforeAll(async () => {
    app = await createTestApp(mockDb);
  });

  afterAll(async () => {
    await app.close();
  });

  test("decorates fastify with audit service", () => {
    expect(app.audit).toBeDefined();
    expect(typeof app.audit.log).toBe("function");
  });

  test("captures POST request (201)", async () => {
    await app.inject({ method: "POST", url: "/api/users", payload: { name: "Alice" } });

    // Wait for async audit capture
    await new Promise((resolve) => setTimeout(resolve, 50));

    const auditEvents = events.filter((e: AuditEvent) => e.resource_type !== "unknown");
    expect(auditEvents.length).toBeGreaterThanOrEqual(1);
  });

  test("skips GET requests", async () => {
    const before = events.length;

    await app.inject({ method: "GET", url: "/api/users" });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(events.length).toBe(before);
  });

  test("excludes /api/health", async () => {
    const before = events.length;

    await app.inject({ method: "GET", url: "/api/health" });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(events.length).toBe(before);
  });

  test("skips non-2xx responses", async () => {
    const before = events.length;

    await app.inject({ method: "DELETE", url: "/api/users/error" });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(events.length).toBe(before);
  });

  test("captures PUT request (200)", async () => {
    await app.inject({
      method: "PUT",
      url: "/api/users/u2",
      payload: { name: "Bob" },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const auditEvents = events.filter((e: AuditEvent) => e.resource_type !== "unknown");
    expect(auditEvents.length).toBeGreaterThanOrEqual(2); // POST + PUT
  });
});
