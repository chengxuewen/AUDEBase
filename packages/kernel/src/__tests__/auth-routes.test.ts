import { describe, test, expect, afterEach, beforeEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { ErrorCode } from "@audebase/shared-types";
import { hashPassword } from "../auth/passwords";
import { createRefreshToken, hashRefreshToken } from "../auth/tokens";

const TEST_SECRET = "a-very-secure-secret-that-is-at-least-32-chars" as const;

/** 模拟的数据库 */
interface MockDb {
  users: Array<{
    id: string;
    tenant_id: string;
    username: string;
    password_hash: string;
    is_active: boolean;
    display_name: string | null;
    must_change_password: boolean;
    token_version: number;
  }>;
  refreshTokens: Array<{
    id: string;
    user_id: string;
    tenant_id: string;
    token_hash: string;
    expires_at: Date;
    revoked_at: Date | null;
  }>;
}

/**
 * 创建带 Mock DB 的 Fastify 测试应用
 */
async function createAuthTestApp(mockDb: MockDb): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // POST /api/auth/login
  app.post("/api/auth/login", async (request, reply) => {
    const body = request.body as { username?: string; password?: string };

    if (!body || typeof body.username !== "string" || typeof body.password !== "string") {
      reply
        .code(400)
        .send({ error: { code: ErrorCode.VALIDATION_ERROR, message: "用户名和密码为必填项" } });
      return;
    }

    const foundUser = mockDb.users.find((u) => u.username === body.username);
    if (!foundUser) {
      reply
        .code(401)
        .send({ error: { code: ErrorCode.AUTH_INVALID_CREDENTIALS, message: "用户名或密码错误" } });
      return;
    }

    const isValid = await import("bcrypt").then((m) =>
      m.default.compare(body.password!, foundUser.password_hash),
    );
    if (!isValid) {
      reply
        .code(401)
        .send({ error: { code: ErrorCode.AUTH_INVALID_CREDENTIALS, message: "用户名或密码错误" } });
      return;
    }

    if (!foundUser.is_active) {
      reply.code(403).send({ error: { code: ErrorCode.FORBIDDEN, message: "帐号已被禁用" } });
      return;
    }

    const jwt = await import("jsonwebtoken");
    const accessToken = jwt.default.sign(
      {
        sub: foundUser.id,
        tenant_id: foundUser.tenant_id,
        username: foundUser.username,
        roles: [],
      },
      TEST_SECRET,
      { algorithm: "HS512", expiresIn: 900 },
    );
    const rawToken = createRefreshToken();
    const tokenHash = hashRefreshToken(rawToken);

    mockDb.refreshTokens.push({
      id: `rt-${mockDb.refreshTokens.length + 1}`,
      user_id: foundUser.id,
      tenant_id: foundUser.tenant_id,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      revoked_at: null,
    });

    return {
      access_token: accessToken,
      refresh_token: rawToken,
      expires_in: 900,
      token_type: "Bearer",
      user: {
        id: foundUser.id,
        tenant_id: foundUser.tenant_id,
        username: foundUser.username,
        display_name: foundUser.display_name ?? foundUser.username,
        must_change_password: foundUser.must_change_password,
        roles: [] as string[],
      },
    };
  });

  // POST /api/auth/refresh
  app.post("/api/auth/refresh", async (request, reply) => {
    const body = request.body as { refresh_token?: string };

    if (!body || typeof body.refresh_token !== "string") {
      reply
        .code(400)
        .send({ error: { code: ErrorCode.VALIDATION_ERROR, message: "refresh_token 为必填项" } });
      return;
    }

    const tokenHash = hashRefreshToken(body.refresh_token);

    const foundToken = mockDb.refreshTokens.find(
      (rt) => rt.token_hash === tokenHash && rt.revoked_at === null && rt.expires_at > new Date(),
    );

    if (!foundToken) {
      reply.code(401).send({
        error: { code: ErrorCode.AUTH_TOKEN_INVALID, message: "refresh_token 无效或已过期" },
      });
      return;
    }

    const foundUser = mockDb.users.find((u) => u.id === foundToken.user_id);
    if (!foundUser || !foundUser.is_active) {
      reply.code(403).send({ error: { code: ErrorCode.FORBIDDEN, message: "帐号已被禁用" } });
      return;
    }

    foundToken.revoked_at = new Date();

    const jwt = await import("jsonwebtoken");
    const accessToken = jwt.default.sign(
      {
        sub: foundUser.id,
        tenant_id: foundUser.tenant_id,
        username: foundUser.username,
        roles: [],
      },
      TEST_SECRET,
      { algorithm: "HS512", expiresIn: 900 },
    );
    const rawToken = createRefreshToken();
    const newTokenHash = hashRefreshToken(rawToken);

    mockDb.refreshTokens.push({
      id: `rt-${mockDb.refreshTokens.length + 1}`,
      user_id: foundUser.id,
      tenant_id: foundUser.tenant_id,
      token_hash: newTokenHash,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      revoked_at: null,
    });

    return {
      access_token: accessToken,
      refresh_token: rawToken,
      expires_in: 900,
      token_type: "Bearer",
    };
  });

  // POST /api/auth/logout
  app.post("/api/auth/logout", async (request, reply) => {
    const body = request.body as { refresh_token?: string };

    if (!body || typeof body.refresh_token !== "string") {
      reply
        .code(400)
        .send({ error: { code: ErrorCode.VALIDATION_ERROR, message: "refresh_token 为必填项" } });
      return;
    }

    const tokenHash = hashRefreshToken(body.refresh_token);
    const foundToken = mockDb.refreshTokens.find(
      (rt) => rt.token_hash === tokenHash && rt.revoked_at === null,
    );
    if (foundToken) {
      foundToken.revoked_at = new Date();
    }

    return { success: true };
  });

  await app.ready();
  return app;
}

describe("POST /api/auth/login", () => {
  let app: FastifyInstance;
  let mockDb: MockDb;

  beforeEach(async () => {
    const userPasswordHash = await hashPassword("TestPass1!");
    mockDb = {
      users: [
        {
          id: "user-1",
          tenant_id: "tenant-1",
          username: "admin",
          password_hash: userPasswordHash,
          is_active: true,
          display_name: "Admin User",
          must_change_password: false,
          token_version: 1,
        },
      ],
      refreshTokens: [],
    };
    app = await createAuthTestApp(mockDb);
  });

  afterEach(async () => {
    await app.close();
  });

  test("有效凭据 → 200 + access_token + refresh_token + user", async () => {
    // Arrange & Act
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "TestPass1!" },
    });

    // Assert
    expect(res.statusCode).toBe(200);
    const body = res.json<Record<string, unknown>>();
    expect(body.access_token).toBeDefined();
    expect(body.refresh_token).toBeDefined();
    expect(body.expires_in).toBe(900);
    expect(body.token_type).toBe("Bearer");
    expect(body.user.username).toBe("admin");
    expect(body.user.id).toBe("user-1");
  });

  test("错误密码 → 401", async () => {
    // Arrange & Act
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "WrongPass1!" },
    });

    // Assert
    expect(res.statusCode).toBe(401);
    expect(res.json<Record<string, unknown>>().error.code).toBe(ErrorCode.AUTH_INVALID_CREDENTIALS);
  });

  test("不存在的用户 → 401", async () => {
    // Arrange & Act
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "nobody", password: "TestPass1!" },
    });

    // Assert
    expect(res.statusCode).toBe(401);
  });

  test("缺失字段 → 400", async () => {
    // Arrange & Act
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {},
    });

    // Assert
    expect(res.statusCode).toBe(400);
    expect(res.json<Record<string, unknown>>().error.code).toBe(ErrorCode.VALIDATION_ERROR);
  });

  test("登录成功后 refresh token 存储到 DB", async () => {
    // Arrange & Act
    await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "TestPass1!" },
    });

    // Assert
    expect(mockDb.refreshTokens).toHaveLength(1);
    expect(mockDb.refreshTokens[0]!.user_id).toBe("user-1");
    expect(mockDb.refreshTokens[0]!.revoked_at).toBeNull();
  });
});

describe("POST /api/auth/refresh", () => {
  let app: FastifyInstance;
  let mockDb: MockDb;
  let savedRawToken: string;

  beforeEach(async () => {
    const passwordHash = await hashPassword("TestPass1!");
    savedRawToken = createRefreshToken();
    const tokenHash = hashRefreshToken(savedRawToken);

    mockDb = {
      users: [
        {
          id: "user-1",
          tenant_id: "tenant-1",
          username: "admin",
          password_hash: passwordHash,
          is_active: true,
          display_name: "Admin",
          must_change_password: false,
          token_version: 1,
        },
      ],
      refreshTokens: [
        {
          id: "rt-1",
          user_id: "user-1",
          tenant_id: "tenant-1",
          token_hash: tokenHash,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          revoked_at: null,
        },
      ],
    };

    app = await createAuthTestApp(mockDb);
  });

  afterEach(async () => {
    await app.close();
  });

  test("有效 refresh token → 200 + 新 token 对", async () => {
    // Arrange & Act
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      payload: { refresh_token: savedRawToken },
    });

    // Assert
    expect(res.statusCode).toBe(200);
    const body = res.json<Record<string, unknown>>();
    expect(body.access_token).toBeDefined();
    expect(body.refresh_token).toBeDefined();
    expect(body.refresh_token).not.toBe(savedRawToken);
  });

  test("刷新后旧 token 被撤销", async () => {
    // Arrange & Act
    await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      payload: { refresh_token: savedRawToken },
    });

    // Assert
    expect(mockDb.refreshTokens[0]!.revoked_at).not.toBeNull();
  });

  test("已撤销的 token → 401", async () => {
    // Arrange
    mockDb.refreshTokens[0]!.revoked_at = new Date();

    // Act
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      payload: { refresh_token: savedRawToken },
    });

    // Assert
    expect(res.statusCode).toBe(401);
  });

  test("不存在的 token → 401", async () => {
    // Arrange & Act
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      payload: { refresh_token: createRefreshToken() },
    });

    // Assert
    expect(res.statusCode).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  let app: FastifyInstance;
  let mockDb: MockDb;
  let savedRawToken: string;

  beforeEach(async () => {
    const passwordHash = await hashPassword("TestPass1!");
    savedRawToken = createRefreshToken();
    const tokenHash = hashRefreshToken(savedRawToken);

    mockDb = {
      users: [
        {
          id: "user-1",
          tenant_id: "tenant-1",
          username: "admin",
          password_hash: passwordHash,
          is_active: true,
          display_name: "Admin",
          must_change_password: false,
          token_version: 1,
        },
      ],
      refreshTokens: [
        {
          id: "rt-1",
          user_id: "user-1",
          tenant_id: "tenant-1",
          token_hash: tokenHash,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          revoked_at: null,
        },
      ],
    };

    app = await createAuthTestApp(mockDb);
  });

  afterEach(async () => {
    await app.close();
  });

  test("有效 refresh token → 200 + 撤销", async () => {
    // Arrange & Act
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      payload: { refresh_token: savedRawToken },
    });

    // Assert
    expect(res.statusCode).toBe(200);
    expect(res.json<Record<string, unknown>>().success).toBe(true);
    expect(mockDb.refreshTokens[0]!.revoked_at).not.toBeNull();
  });

  test("不存在的 token → 仍返回 200（幂等）", async () => {
    // Arrange & Act
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      payload: { refresh_token: createRefreshToken() },
    });

    // Assert
    expect(res.statusCode).toBe(200);
    expect(res.json<Record<string, unknown>>().success).toBe(true);
  });
});
