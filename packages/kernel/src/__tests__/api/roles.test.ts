import { describe, test, expect, afterEach, beforeEach } from "vitest";
import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from "fastify";
import { ErrorCode } from "@audebase/shared-types";

const TEST_SECRET = "a-very-secure-secret-that-is-at-least-32-chars" as const;

interface MockRole {
  id: string;
  tenant_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

interface MockDb {
  roles: MockRole[];
}

async function createTestToken(userId: string, tenantId: string): Promise<string> {
  const jwt = await import("jsonwebtoken");
  return jwt.default.sign(
    { sub: userId, tenant_id: tenantId, username: "admin", roles: ["admin"] },
    TEST_SECRET,
    { algorithm: "HS512", expiresIn: 900 },
  );
}

function toRoleResponse(r: MockRole) {
  return {
    id: r.id,
    tenant_id: r.tenant_id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    is_system: r.is_system,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

async function createRoleTestApp(mockDb: MockDb): Promise<FastifyInstance> {
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
    "/api/roles",
    { preHandler: [testAuth, testRbacGuard("read", "role")] },
    async (request) => {
      const query = (request.query as Record<string, string>) ?? {};
      const limit = Math.min(Math.max(1, parseInt(query.limit ?? "20", 10) || 20), 100);
      const offset = Math.max(0, parseInt(query.offset ?? "0", 10) || 0);

      const allRoles = mockDb.roles;
      const paginated = allRoles.slice(offset, offset + limit);

      return { data: paginated.map(toRoleResponse), total: allRoles.length, limit, offset };
    },
  );

  app.get(
    "/api/roles/:id",
    { preHandler: [testAuth, testRbacGuard("read", "role")] },
    async (request, reply) => {
      const params = request.params as { id: string };
      const role = mockDb.roles.find((r) => r.id === params.id);
      if (!role) {
        reply.code(404).send({ error: { code: ErrorCode.NOT_FOUND, message: "角色不存在" } });
        return;
      }
      return toRoleResponse(role);
    },
  );

  app.post(
    "/api/roles",
    { preHandler: [testAuth, testRbacGuard("create", "role")] },
    async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      if (!body || !body.name || typeof body.name !== "string" || !body.name.trim()) {
        reply
          .code(400)
          .send({ error: { code: ErrorCode.VALIDATION_ERROR, message: "角色名称为必填项" } });
        return;
      }
      if (!body.slug || typeof body.slug !== "string" || !body.slug.trim()) {
        reply.code(400).send({
          error: { code: ErrorCode.VALIDATION_ERROR, message: "角色标识符(slug)为必填项" },
        });
        return;
      }

      const existing = mockDb.roles.find((r) => r.slug === body.slug);
      if (existing) {
        reply.code(409).send({ error: { code: ErrorCode.CONFLICT, message: "角色标识符已存在" } });
        return;
      }

      const name = String(body.name).trim();
      const slug = String(body.slug).trim();
      const description =
        typeof body.description === "string" && body.description.trim()
          ? body.description.trim()
          : null;

      const newRole: MockRole = {
        id: `role-${mockDb.roles.length + 1}`,
        tenant_id: "tenant-1",
        name,
        slug,
        description,
        is_system: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockDb.roles.push(newRole);

      reply.code(201).send(toRoleResponse(newRole));
    },
  );

  app.patch(
    "/api/roles/:id",
    { preHandler: [testAuth, testRbacGuard("update", "role")] },
    async (request, reply) => {
      const params = request.params as { id: string };
      const body = request.body as Record<string, unknown>;
      const role = mockDb.roles.find((r) => r.id === params.id);
      if (!role) {
        reply.code(404).send({ error: { code: ErrorCode.NOT_FOUND, message: "角色不存在" } });
        return;
      }
      if (role.is_system) {
        reply.code(403).send({ error: { code: ErrorCode.FORBIDDEN, message: "系统角色不可修改" } });
        return;
      }
      if (typeof body.name === "string") role.name = String(body.name);
      if (typeof body.description === "string" || body.description === null) {
        role.description = body.description;
      }
      role.updated_at = new Date().toISOString();
      return toRoleResponse(role);
    },
  );

  app.delete(
    "/api/roles/:id",
    { preHandler: [testAuth, testRbacGuard("delete", "role")] },
    async (request, reply) => {
      const params = request.params as { id: string };
      const idx = mockDb.roles.findIndex((r) => r.id === params.id);
      if (idx === -1) {
        reply.code(404).send({ error: { code: ErrorCode.NOT_FOUND, message: "角色不存在" } });
        return;
      }
      if (mockDb.roles[idx]!.is_system) {
        reply.code(403).send({ error: { code: ErrorCode.FORBIDDEN, message: "系统角色不可删除" } });
        return;
      }
      mockDb.roles.splice(idx, 1);
      return { success: true };
    },
  );

  await app.ready();
  return app;
}

describe("GET /api/roles", () => {
  let app: FastifyInstance;
  let mockDb: MockDb;
  let token: string;

  beforeEach(async () => {
    mockDb = {
      roles: [
        {
          id: "role-1",
          tenant_id: null,
          name: "管理员",
          slug: "admin",
          description: "System admin",
          is_system: true,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "role-2",
          tenant_id: "tenant-1",
          name: "成员",
          slug: "member",
          description: "Member role",
          is_system: false,
          created_at: "2026-02-01T00:00:00.000Z",
          updated_at: "2026-02-01T00:00:00.000Z",
        },
      ],
    };
    token = await createTestToken("user-1", "tenant-1");
    app = await createRoleTestApp(mockDb);
  });

  afterEach(async () => {
    await app.close();
  });

  test("should return paginated role list", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/roles",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: unknown[]; total: number; limit: number; offset: number }>();
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.limit).toBe(20);
    expect(body.offset).toBe(0);
  });

  test("should respect limit and offset", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/roles?limit=1&offset=1",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: unknown[] }>();
    expect(body.data).toHaveLength(1);
  });

  test("should require auth", async () => {
    const res = await app.inject({ method: "GET", url: "/api/roles" });

    expect(res.statusCode).toBe(401);
  });
});

describe("GET /api/roles/:id", () => {
  let app: FastifyInstance;
  let mockDb: MockDb;
  let token: string;

  beforeEach(async () => {
    mockDb = {
      roles: [
        {
          id: "role-1",
          tenant_id: null,
          name: "管理员",
          slug: "admin",
          description: null,
          is_system: true,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    token = await createTestToken("user-1", "tenant-1");
    app = await createRoleTestApp(mockDb);
  });

  afterEach(async () => {
    await app.close();
  });

  test("should return role by id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/roles/role-1",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ id: string; name: string; is_system: boolean }>();
    expect(body.id).toBe("role-1");
    expect(body.name).toBe("管理员");
    expect(body.is_system).toBe(true);
  });

  test("should return 404 for non-existent role", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/roles/nonexistent",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe("POST /api/roles", () => {
  let app: FastifyInstance;
  let mockDb: MockDb;
  let token: string;

  beforeEach(async () => {
    mockDb = { roles: [] };
    token = await createTestToken("user-1", "tenant-1");
    app = await createRoleTestApp(mockDb);
  });

  afterEach(async () => {
    await app.close();
  });

  test("should create a new role", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/roles",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "编辑者", slug: "editor", description: "Editor role" },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{ id: string; name: string; slug: string; is_system: boolean }>();
    expect(body.name).toBe("编辑者");
    expect(body.slug).toBe("editor");
    expect(body.is_system).toBe(false);
    expect(mockDb.roles).toHaveLength(1);
  });

  test("should reject missing name", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/roles",
      headers: { authorization: `Bearer ${token}` },
      payload: { slug: "editor" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe(ErrorCode.VALIDATION_ERROR);
  });

  test("should reject missing slug", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/roles",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "编辑者" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe(ErrorCode.VALIDATION_ERROR);
  });

  test("should reject duplicate slug", async () => {
    mockDb.roles.push({
      id: "existing-1",
      tenant_id: "tenant-1",
      name: "existing",
      slug: "editor",
      description: null,
      is_system: false,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/roles",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "编辑者", slug: "editor" },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: { code: string } }>().error.code).toBe(ErrorCode.CONFLICT);
  });
});

describe("PATCH /api/roles/:id", () => {
  let app: FastifyInstance;
  let mockDb: MockDb;
  let token: string;

  beforeEach(async () => {
    mockDb = {
      roles: [
        {
          id: "role-1",
          tenant_id: "tenant-1",
          name: "旧名称",
          slug: "old-role",
          description: "Old",
          is_system: false,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "system-1",
          tenant_id: null,
          name: "管理员",
          slug: "admin",
          description: null,
          is_system: true,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    token = await createTestToken("user-1", "tenant-1");
    app = await createRoleTestApp(mockDb);
  });

  afterEach(async () => {
    await app.close();
  });

  test("should update role name", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/roles/role-1",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "新名称" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ name: string }>();
    expect(body.name).toBe("新名称");
    expect(mockDb.roles[0]!.name).toBe("新名称");
  });

  test("should return 403 for system role", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/roles/system-1",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Hacked" },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json<{ error: { code: string } }>().error.code).toBe(ErrorCode.FORBIDDEN);
  });

  test("should return 404 for non-existent role", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/roles/nonexistent",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "X" },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe("DELETE /api/roles/:id", () => {
  let app: FastifyInstance;
  let mockDb: MockDb;
  let token: string;

  beforeEach(async () => {
    mockDb = {
      roles: [
        {
          id: "role-1",
          tenant_id: "tenant-1",
          name: "可删除",
          slug: "deletable",
          description: null,
          is_system: false,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "system-1",
          tenant_id: null,
          name: "管理员",
          slug: "admin",
          description: null,
          is_system: true,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    token = await createTestToken("user-1", "tenant-1");
    app = await createRoleTestApp(mockDb);
  });

  afterEach(async () => {
    await app.close();
  });

  test("should delete non-system role", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/roles/role-1",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ success: boolean }>().success).toBe(true);
    expect(mockDb.roles).toHaveLength(1);
  });

  test("should return 403 for system role", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/roles/system-1",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json<{ error: { code: string } }>().error.code).toBe(ErrorCode.FORBIDDEN);
    expect(mockDb.roles).toHaveLength(2); // not deleted
  });

  test("should return 404 for non-existent role", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/roles/nonexistent",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });
});
