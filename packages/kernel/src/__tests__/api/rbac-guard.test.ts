import { describe, test, expect } from "vitest";
import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { ErrorCode, UserError } from "@audebase/shared-types";
import rbacPlugin, { rbacGuard } from "../../plugins/rbac";
import { Permissions, Resources } from "../../auth/permissions";

// ------------------------------------------------------------------ helpers

/**
 * Create a mock NodePgDatabase whose `execute()` returns rows when
 * `canResult` is true, and an empty array otherwise.
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
 * Create a Fastify test instance with RBAC plugin and UserError-aware
 * error handler.
 */
async function createTestApp(canResult: boolean) {
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

  await app.register(rbacPlugin, { db: createMockDb(canResult) });

  return app;
}

/** Auth preHandler that simulates a logged-in user */
function mockAuth(user: {
  userId: string;
  tenantId: string;
  username: string;
  roles: string[];
}): (request: FastifyRequest, _reply: FastifyReply) => Promise<void> {
  return async (request: FastifyRequest): Promise<void> => {
    request.user = {
      userId: user.userId,
      tenantId: user.tenantId,
      username: user.username,
      roles: user.roles,
      tokenVersion: 1,
    };
  };
}

// ================================================================= test suites

describe("RBAC Guard — E2E enforcement with permission constants", () => {
  describe("admin user (canResult=true) — all routes accessible", () => {
    const ADMIN_USER = {
      userId: "admin-1",
      tenantId: "tenant-1",
      username: "admin",
      roles: ["admin"],
    };

    test("GET /api/users — 200 with Users:Read", async () => {
      const app = await createTestApp(true);

      app.get(
        "/api/users",
        {
          preHandler: [mockAuth(ADMIN_USER), rbacGuard(Permissions.USERS_READ, Resources.USER)],
        },
        async () => ({ ok: true }),
      );

      await app.ready();
      const res = await app.inject({ method: "GET", url: "/api/users" });

      expect(res.statusCode).toBe(200);
      await app.close();
    });

    test("POST /api/users — 200 with Users:Create", async () => {
      const app = await createTestApp(true);

      app.post(
        "/api/users",
        {
          preHandler: [mockAuth(ADMIN_USER), rbacGuard(Permissions.USERS_CREATE, Resources.USER)],
        },
        async () => ({ ok: true }),
      );

      await app.ready();
      const res = await app.inject({ method: "POST", url: "/api/users" });

      expect(res.statusCode).toBe(200);
      await app.close();
    });

    test("PATCH /api/users/:id — 200 with Users:Update", async () => {
      const app = await createTestApp(true);

      app.patch(
        "/api/users/:id",
        {
          preHandler: [mockAuth(ADMIN_USER), rbacGuard(Permissions.USERS_UPDATE, Resources.USER)],
        },
        async () => ({ ok: true }),
      );

      await app.ready();
      const res = await app.inject({ method: "PATCH", url: "/api/users/user-1" });

      expect(res.statusCode).toBe(200);
      await app.close();
    });

    test("DELETE /api/users/:id — 200 with Users:Delete", async () => {
      const app = await createTestApp(true);

      app.delete(
        "/api/users/:id",
        {
          preHandler: [mockAuth(ADMIN_USER), rbacGuard(Permissions.USERS_DELETE, Resources.USER)],
        },
        async () => ({ ok: true }),
      );

      await app.ready();
      const res = await app.inject({ method: "DELETE", url: "/api/users/user-1" });

      expect(res.statusCode).toBe(200);
      await app.close();
    });

    test("GET /api/roles — 200 with Roles:Read", async () => {
      const app = await createTestApp(true);

      app.get(
        "/api/roles",
        {
          preHandler: [mockAuth(ADMIN_USER), rbacGuard(Permissions.ROLES_READ, Resources.ROLE)],
        },
        async () => ({ ok: true }),
      );

      await app.ready();
      const res = await app.inject({ method: "GET", url: "/api/roles" });

      expect(res.statusCode).toBe(200);
      await app.close();
    });

    test("POST /api/roles — 200 with Roles:Create", async () => {
      const app = await createTestApp(true);

      app.post(
        "/api/roles",
        {
          preHandler: [mockAuth(ADMIN_USER), rbacGuard(Permissions.ROLES_CREATE, Resources.ROLE)],
        },
        async () => ({ ok: true }),
      );

      await app.ready();
      const res = await app.inject({ method: "POST", url: "/api/roles" });

      expect(res.statusCode).toBe(200);
      await app.close();
    });

    test("DELETE /api/roles/:id — 200 with Roles:Delete", async () => {
      const app = await createTestApp(true);

      app.delete(
        "/api/roles/:id",
        {
          preHandler: [mockAuth(ADMIN_USER), rbacGuard(Permissions.ROLES_DELETE, Resources.ROLE)],
        },
        async () => ({ ok: true }),
      );

      await app.ready();
      const res = await app.inject({ method: "DELETE", url: "/api/roles/role-1" });

      expect(res.statusCode).toBe(200);
      await app.close();
    });
  });

  describe("restricted user (canResult=false) — write routes denied", () => {
    const MEMBER_USER = {
      userId: "member-1",
      tenantId: "tenant-1",
      username: "member",
      roles: ["member"],
    };

    test("GET /api/users — 200 with Users:Read (member has read)", async () => {
      // ponytail: member in this mock HAS read permission
      const app = await createTestApp(true); // true = can read

      app.get(
        "/api/users",
        {
          preHandler: [mockAuth(MEMBER_USER), rbacGuard(Permissions.USERS_READ, Resources.USER)],
        },
        async () => ({ ok: true }),
      );

      await app.ready();
      const res = await app.inject({ method: "GET", url: "/api/users" });

      expect(res.statusCode).toBe(200);
      await app.close();
    });

    test("POST /api/users — 403 when lacking Users:Create", async () => {
      const app = await createTestApp(false); // false = cannot create

      app.post(
        "/api/users",
        {
          preHandler: [mockAuth(MEMBER_USER), rbacGuard(Permissions.USERS_CREATE, Resources.USER)],
        },
        async () => ({ ok: true }),
      );

      await app.ready();
      const res = await app.inject({ method: "POST", url: "/api/users" });

      expect(res.statusCode).toBe(403);
      const body = res.json<{ error: { code: string; message: string } }>();
      expect(body.error.code).toBe(ErrorCode.FORBIDDEN);
      expect(body.error.message).toBe("无权限");
      await app.close();
    });

    test("PATCH /api/users/:id — 403 when lacking Users:Update", async () => {
      const app = await createTestApp(false);

      app.patch(
        "/api/users/:id",
        {
          preHandler: [mockAuth(MEMBER_USER), rbacGuard(Permissions.USERS_UPDATE, Resources.USER)],
        },
        async () => ({ ok: true }),
      );

      await app.ready();
      const res = await app.inject({ method: "PATCH", url: "/api/users/user-1" });

      expect(res.statusCode).toBe(403);
      await app.close();
    });

    test("DELETE /api/users/:id — 403 when lacking Users:Delete", async () => {
      const app = await createTestApp(false);

      app.delete(
        "/api/users/:id",
        {
          preHandler: [mockAuth(MEMBER_USER), rbacGuard(Permissions.USERS_DELETE, Resources.USER)],
        },
        async () => ({ ok: true }),
      );

      await app.ready();
      const res = await app.inject({ method: "DELETE", url: "/api/users/user-1" });

      expect(res.statusCode).toBe(403);
      await app.close();
    });

    test("POST /api/roles — 403 when lacking Roles:Create", async () => {
      const app = await createTestApp(false);

      app.post(
        "/api/roles",
        {
          preHandler: [mockAuth(MEMBER_USER), rbacGuard(Permissions.ROLES_CREATE, Resources.ROLE)],
        },
        async () => ({ ok: true }),
      );

      await app.ready();
      const res = await app.inject({ method: "POST", url: "/api/roles" });

      expect(res.statusCode).toBe(403);
      await app.close();
    });

    test("DELETE /api/roles/:id — 403 when lacking Roles:Delete", async () => {
      const app = await createTestApp(false);

      app.delete(
        "/api/roles/:id",
        {
          preHandler: [mockAuth(MEMBER_USER), rbacGuard(Permissions.ROLES_DELETE, Resources.ROLE)],
        },
        async () => ({ ok: true }),
      );

      await app.ready();
      const res = await app.inject({ method: "DELETE", url: "/api/roles/role-1" });

      expect(res.statusCode).toBe(403);
      await app.close();
    });

    test("GET /api/roles — 200 with Roles:Read (member has read)", async () => {
      const app = await createTestApp(true);

      app.get(
        "/api/roles",
        {
          preHandler: [mockAuth(MEMBER_USER), rbacGuard(Permissions.ROLES_READ, Resources.ROLE)],
        },
        async () => ({ ok: true }),
      );

      await app.ready();
      const res = await app.inject({ method: "GET", url: "/api/roles" });

      expect(res.statusCode).toBe(200);
      await app.close();
    });
  });

  describe("unauthenticated user — 401", () => {
    test("returns 401 when request.user is not set", async () => {
      const app = await createTestApp(false);

      // No auth preHandler — request.user stays undefined
      app.get(
        "/api/users",
        {
          preHandler: rbacGuard(Permissions.USERS_READ, Resources.USER),
        },
        async () => ({ ok: true }),
      );

      await app.ready();
      const res = await app.inject({ method: "GET", url: "/api/users" });

      expect(res.statusCode).toBe(401);
      const body = res.json<{ error: { code: string } }>();
      expect(body.error.code).toBe(ErrorCode.AUTH_TOKEN_INVALID);
      await app.close();
    });
  });
});

describe("Permission constants — exhaustive coverage", () => {
  test("all CRUD operations for users are defined", () => {
    expect(Permissions.USERS_READ).toBe("users:read");
    expect(Permissions.USERS_CREATE).toBe("users:create");
    expect(Permissions.USERS_UPDATE).toBe("users:update");
    expect(Permissions.USERS_DELETE).toBe("users:delete");
  });

  test("all CRUD operations for roles are defined", () => {
    expect(Permissions.ROLES_READ).toBe("roles:read");
    expect(Permissions.ROLES_CREATE).toBe("roles:create");
    expect(Permissions.ROLES_UPDATE).toBe("roles:update");
    expect(Permissions.ROLES_DELETE).toBe("roles:delete");
  });

  test("resources are defined", () => {
    expect(Resources.USER).toBe("user");
    expect(Resources.ROLE).toBe("role");
    expect(Resources.PLUGIN).toBe("plugin");
    expect(Resources.AUDIT).toBe("audit_log");
    expect(Resources.HEALTH).toBe("health");
  });
});
