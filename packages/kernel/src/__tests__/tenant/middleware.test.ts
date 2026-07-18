import { describe, test, expect, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { registerTenantMiddleware } from "../../tenant/middleware";

/** 有效 UUID 格式的测试租户 ID */
const EXISTING_TENANT = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const OTHER_TENANT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

/**
 * 创建一个 thenable 对象模拟 Drizzle 查询链
 *
 * Drizzle 的 db.select().from().where() 返回一个 Promise-like 对象，
 * 可以通过 await 直接获取结果数组。
 */
function createThenable<T>(data: T): PromiseLike<T> & Record<string, () => unknown> {
  const chain: Record<string, () => unknown> = {
    select() {
      return chain;
    },
    from() {
      return chain;
    },
    where() {
      return chain;
    },
    limit() {
      return chain;
    },
  };

  // 核心：实现 then 方法使其成为 thenable
  chain.then = (resolve: (value: T) => void) => {
    return Promise.resolve(data).then(resolve);
  };

  return chain as unknown as PromiseLike<T> & Record<string, () => unknown>;
}

/**
 * 创建 mock 数据库
 *
 * @param existingTenantIds — 模拟 modules 表中已存在的 tenant_id
 */
function createMockDb(existingTenantIds: string[] = []) {
  const select = () => {
    return createThenable<Array<{ cnt: number }>>([{ cnt: existingTenantIds.length > 0 ? 1 : 0 }]);
  };

  return { select };
}

/**
 * 创建带有 tenant middleware 的 Fastify 测试实例
 */
async function createTestApp(existingTenants: string[] = []): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  const mockDb = createMockDb(existingTenants);

  registerTenantMiddleware(app, mockDb as never);

  // 标准错误处理器
  app.setErrorHandler((error: unknown, _request, reply) => {
    const err = error as Record<string, unknown> & { statusCode?: number };
    if (err.statusCode === 429) {
      return reply.status(429).send({ error: { code: "RATE_LIMIT_EXCEEDED" } });
    }
    return reply.status(500).send({
      error: { code: "GENERAL_INTERNAL_ERROR", message: "服务器内部错误" },
    });
  });

  // 必须存在健康检查路由
  app.get("/health", async (_request, reply) => reply.status(200).send({ status: "ok" }));
  app.get("/health/ready", async (_request, reply) => reply.status(200).send({ status: "ready" }));

  // 测试路由 — 返回注入的 tenantId
  app.get("/api/test", async (request, reply) => {
    return reply.status(200).send({ tenantId: request.tenantId });
  });

  await app.ready();
  return app;
}

describe("createTenantMiddleware — multi-tenant extraction", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  test("有效的 X-Tenant-Id header → 200 + tenantId 已设置", async () => {
    // Arrange
    app = await createTestApp([EXISTING_TENANT]);

    // Act
    const res = await app.inject({
      method: "GET",
      url: "/api/test",
      headers: { "x-tenant-id": EXISTING_TENANT },
    });

    // Assert
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { tenantId: string };
    expect(body.tenantId).toBe(EXISTING_TENANT);
  });

  test("有效的 query parameter tenant_id → 200 + tenantId 已设置", async () => {
    // Arrange
    app = await createTestApp([EXISTING_TENANT]);

    // Act
    const res = await app.inject({
      method: "GET",
      url: `/api/test?tenant_id=${EXISTING_TENANT}`,
    });

    // Assert
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { tenantId: string };
    expect(body.tenantId).toBe(EXISTING_TENANT);
  });

  test("缺少 X-Tenant-Id → 400", async () => {
    // Arrange
    app = await createTestApp([EXISTING_TENANT]);

    // Act
    const res = await app.inject({
      method: "GET",
      url: "/api/test",
    });

    // Assert
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { error: { code: string } };
    expect(body.error.code).toBe("TENANT_REQUIRED");
  });

  test("无效 UUID 格式 → 400", async () => {
    // Arrange
    app = await createTestApp([EXISTING_TENANT]);

    // Act
    const res = await app.inject({
      method: "GET",
      url: "/api/test",
      headers: { "x-tenant-id": "not-a-valid-uuid" },
    });

    // Assert
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { error: { code: string } };
    expect(body.error.code).toBe("TENANT_REQUIRED");
  });

  test("空 X-Tenant-Id header → 400", async () => {
    // Arrange
    app = await createTestApp([EXISTING_TENANT]);

    // Act
    const res = await app.inject({
      method: "GET",
      url: "/api/test",
      headers: { "x-tenant-id": "" },
    });

    // Assert
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { error: { code: string } };
    expect(body.error.code).toBe("TENANT_REQUIRED");
  });

  test("/health 跳过租户检查 → 200", async () => {
    // Arrange (空租户列表 — middleware 会拒绝非健康路由，但 /health 应跳过)
    app = await createTestApp([]);

    // Act
    const res = await app.inject({
      method: "GET",
      url: "/health",
    });

    // Assert
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { status: string };
    expect(body.status).toBe("ok");
  });

  test("/health/ready 跳过租户检查 → 200", async () => {
    // Arrange
    app = await createTestApp([]);

    // Act
    const res = await app.inject({
      method: "GET",
      url: "/health/ready",
    });

    // Assert
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { status: string };
    expect(body.status).toBe("ready");
  });

  test("header 优先级高于 query param", async () => {
    // Arrange
    const headerTenant = "11111111-1111-4111-8111-111111111111";
    app = await createTestApp([headerTenant]);

    // Act
    const res = await app.inject({
      method: "GET",
      url: `/api/test?tenant_id=${OTHER_TENANT}`,
      headers: { "x-tenant-id": headerTenant },
    });

    // Assert
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { tenantId: string };
    expect(body.tenantId).toBe(headerTenant);
  });
});
