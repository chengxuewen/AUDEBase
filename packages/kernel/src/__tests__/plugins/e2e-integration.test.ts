import { describe, test, expect } from "vitest";
import Fastify from "fastify";
import { ErrorCode, UserError } from "@audebase/shared-types";
import rbacPlugin, { rbacGuard } from "../../plugins/rbac";
import auditPlugin from "../../plugins/audit";
import i18nPlugin from "../../plugins/i18n";
import type { AuditDatabase, AuditEvent } from "@audebase/audit";

// ---- helpers ----

interface MockDrizzleDb {
  execute: () => Promise<{ rows: unknown[] }>;
}

function createMockRbacDb(canResult: boolean): MockDrizzleDb {
  return {
    execute: async () => ({
      rows: canResult ? [{ "1": 1 }] : [],
    }),
  };
}

function createMockAuditDb(): { db: AuditDatabase; events: AuditEvent[] } {
  const events: AuditEvent[] = [];
  const db: AuditDatabase = {
    insert: async (_table, values) => {
      events.push(values as unknown as AuditEvent);
      return { rowCount: 1 };
    },
    query: { audit_log: { findMany: async () => [] } },
    delete: async () => 0,
  };
  return { db, events };
}

async function createFullTestApp(canResult = true) {
  const app = Fastify({ logger: false });
  const { db: auditDb, events: auditEvents } = createMockAuditDb();

  app.setErrorHandler((rawError: unknown, _request, reply) => {
    if (rawError instanceof UserError) {
      const statusMap: Record<string, number> = {
        [ErrorCode.FORBIDDEN]: 403,
        [ErrorCode.AUTH_TOKEN_INVALID]: 401,
      };
      return reply.status(statusMap[rawError.code] ?? 500).send({
        error: rawError.toJSON(),
      });
    }
    return reply.status(500).send({ error: { code: "INTERNAL", message: "internal" } });
  });

  await app.register(rbacPlugin, { db: createMockRbacDb(canResult) as never });
  await app.register(auditPlugin, { db: auditDb });
  await app.register(i18nPlugin, { config: { defaultLocale: "zh" } });

  app.addHook("onRequest", async (request) => {
    request.user = {
      userId: "user-1",
      tenantId: "t1",
      username: "admin",
      roles: ["admin"],
      tokenVersion: 1,
    };
  });

  app.get("/api/users", { preHandler: rbacGuard("read", "user") }, async (request) => ({
    message: request.t("auth.login_success"),
  }));

  app.post("/api/users", async (_request, reply) => {
    return reply.status(201).send({ id: "u1", name: "test" });
  });

  return { app, auditEvents };
}

describe("Round 1 E2E: RBAC + Audit + i18n", () => {
  test("protected route 200 with RBAC + i18n", async () => {
    const { app } = await createFullTestApp(true);
    const res = await app.inject({
      method: "GET",
      url: "/api/users",
      headers: { "accept-language": "zh-CN" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toBe("登录成功");
    await app.close();
  });

  test("protected route 403 when RBAC denies", async () => {
    const { app } = await createFullTestApp(false);
    const res = await app.inject({ method: "GET", url: "/api/users" });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  test("POST triggers audit event", async () => {
    const { app, auditEvents } = await createFullTestApp(true);
    await app.inject({ method: "POST", url: "/api/users", payload: { name: "test" } });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(auditEvents.length).toBeGreaterThanOrEqual(1);
    await app.close();
  });

  test("GET skips audit", async () => {
    const { app, auditEvents } = await createFullTestApp(true);
    const before = auditEvents.length;
    await app.inject({ method: "GET", url: "/api/users" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(auditEvents.length).toBe(before);
    await app.close();
  });
});
