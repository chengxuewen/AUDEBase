/**
 * E2E demo test — exercises the full MVP flow end-to-end:
 *   health check → login → user CRUD → roles list
 *
 * Uses standalone Fastify app with mock routes and in-memory mock DB.
 * No real PostgreSQL required — runs everywhere, always.
 *
 * ponytail: single beforeAll creates one app for all tests,
 * chained flow in describe block order.
 */
import { describe, test, expect, afterAll, beforeAll } from "vitest";
import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from "fastify";
import { ErrorCode } from "@audebase/shared-types";
import { hashPassword } from "../auth/passwords";

const TEST_SECRET = "a-very-secure-secret-that-is-at-least-32-chars" as const;

// ── Mock DB types ───────────────────────────────────────────────

interface MockUser {
  id: string;
  tenant_id: string;
  username: string;
  password_hash: string;
  email: string | null;
  display_name: string | null;
  is_active: boolean;
  must_change_password: boolean;
}

interface MockRole {
  id: string;
  tenant_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  is_system: boolean;
}

interface MockDb {
  users: MockUser[];
  roles: MockRole[];
}

// ── Test token factory ──────────────────────────────────────────

async function createTestToken(
  userId: string,
  tenantId: string,
  username: string,
  roles: string[] = ["admin"],
): Promise<string> {
  const jwt = await import("jsonwebtoken");
  return jwt.default.sign({ sub: userId, tenant_id: tenantId, username, roles }, TEST_SECRET, {
    algorithm: "HS512",
    expiresIn: 900,
  });
}

// ── Auth guard (Bearer token verification) ──────────────────────

function createAuthGuard(): (request: FastifyRequest, _reply: FastifyReply) => Promise<void> {
  return async (request: FastifyRequest): Promise<void> => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw Object.assign(new Error("缺少认证信息"), { statusCode: 401 });
    }
    try {
      const jwt = await import("jsonwebtoken");
      const payload = jwt.default.verify(authHeader.slice(7), TEST_SECRET) as {
        sub: string;
        tenant_id: string;
        username: string;
        roles: string[];
      };
      const req = request as unknown as Record<string, unknown>;
      req.user = {
        userId: payload.sub,
        tenantId: payload.tenant_id,
        username: payload.username,
        roles: payload.roles,
      };
    } catch {
      throw Object.assign(new Error("Token 无效"), { statusCode: 401 });
    }
  };
}

// ── RBAC guard (noop for demo) ──────────────────────────────────

function createRbacGuard(): (
  _action: string,
  _resource: string,
) => (request: FastifyRequest, _reply: FastifyReply) => Promise<void> {
  return () => {
    return async (_request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
      // ponytail: demo guard — always passes
    };
  };
}

// ── App factory ─────────────────────────────────────────────────

async function createDemoApp(mockDb: MockDb): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const auth = createAuthGuard();
  const rbac = createRbacGuard();

  // ── GET /health ──────────────────────────────────────────
  app.get("/health", async () => {
    return {
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  });

  // ── POST /api/auth/login ──────────────────────────────────
  app.post("/api/auth/login", async (request, reply) => {
    const body = request.body as { username?: string; password?: string };

    if (!body || typeof body.username !== "string" || typeof body.password !== "string") {
      return reply
        .code(400)
        .send({ error: { code: ErrorCode.VALIDATION_ERROR, message: "用户名和密码为必填项" } });
    }

    const user = mockDb.users.find((u) => u.username === body.username);
    if (!user) {
      return reply.code(401).send({
        error: { code: ErrorCode.AUTH_INVALID_CREDENTIALS, message: "用户名或密码错误" },
      });
    }

    const isValid = await import("bcrypt").then((m) =>
      m.default.compare(body.password!, user.password_hash),
    );
    if (!isValid) {
      return reply.code(401).send({
        error: { code: ErrorCode.AUTH_INVALID_CREDENTIALS, message: "用户名或密码错误" },
      });
    }

    if (!user.is_active) {
      return reply
        .code(403)
        .send({ error: { code: ErrorCode.FORBIDDEN, message: "帐号已被禁用" } });
    }

    const accessToken = await createTestToken(user.id, user.tenant_id, user.username);
    return {
      access_token: accessToken,
      expires_in: 900,
      token_type: "Bearer",
      user: {
        id: user.id,
        tenant_id: user.tenant_id,
        username: user.username,
        display_name: user.display_name ?? user.username,
        must_change_password: user.must_change_password,
      },
    };
  });

  // ── GET /api/users ────────────────────────────────────────
  app.get("/api/users", { preHandler: [auth, rbac("read", "user")] }, async (request) => {
    const query = (request.query as Record<string, string>) ?? {};
    const limit = Math.min(Math.max(1, parseInt(query.limit ?? "20", 10) || 20), 100);
    const offset = Math.max(0, parseInt(query.offset ?? "0", 10) || 0);

    const data = mockDb.users.slice(offset, offset + limit).map((u) => ({
      id: u.id,
      tenant_id: u.tenant_id,
      username: u.username,
      email: u.email,
      display_name: u.display_name,
      is_active: u.is_active,
      must_change_password: u.must_change_password,
    }));

    return { data, total: mockDb.users.length, limit, offset };
  });

  // ── POST /api/users ───────────────────────────────────────
  app.post("/api/users", { preHandler: [auth, rbac("create", "user")] }, async (request, reply) => {
    const body = request.body as Record<string, unknown>;

    if (!body || !body.username || typeof body.username !== "string" || !body.username.trim()) {
      return reply
        .code(400)
        .send({ error: { code: ErrorCode.VALIDATION_ERROR, message: "用户名为必填项" } });
    }
    if (!body.password || typeof body.password !== "string") {
      return reply
        .code(400)
        .send({ error: { code: ErrorCode.VALIDATION_ERROR, message: "密码为必填项" } });
    }

    const existing = mockDb.users.find((u) => u.username === body.username);
    if (existing) {
      return reply.code(409).send({ error: { code: ErrorCode.CONFLICT, message: "用户名已存在" } });
    }

    const username = String(body.username).trim();
    const email = typeof body.email === "string" && body.email.trim() ? body.email.trim() : null;
    const displayName =
      typeof body.display_name === "string" && body.display_name.trim()
        ? body.display_name.trim()
        : null;
    const passwordHash = await hashPassword(String(body.password));

    const newUser: MockUser = {
      id: `user-${mockDb.users.length + 1}`,
      tenant_id: "tenant-1",
      username,
      email,
      password_hash: passwordHash,
      display_name: displayName,
      is_active: true,
      must_change_password: true,
    };
    mockDb.users.push(newUser);

    return reply.code(201).send({
      id: newUser.id,
      tenant_id: newUser.tenant_id,
      username: newUser.username,
      email: newUser.email,
      display_name: newUser.display_name,
      is_active: newUser.is_active,
      must_change_password: newUser.must_change_password,
    });
  });

  // ── GET /api/roles ────────────────────────────────────────
  app.get("/api/roles", { preHandler: [auth, rbac("read", "role")] }, async (request) => {
    const query = (request.query as Record<string, string>) ?? {};
    const limit = Math.min(Math.max(1, parseInt(query.limit ?? "20", 10) || 20), 100);
    const offset = Math.max(0, parseInt(query.offset ?? "0", 10) || 0);

    const data = mockDb.roles.slice(offset, offset + limit).map((r) => ({
      id: r.id,
      tenant_id: r.tenant_id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      is_system: r.is_system,
    }));

    return { data, total: mockDb.roles.length, limit, offset };
  });

  await app.ready();
  return app;
}

// ── Test suite ───────────────────────────────────────────────────

describe("E2E Demo — Full MVP Flow", () => {
  let app: FastifyInstance;
  let mockDb: MockDb;
  let adminToken: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword("Admin@123");

    mockDb = {
      users: [
        {
          id: "user-admin",
          tenant_id: "tenant-1",
          username: "admin",
          password_hash: passwordHash,
          email: "admin@audebase.local",
          display_name: "Admin User",
          is_active: true,
          must_change_password: false,
        },
      ],
      roles: [
        {
          id: "role-1",
          tenant_id: null,
          name: "管理员",
          slug: "admin",
          description: "系统管理员角色",
          is_system: true,
        },
        {
          id: "role-2",
          tenant_id: null,
          name: "普通成员",
          slug: "member",
          description: "默认成员角色",
          is_system: true,
        },
      ],
    };

    app = await createDemoApp(mockDb);
    adminToken = await createTestToken("user-admin", "tenant-1", "admin");
  }, 15000);

  afterAll(async () => {
    await app.close();
  });

  // ── Step 1: Health check ──────────────────────────────────
  test("GET /health returns ok with uptime and timestamp", async () => {
    // Arrange & Act
    const res = await app.inject({ method: "GET", url: "/health" });

    // Assert
    expect(res.statusCode).toBe(200);
    const body = res.json<{ status: string; uptime: number; timestamp: string }>();
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
    expect(typeof body.timestamp).toBe("string");
  });

  // ── Step 2: Login ─────────────────────────────────────────
  test("POST /api/auth/login with valid credentials returns JWT", async () => {
    // Arrange & Act
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "Admin@123" },
    });

    // Assert
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      access_token: string;
      expires_in: number;
      token_type: string;
      user: { id: string; username: string };
    }>();
    expect(body.access_token).toBeDefined();
    expect(body.expires_in).toBe(900);
    expect(body.token_type).toBe("Bearer");
    expect(body.user.username).toBe("admin");
    expect(body.user.id).toBe("user-admin");
  });

  test("POST /api/auth/login with wrong password returns 401", async () => {
    // Arrange & Act
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "WrongPass1!" },
    });

    // Assert
    expect(res.statusCode).toBe(401);
  });

  // ── Step 3: GET /api/users ────────────────────────────────
  test("GET /api/users returns paginated user list", async () => {
    // Arrange & Act
    const res = await app.inject({
      method: "GET",
      url: "/api/users",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    // Assert
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: unknown[]; total: number }>();
    expect(body.total).toBe(1);
    expect(body.data).toHaveLength(1);
  });

  test("GET /api/users without token returns 401", async () => {
    // Arrange & Act
    const res = await app.inject({ method: "GET", url: "/api/users" });

    // Assert
    expect(res.statusCode).toBe(401);
  });

  // ── Step 4: POST /api/users (create) ──────────────────────
  test("POST /api/users creates new user and returns 201", async () => {
    // Arrange & Act
    const res = await app.inject({
      method: "POST",
      url: "/api/users",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        username: "newmember",
        password: "ValidP@ss1",
        email: "member@audebase.local",
        display_name: "New Member",
      },
    });

    // Assert
    expect(res.statusCode).toBe(201);
    const body = res.json<{
      id: string;
      username: string;
      is_active: boolean;
      must_change_password: boolean;
    }>();
    expect(body.username).toBe("newmember");
    expect(body.is_active).toBe(true);
    expect(body.must_change_password).toBe(true);

    // Verify DB count increased
    expect(mockDb.users.length).toBe(2);
  });

  test("POST /api/users with duplicate username returns 409", async () => {
    // Arrange & Act
    const res = await app.inject({
      method: "POST",
      url: "/api/users",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username: "newmember", password: "SomePass1!" },
    });

    // Assert
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: { code: string } }>().error.code).toBe(ErrorCode.CONFLICT);
  });

  test("GET /api/users now shows 2 users", async () => {
    // Arrange & Act
    const res = await app.inject({
      method: "GET",
      url: "/api/users",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    // Assert
    expect(res.statusCode).toBe(200);
    expect(res.json<{ total: number }>().total).toBe(2);
  });

  // ── Step 5: GET /api/roles ────────────────────────────────
  test("GET /api/roles returns role list", async () => {
    // Arrange & Act
    const res = await app.inject({
      method: "GET",
      url: "/api/roles",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    // Assert
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Array<{ id: string; slug: string }>; total: number }>();
    expect(body.total).toBe(2);
    expect(body.data).toHaveLength(2);
    const slugs = body.data.map((r) => r.slug).sort();
    expect(slugs).toEqual(["admin", "member"]);
  });

  test("GET /api/roles without token returns 401", async () => {
    // Arrange & Act
    const res = await app.inject({ method: "GET", url: "/api/roles" });

    // Assert
    expect(res.statusCode).toBe(401);
  });
});
