import { describe, test, expect } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { ErrorCode, UserError } from "@audebase/shared-types";
import rbacPlugin, { rbacGuard, getEngine } from "../../plugins/rbac";

// ------------------------------------------------------------------ helpers

/**
 * Create a mock NodePgDatabase whose `execute()` returns rows when
 * `canResult` is true, and an empty array otherwise.
 *
 * PermissionEngine.can() calls `db.execute(sql\`...\`)` and checks
 * `result.rows.length > 0`.
 */
function createMockDb(canResult: boolean): NodePgDatabase {
  return {
    execute: async () => ({
      rows: canResult ? [{ "1": 1 }] : [],
    }),
  } as unknown as NodePgDatabase;
}

/** Map ErrorCode → HTTP status for the test error handler */
function mapErrorToHttp(code: ErrorCode): number {
  const map: Record<string, number> = {
    [ErrorCode.FORBIDDEN]: 403,
    [ErrorCode.AUTH_TOKEN_INVALID]: 401,
    [ErrorCode.GENERAL_INTERNAL_ERROR]: 500,
  };
  return map[code] ?? 500;
}

/**
 * Create a Fastify test instance with a UserError‑aware error handler.
 */
async function createTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  app.setErrorHandler((error: unknown, _request, reply) => {
    if (error instanceof UserError) {
      return reply.status(mapErrorToHttp(error.code)).send({
        error: error.toJSON(),
      });
    }
    return reply.status(500).send({
      error: { code: ErrorCode.GENERAL_INTERNAL_ERROR, message: "服务器内部错误" },
    });
  });

  return app;
}

// --------------------------------------------------------------- test suite

describe("rbacPlugin", () => {
  test("registers and decorates fastify with permission engine", async () => {
    // Arrange
    const app = await createTestApp();
    const db = createMockDb(true);

    // Act
    await app.register(rbacPlugin, { db });
    await app.ready();

    // Assert
    expect(app.permission).toBeDefined();
    expect(getEngine()).toBe(app.permission);

    await app.close();
  });

  test("decorates request with rbac = null", async () => {
    // Arrange
    const app = await createTestApp();
    const db = createMockDb(true);
    await app.register(rbacPlugin, { db });

    let capturedRbac: unknown = undefined;
    app.get("/test-rbac-decorator", async (request) => {
      capturedRbac = request.rbac;
      return { ok: true };
    });
    await app.ready();

    // Act
    await app.inject({ method: "GET", url: "/test-rbac-decorator" });

    // Assert
    expect(capturedRbac).toBeNull();

    await app.close();
  });
});

describe("rbacGuard", () => {
  test("grants access when user has the required permission", async () => {
    // Arrange
    const app = await createTestApp();
    const db = createMockDb(true); // engine.can returns true
    await app.register(rbacPlugin, { db });

    app.get(
      "/protected",
      {
        preHandler: [
          async (request) => {
            request.user = {
              userId: "user-1",
              tenantId: "tenant-1",
              username: "admin",
              roles: ["admin"],
              tokenVersion: 1,
            };
          },
          rbacGuard("read", "user"),
        ],
      },
      async () => ({ ok: true }),
    );
    await app.ready();

    // Act
    const res = await app.inject({ method: "GET", url: "/protected" });

    // Assert
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });

    await app.close();
  });

  test("denies with 403 when user lacks the required permission", async () => {
    // Arrange
    const app = await createTestApp();
    const db = createMockDb(false); // engine.can returns false
    await app.register(rbacPlugin, { db });

    app.get(
      "/protected",
      {
        preHandler: [
          async (request) => {
            request.user = {
              userId: "user-2",
              tenantId: "tenant-1",
              username: "member",
              roles: ["member"],
              tokenVersion: 1,
            };
          },
          rbacGuard("delete", "user"),
        ],
      },
      async () => ({ ok: true }),
    );
    await app.ready();

    // Act
    const res = await app.inject({ method: "GET", url: "/protected" });

    // Assert
    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect((body as Record<string, unknown>).error).toBeDefined();

    await app.close();
  });

  test("throws 401 when request.user is not set by auth middleware", async () => {
    // Arrange
    const app = await createTestApp();
    const db = createMockDb(true);
    await app.register(rbacPlugin, { db });

    // No auth preHandler — request.user stays undefined
    app.get("/no-auth", { preHandler: rbacGuard("read", "user") }, async () => ({ ok: true }));
    await app.ready();

    // Act
    const res = await app.inject({ method: "GET", url: "/no-auth" });

    // Assert
    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect((body as Record<string, unknown>).error).toBeDefined();

    await app.close();
  });

  test("works with different action / resource combinations", async () => {
    // Arrange
    const app = await createTestApp();
    const db = createMockDb(true);
    await app.register(rbacPlugin, { db });

    // route 1: create document
    app.get(
      "/create-doc",
      {
        preHandler: [
          async (request) => {
            request.user = {
              userId: "user-1",
              tenantId: "tenant-1",
              username: "editor",
              roles: ["editor"],
              tokenVersion: 1,
            };
          },
          rbacGuard("create", "document"),
        ],
      },
      async () => ({ action: "created" }),
    );

    // route 2: read report
    app.get(
      "/read-report",
      {
        preHandler: [
          async (request) => {
            request.user = {
              userId: "user-1",
              tenantId: "tenant-1",
              username: "editor",
              roles: ["editor"],
              tokenVersion: 1,
            };
          },
          rbacGuard("read", "report"),
        ],
      },
      async () => ({ action: "read" }),
    );
    await app.ready();

    // Act
    const res1 = await app.inject({ method: "GET", url: "/create-doc" });
    const res2 = await app.inject({ method: "GET", url: "/read-report" });

    // Assert
    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    expect(res1.json()).toEqual({ action: "created" });
    expect(res2.json()).toEqual({ action: "read" });

    await app.close();
  });

  test("returns 403 with localized error message '无权限'", async () => {
    // Arrange
    const app = await createTestApp();
    const db = createMockDb(false);
    await app.register(rbacPlugin, { db });

    app.get(
      "/no-perm",
      {
        preHandler: [
          async (request) => {
            request.user = {
              userId: "user-3",
              tenantId: "tenant-1",
              username: "guest",
              roles: [],
              tokenVersion: 1,
            };
          },
          rbacGuard("write", "settings"),
        ],
      },
      async () => ({ ok: true }),
    );
    await app.ready();

    // Act
    const res = await app.inject({ method: "GET", url: "/no-perm" });

    // Assert
    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.error.code).toBe(ErrorCode.FORBIDDEN);
    expect(body.error.message).toBe("无权限");

    await app.close();
  });
});
