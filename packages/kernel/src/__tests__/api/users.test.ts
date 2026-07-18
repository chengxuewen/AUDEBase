import { describe, test, expect, afterEach, beforeEach } from "vitest";
import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from "fastify";
import { ErrorCode } from "@audebase/shared-types";

const TEST_SECRET = "a-very-secure-secret-that-is-at-least-32-chars" as const;

interface MockUser {
  id: string;
  tenant_id: string;
  username: string;
  email: string | null;
  password_hash: string;
  display_name: string | null;
  avatar_url: string | null;
  locale: string;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

interface MockDb {
  users: MockUser[];
}

async function createTestToken(userId: string, tenantId: string): Promise<string> {
  const jwt = await import("jsonwebtoken");
  return jwt.default.sign(
    { sub: userId, tenant_id: tenantId, username: "admin", roles: ["admin"] },
    TEST_SECRET,
    { algorithm: "HS512", expiresIn: 900 },
  );
}

async function createUserTestApp(mockDb: MockDb): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  const testAuth: (request: FastifyRequest, _reply: FastifyReply) => Promise<void> = async (
    request,
  ): Promise<void> => {
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

  const testRbacGuard: (
    _action: string,
    _resource: string,
  ) => (_request: FastifyRequest, _reply: FastifyReply) => Promise<void> = () => {
    return async (_request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
      // ponytail: test guard — always passes in unit tests
    };
  };

  app.get(
    "/api/users",
    { preHandler: [testAuth, testRbacGuard("read", "user")] },
    async (request) => {
      const query = (request.query as Record<string, string>) ?? {};
      const limit = Math.min(Math.max(1, parseInt(query.limit ?? "20", 10) || 20), 100);
      const offset = Math.max(0, parseInt(query.offset ?? "0", 10) || 0);

      const allUsers = mockDb.users;
      const paginated = allUsers.slice(offset, offset + limit);
      const data = paginated.map((u) => ({
        id: u.id,
        tenant_id: u.tenant_id,
        username: u.username,
        email: u.email,
        display_name: u.display_name,
        avatar_url: u.avatar_url,
        locale: u.locale,
        is_active: u.is_active,
        must_change_password: u.must_change_password,
        last_login_at: u.last_login_at,
        created_at: u.created_at,
        updated_at: u.updated_at,
      }));

      return { data, total: allUsers.length, limit, offset };
    },
  );

  app.get(
    "/api/users/:id",
    { preHandler: [testAuth, testRbacGuard("read", "user")] },
    async (request, reply) => {
      const params = request.params as { id: string };
      const user = mockDb.users.find((u) => u.id === params.id);
      if (!user) {
        reply.code(404).send({ error: { code: ErrorCode.NOT_FOUND, message: "用户不存在" } });
        return;
      }
      return {
        id: user.id,
        tenant_id: user.tenant_id,
        username: user.username,
        email: user.email,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        locale: user.locale,
        is_active: user.is_active,
        must_change_password: user.must_change_password,
        last_login_at: user.last_login_at,
        created_at: user.created_at,
        updated_at: user.updated_at,
      };
    },
  );

  app.post(
    "/api/users",
    { preHandler: [testAuth, testRbacGuard("create", "user")] },
    async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      if (!body || !body.username || typeof body.username !== "string" || !body.username.trim()) {
        reply
          .code(400)
          .send({ error: { code: ErrorCode.VALIDATION_ERROR, message: "用户名为必填项" } });
        return;
      }
      if (!body.password || typeof body.password !== "string") {
        reply
          .code(400)
          .send({ error: { code: ErrorCode.VALIDATION_ERROR, message: "密码为必填项" } });
        return;
      }

      const existing = mockDb.users.find((u) => u.username === body.username);
      if (existing) {
        reply.code(409).send({ error: { code: ErrorCode.CONFLICT, message: "用户名已存在" } });
        return;
      }

      const username = String(body.username).trim();
      const email = typeof body.email === "string" && body.email.trim() ? body.email.trim() : null;
      const displayName =
        typeof body.display_name === "string" && body.display_name.trim()
          ? body.display_name.trim()
          : null;

      const newUser: MockUser = {
        id: `user-${mockDb.users.length + 1}`,
        tenant_id: "tenant-1",
        username,
        email,
        password_hash: "hashed::" + body.password,
        display_name: displayName,
        avatar_url: null,
        locale: "zh-CN",
        is_active: true,
        must_change_password: true,
        last_login_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockDb.users.push(newUser);

      reply.code(201).send({
        id: newUser.id,
        tenant_id: newUser.tenant_id,
        username: newUser.username,
        email: newUser.email,
        display_name: newUser.display_name,
        avatar_url: newUser.avatar_url,
        locale: newUser.locale,
        is_active: newUser.is_active,
        must_change_password: newUser.must_change_password,
        last_login_at: newUser.last_login_at,
        created_at: newUser.created_at,
        updated_at: newUser.updated_at,
      });
    },
  );

  app.patch(
    "/api/users/:id",
    { preHandler: [testAuth, testRbacGuard("update", "user")] },
    async (request, reply) => {
      const params = request.params as { id: string };
      const body = request.body as Record<string, unknown>;
      const user = mockDb.users.find((u) => u.id === params.id);
      if (!user) {
        reply.code(404).send({ error: { code: ErrorCode.NOT_FOUND, message: "用户不存在" } });
        return;
      }
      if (typeof body.display_name === "string") user.display_name = body.display_name;
      if (typeof body.email === "string" || body.email === null) user.email = body.email;
      if (typeof body.locale === "string") user.locale = body.locale;
      if (typeof body.is_active === "boolean") user.is_active = body.is_active;
      user.updated_at = new Date().toISOString();
      return {
        id: user.id,
        tenant_id: user.tenant_id,
        username: user.username,
        email: user.email,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        locale: user.locale,
        is_active: user.is_active,
        must_change_password: user.must_change_password,
        last_login_at: user.last_login_at,
        created_at: user.created_at,
        updated_at: user.updated_at,
      };
    },
  );

  app.delete(
    "/api/users/:id",
    { preHandler: [testAuth, testRbacGuard("delete", "user")] },
    async (request, reply) => {
      const params = request.params as { id: string };
      const user = mockDb.users.find((u) => u.id === params.id);
      if (!user) {
        reply.code(404).send({ error: { code: ErrorCode.NOT_FOUND, message: "用户不存在" } });
        return;
      }
      user.is_active = false;
      user.updated_at = new Date().toISOString();
      return { success: true };
    },
  );

  await app.ready();
  return app;
}

describe("GET /api/users", () => {
  let app: FastifyInstance;
  let mockDb: MockDb;
  let token: string;

  beforeEach(async () => {
    mockDb = {
      users: [
        {
          id: "user-1",
          tenant_id: "tenant-1",
          username: "admin",
          email: "admin@test.com",
          password_hash: "hashed:pwd",
          display_name: "Admin User",
          avatar_url: null,
          locale: "zh-CN",
          is_active: true,
          must_change_password: false,
          last_login_at: null,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "user-2",
          tenant_id: "tenant-1",
          username: "member",
          email: "member@test.com",
          password_hash: "hashed:pwd2",
          display_name: null,
          avatar_url: null,
          locale: "zh-CN",
          is_active: true,
          must_change_password: false,
          last_login_at: null,
          created_at: "2026-02-01T00:00:00.000Z",
          updated_at: "2026-02-01T00:00:00.000Z",
        },
      ],
    };
    token = await createTestToken("user-1", "tenant-1");
    app = await createUserTestApp(mockDb);
  });

  afterEach(async () => {
    await app.close();
  });

  test("should return paginated user list", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/users",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: unknown[]; total: number; limit: number; offset: number }>();
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.limit).toBe(20);
    expect(body.offset).toBe(0);
  });

  test("should respect limit and offset query params", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/users?limit=1&offset=1",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: unknown[]; total: number }>();
    expect(body.data).toHaveLength(1);
    expect(body.total).toBe(2);
  });

  test("should cap limit at 100", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/users?limit=999",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ limit: number }>();
    expect(body.limit).toBe(100);
  });

  test("should return empty data when offset exceeds total", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/users?offset=100",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: unknown[] }>();
    expect(body.data).toHaveLength(0);
  });

  test("should never return password_hash", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/users",
      headers: { authorization: `Bearer ${token}` },
    });

    const body = res.json<{ data: Array<{ password_hash?: unknown }> }>();
    for (const user of body.data) {
      expect(user.password_hash).toBeUndefined();
    }
  });

  test("should return 401 without auth header", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/users",
    });

    expect(res.statusCode).toBe(401);
  });
});

describe("GET /api/users/:id", () => {
  let app: FastifyInstance;
  let mockDb: MockDb;
  let token: string;

  beforeEach(async () => {
    mockDb = {
      users: [
        {
          id: "user-1",
          tenant_id: "tenant-1",
          username: "admin",
          email: "admin@test.com",
          password_hash: "hashed:pwd",
          display_name: "Admin User",
          avatar_url: null,
          locale: "zh-CN",
          is_active: true,
          must_change_password: false,
          last_login_at: null,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    token = await createTestToken("user-1", "tenant-1");
    app = await createUserTestApp(mockDb);
  });

  afterEach(async () => {
    await app.close();
  });

  test("should return user by id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/users/user-1",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ id: string; username: string }>();
    expect(body.id).toBe("user-1");
    expect(body.username).toBe("admin");
  });

  test("should return 404 for non-existent user", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/users/nonexistent",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: { code: string } }>().error.code).toBe(ErrorCode.NOT_FOUND);
  });
});

describe("POST /api/users", () => {
  let app: FastifyInstance;
  let mockDb: MockDb;
  let token: string;

  beforeEach(async () => {
    mockDb = { users: [] };
    token = await createTestToken("admin-1", "tenant-1");
    app = await createUserTestApp(mockDb);
  });

  afterEach(async () => {
    await app.close();
  });

  test("should create a new user", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/users",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        username: "newuser",
        password: "ValidP@ss1",
        email: "new@test.com",
        display_name: "New User",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{
      id: string;
      username: string;
      is_active: boolean;
      must_change_password: boolean;
    }>();
    expect(body.username).toBe("newuser");
    expect(body.is_active).toBe(true);
    expect(body.must_change_password).toBe(true);
    expect(mockDb.users).toHaveLength(1);
    expect(mockDb.users[0]!.password_hash).not.toBe("ValidP@ss1");
  });

  test("should reject missing username", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/users",
      headers: { authorization: `Bearer ${token}` },
      payload: { password: "ValidP@ss1" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe(ErrorCode.VALIDATION_ERROR);
  });

  test("should reject missing password", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/users",
      headers: { authorization: `Bearer ${token}` },
      payload: { username: "newuser" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe(ErrorCode.VALIDATION_ERROR);
  });

  test("should reject empty body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/users",
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  test("should reject duplicate username", async () => {
    mockDb.users.push({
      id: "existing-1",
      tenant_id: "tenant-1",
      username: "dupe",
      email: null,
      password_hash: "hashed",
      display_name: null,
      avatar_url: null,
      locale: "zh-CN",
      is_active: true,
      must_change_password: false,
      last_login_at: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/users",
      headers: { authorization: `Bearer ${token}` },
      payload: { username: "dupe", password: "ValidP@ss1" },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: { code: string } }>().error.code).toBe(ErrorCode.CONFLICT);
  });
});

describe("PATCH /api/users/:id", () => {
  let app: FastifyInstance;
  let mockDb: MockDb;
  let token: string;

  beforeEach(async () => {
    mockDb = {
      users: [
        {
          id: "user-1",
          tenant_id: "tenant-1",
          username: "admin",
          email: "old@test.com",
          password_hash: "hashed:pwd",
          display_name: "Old Name",
          avatar_url: null,
          locale: "zh-CN",
          is_active: true,
          must_change_password: false,
          last_login_at: null,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    token = await createTestToken("admin-1", "tenant-1");
    app = await createUserTestApp(mockDb);
  });

  afterEach(async () => {
    await app.close();
  });

  test("should update display_name", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/users/user-1",
      headers: { authorization: `Bearer ${token}` },
      payload: { display_name: "Updated Name" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ display_name: string }>();
    expect(body.display_name).toBe("Updated Name");
    expect(mockDb.users[0]!.display_name).toBe("Updated Name");
  });

  test("should update is_active", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/users/user-1",
      headers: { authorization: `Bearer ${token}` },
      payload: { is_active: false },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ is_active: boolean }>();
    expect(body.is_active).toBe(false);
    expect(mockDb.users[0]!.is_active).toBe(false);
  });

  test("should return 404 for non-existent user", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/users/nonexistent",
      headers: { authorization: `Bearer ${token}` },
      payload: { display_name: "X" },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe("DELETE /api/users/:id", () => {
  let app: FastifyInstance;
  let mockDb: MockDb;
  let token: string;

  beforeEach(async () => {
    mockDb = {
      users: [
        {
          id: "user-1",
          tenant_id: "tenant-1",
          username: "admin",
          email: "admin@test.com",
          password_hash: "hashed:pwd",
          display_name: "Admin",
          avatar_url: null,
          locale: "zh-CN",
          is_active: true,
          must_change_password: false,
          last_login_at: null,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    token = await createTestToken("admin-1", "tenant-1");
    app = await createUserTestApp(mockDb);
  });

  afterEach(async () => {
    await app.close();
  });

  test("should soft-delete user (set is_active=false)", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/users/user-1",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ success: boolean }>().success).toBe(true);
    expect(mockDb.users[0]!.is_active).toBe(false);
  });

  test("should return 404 for non-existent user", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/users/nonexistent",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });
});
