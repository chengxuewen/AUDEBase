import { describe, test, expect } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";
import { ErrorCode, UserError } from "@audebase/shared-types";
import { createAuthMiddleware } from "../auth/middleware";

const TEST_SECRET = "a-very-secure-secret-that-is-at-least-32-chars";

/** 模拟数据库查询 */
function createMockDb(options: { userExists: boolean; isActive: boolean; tokenVersion: number }) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () =>
            [
              options.userExists
                ? {
                    id: "user-1",
                    is_active: options.isActive,
                    token_version: options.tokenVersion,
                  }
                : undefined,
            ].filter(Boolean),
        }),
      }),
    }),
  };
}

/**
 * 创建包含错误中间件的 Fastify 测试实例
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

function mapErrorToHttp(code: ErrorCode): number {
  const map: Record<string, number> = {
    [ErrorCode.AUTH_TOKEN_INVALID]: 401,
    [ErrorCode.AUTH_TOKEN_EXPIRED]: 401,
    [ErrorCode.AUTH_INVALID_CREDENTIALS]: 401,
    [ErrorCode.FORBIDDEN]: 403,
    [ErrorCode.VALIDATION_ERROR]: 400,
  };
  return map[code] ?? 500;
}

describe("createAuthMiddleware — authenticate", () => {
  test("缺少 Authorization header → 401", async () => {
    // Arrange
    const app = await createTestApp();
    const db = createMockDb({ userExists: true, isActive: true, tokenVersion: 1 });
    const middleware = createAuthMiddleware(db as never, TEST_SECRET);

    app.get("/protected", { preHandler: middleware }, () => ({ ok: true }));
    await app.ready();

    // Act
    const res = await app.inject({ method: "GET", url: "/protected" });

    // Assert
    expect(res.statusCode).toBe(401);

    await app.close();
  });

  test("Invalid Bearer 格式 → 401", async () => {
    // Arrange
    const app = await createTestApp();
    const db = createMockDb({ userExists: true, isActive: true, tokenVersion: 1 });
    const middleware = createAuthMiddleware(db as never, TEST_SECRET);

    app.get("/protected", { preHandler: middleware }, () => ({ ok: true }));
    await app.ready();

    // Act
    const res = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Basic abc123" },
    });

    // Assert
    expect(res.statusCode).toBe(401);

    await app.close();
  });

  test("有效 token + 活跃用户 → 200 + request.user 已设置", async () => {
    // Arrange
    const app = await createTestApp();
    const db = createMockDb({ userExists: true, isActive: true, tokenVersion: 1 });
    const middleware = createAuthMiddleware(db as never, TEST_SECRET);

    const accessToken = jwt.sign(
      { sub: "user-1", tenant_id: "tenant-1", username: "admin", roles: ["admin"] },
      TEST_SECRET,
      { algorithm: "HS512", expiresIn: 900 },
    );

    let capturedUser: unknown = null;
    app.get("/protected", { preHandler: middleware }, (request) => {
      capturedUser = request.user;
      return { ok: true };
    });
    await app.ready();

    // Act
    const res = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    // Assert
    expect(res.statusCode).toBe(200);
    expect(capturedUser).toBeDefined();
    const user = capturedUser as Record<string, unknown>;
    expect(user.userId).toBe("user-1");
    expect(user.tenantId).toBe("tenant-1");
    expect(user.username).toBe("admin");

    await app.close();
  });

  test("过期 token → 401", async () => {
    // Arrange
    const app = await createTestApp();
    const db = createMockDb({ userExists: true, isActive: true, tokenVersion: 1 });
    const middleware = createAuthMiddleware(db as never, TEST_SECRET);

    const expiredToken = jwt.sign(
      { sub: "user-1", tenant_id: "tenant-1", username: "admin", roles: [] },
      TEST_SECRET,
      { algorithm: "HS512", expiresIn: 0 },
    );

    app.get("/protected", { preHandler: middleware }, () => ({ ok: true }));
    await app.ready();

    // Act
    const res = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: `Bearer ${expiredToken}` },
    });

    // Assert
    expect(res.statusCode).toBe(401);

    await app.close();
  });

  test("不存在的用户 → 401", async () => {
    // Arrange
    const app = await createTestApp();
    const db = createMockDb({ userExists: false, isActive: true, tokenVersion: 1 });
    const middleware = createAuthMiddleware(db as never, TEST_SECRET);

    const accessToken = jwt.sign(
      { sub: "nonexistent", tenant_id: "tenant-1", username: "ghost", roles: [] },
      TEST_SECRET,
      { algorithm: "HS512", expiresIn: 900 },
    );

    app.get("/protected", { preHandler: middleware }, () => ({ ok: true }));
    await app.ready();

    // Act
    const res = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    // Assert
    expect(res.statusCode).toBe(401);

    await app.close();
  });

  test("已禁用的用户 → 403", async () => {
    // Arrange
    const app = await createTestApp();
    const db = createMockDb({ userExists: true, isActive: false, tokenVersion: 1 });
    const middleware = createAuthMiddleware(db as never, TEST_SECRET);

    const accessToken = jwt.sign(
      { sub: "user-1", tenant_id: "tenant-1", username: "disabled-user", roles: [] },
      TEST_SECRET,
      { algorithm: "HS512", expiresIn: 900 },
    );

    app.get("/protected", { preHandler: middleware }, () => ({ ok: true }));
    await app.ready();

    // Act
    const res = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    // Assert
    expect(res.statusCode).toBe(403);

    await app.close();
  });
});
