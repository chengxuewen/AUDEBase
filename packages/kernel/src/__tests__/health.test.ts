import { describe, test, expect, afterEach } from "vitest";
import { ErrorCode, UserError } from "@audebase/shared-types";
import { createKernelApp } from "../index";
import type { DatabaseProvider } from "../db";

// --- Response types for typed injection ---
interface HealthResponse {
  status: string;
  db: boolean;
  uptime: number;
  version: string;
  timestamp: string;
}

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

interface ReadyResponse {
  status: string;
}

// --- Test helpers ---

/** 创建 mock DatabaseProvider */
function createMockDb(dbHealthy: boolean = true): DatabaseProvider {
  return {
    db: {} as unknown as DatabaseProvider["db"],
    pool: {} as unknown as DatabaseProvider["pool"],
    checkHealth(): Promise<boolean> {
      return Promise.resolve(dbHealthy);
    },
    close(): Promise<void> {
      return Promise.resolve();
    },
  };
}

/** 创建最小化 KernelApp 用于集成测试 */
async function createTestApp(dbHealthy: boolean = true) {
  return createKernelApp({
    config: {
      DATABASE_URL: "postgres://localhost:5432/testdb",
      AUDE_JWT_SECRET: "a-very-secure-secret-that-is-at-least-32-chars",
      AUDE_LOG_LEVEL: "error",
    },
    dbProvider: createMockDb(dbHealthy),
    skipPlugins: true,
  });
}

describe("GET /health", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  afterEach(async () => {
    await app.server.close();
  });

  test("DB 正常 -> 200 + status ok + db:true", async () => {
    // Arrange
    app = await createTestApp(true);

    // Act
    const res = await app.server.inject({ method: "GET", url: "/health" });

    // Assert
    expect(res.statusCode).toBe(200);
    const body = res.json<HealthResponse>();
    expect(body.status).toBe("ok");
    expect(body.db).toBe(true);
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(typeof body.version).toBe("string");
    expect(body.timestamp).toBeDefined();
    expect(new Date(body.timestamp).getTime()).not.toBeNaN();
  });

  test("DB 不可用 -> 200 + status ok + db:false", async () => {
    // Arrange
    app = await createTestApp(false);

    // Act
    const res = await app.server.inject({ method: "GET", url: "/health" });

    // Assert
    expect(res.statusCode).toBe(200);
    const body = res.json<HealthResponse>();
    expect(body.status).toBe("ok");
    expect(body.db).toBe(false);
  });

  test("X-Request-ID 注入到响应头", async () => {
    // Arrange
    app = await createTestApp();

    // Act
    const res = await app.server.inject({ method: "GET", url: "/health" });

    // Assert
    expect(res.headers["x-request-id"]).toBeDefined();
    expect(typeof res.headers["x-request-id"]).toBe("string");
  });

  test("无需认证即可访问", async () => {
    // Arrange
    app = await createTestApp();

    // Act
    const res = await app.server.inject({
      method: "GET",
      url: "/health",
    });

    // Assert
    expect(res.statusCode).toBe(200);
  });
});

describe("GET /health/ready", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  afterEach(async () => {
    await app.server.close();
  });

  test("DB 就绪 -> 200 + status ready", async () => {
    // Arrange
    app = await createTestApp(true);

    // Act
    const res = await app.server.inject({ method: "GET", url: "/health/ready" });

    // Assert
    expect(res.statusCode).toBe(200);
    expect(res.json<ReadyResponse>().status).toBe("ready");
  });

  test("DB 不可用 -> 503 + status not_ready", async () => {
    // Arrange
    app = await createTestApp(false);

    // Act
    const res = await app.server.inject({ method: "GET", url: "/health/ready" });

    // Assert
    expect(res.statusCode).toBe(503);
    expect(res.json<ReadyResponse>().status).toBe("not_ready");
  });

  test("无需认证即可访问", async () => {
    // Arrange
    app = await createTestApp();

    // Act
    const res = await app.server.inject({ method: "GET", url: "/health/ready" });

    // Assert
    expect(res.statusCode).toBe(200);
  });
});

describe("JWT secret 启动校验", () => {
  test("JWT 密钥 >= 32 字符 -> 启动成功", async () => {
    // Arrange & Act
    const app = await createTestApp();

    // Assert
    expect(app.config.AUDE_JWT_SECRET.length).toBeGreaterThanOrEqual(32);

    await app.server.close();
  });

  test("JWT 密钥 < 32 字符 -> 启动抛 UserError", async () => {
    // Arrange & Act & Assert
    await expect(
      createKernelApp({
        config: {
          DATABASE_URL: "postgres://localhost:5432/testdb",
          AUDE_JWT_SECRET: "short",
        },
        dbProvider: createMockDb(),
      }),
    ).rejects.toThrow(UserError);
  });
});

describe("全局错误中间件", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  afterEach(async () => {
    await app.server.close();
  });

  test("UserError -> 400 + 结构化错误响应", async () => {
    // Arrange
    app = await createTestApp();
    app.server.get("/test-user-error", () => {
      throw new UserError(
        ErrorCode.VALIDATION_ERROR,
        "\u8BF7\u6C42\u53C2\u6570\u6821\u9A8C\u5931\u8D25",
        { field: "username" },
      );
    });

    // Act
    const res = await app.server.inject({
      method: "GET",
      url: "/test-user-error",
    });

    // Assert
    expect(res.statusCode).toBe(400);
    const body = res.json<ErrorResponse>();
    expect(body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(body.error.message).toBe("\u8BF7\u6C42\u53C2\u6570\u6821\u9A8C\u5931\u8D25");
    expect(body.error.details).toEqual({ field: "username" });
  });

  test("未知 Error -> 500 + INTERNAL_ERROR（不暴露详情）", async () => {
    // Arrange
    app = await createTestApp();
    app.server.get("/test-unknown-error", () => {
      throw new Error("secret details");
    });

    // Act
    const res = await app.server.inject({
      method: "GET",
      url: "/test-unknown-error",
    });

    // Assert
    expect(res.statusCode).toBe(500);
    const body = res.json<ErrorResponse>();
    expect(body.error.code).toBe(ErrorCode.GENERAL_INTERNAL_ERROR);
    expect(body.error.message).toBe("\u670D\u52A1\u5668\u5185\u90E8\u9519\u8BEF");
  });
});

describe("速率限制", () => {
  test("超过 100/min 限制 -> 429", async () => {
    // Arrange
    const app = await createTestApp();

    // Act: 发送 101 个请求
    let lastStatusCode = 0;
    let lastBody: ErrorResponse | null = null;
    for (let i = 0; i < 101; i++) {
      const res = await app.server.inject({ method: "GET", url: "/health" });
      lastStatusCode = res.statusCode;
      if (lastStatusCode === 429) {
        lastBody = res.json<ErrorResponse>();
      }
    }

    // Assert: 最后一个请求应该是 429
    expect(lastStatusCode).toBe(429);
    expect(lastBody!.error.code).toBe(ErrorCode.RATE_LIMIT_EXCEEDED);

    await app.server.close();
  });
});
