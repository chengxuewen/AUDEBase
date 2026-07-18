import { describe, test, expect, afterEach } from "vitest";
import Fastify from "fastify";
import healthCheckPlugin from "../routes";
import type { HealthResponse, ReadyResponse } from "../routes";

/** Fixed timestamp for deterministic uptime calculations. */
const FIXED_START = Date.now() - 10_000; // 10 seconds ago

/** Builds a minimal Fastify app with the health-check plugin registered. */
async function buildApp(dbHealthy: boolean = true) {
  const app = Fastify({ logger: false });
  const dbCheck = async (): Promise<boolean> => dbHealthy;
  await app.register(healthCheckPlugin, { dbCheck, startTime: FIXED_START });
  await app.ready();
  return app;
}

describe("GET /health", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  afterEach(async () => {
    await app.close();
  });

  test("DB healthy → 200 with status ok, db:true, uptime ≥ 0", async () => {
    // Arrange
    app = await buildApp(true);

    // Act
    const res = await app.inject({ method: "GET", url: "/health" });

    // Assert
    expect(res.statusCode).toBe(200);
    const body = res.json<HealthResponse>();
    expect(body.status).toBe("ok");
    expect(body.db).toBe(true);
    expect(body.uptime).toBeGreaterThanOrEqual(10);
  });

  test("DB unhealthy → 200 with status ok, db:false", async () => {
    // Arrange
    app = await buildApp(false);

    // Act
    const res = await app.inject({ method: "GET", url: "/health" });

    // Assert
    expect(res.statusCode).toBe(200);
    const body = res.json<HealthResponse>();
    expect(body.status).toBe("ok");
    expect(body.db).toBe(false);
  });

  test("response includes valid ISO 8601 timestamp", async () => {
    // Arrange
    app = await buildApp(true);

    // Act
    const res = await app.inject({ method: "GET", url: "/health" });

    // Assert
    const body = res.json<HealthResponse>();
    expect(body.timestamp).toBeDefined();
    expect(new Date(body.timestamp).getTime()).not.toBeNaN();
  });
});

describe("GET /health/ready", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  afterEach(async () => {
    await app.close();
  });

  test("DB healthy → 200 with status ready", async () => {
    // Arrange
    app = await buildApp(true);

    // Act
    const res = await app.inject({ method: "GET", url: "/health/ready" });

    // Assert
    expect(res.statusCode).toBe(200);
    expect(res.json<ReadyResponse>().status).toBe("ready");
  });

  test("DB unhealthy → 503 with status not_ready", async () => {
    // Arrange
    app = await buildApp(false);

    // Act
    const res = await app.inject({ method: "GET", url: "/health/ready" });

    // Assert
    expect(res.statusCode).toBe(503);
    expect(res.json<ReadyResponse>().status).toBe("not_ready");
  });
});

describe("error handling", () => {
  test("dbCheck throws → 500 (plugin does not swallow errors)", async () => {
    // Arrange
    const app = Fastify({ logger: false });
    const throwingDbCheck = async (): Promise<boolean> => {
      throw new Error("connection refused");
    };
    await app.register(healthCheckPlugin, {
      dbCheck: throwingDbCheck,
      startTime: FIXED_START,
    });
    await app.ready();

    // Act
    const res = await app.inject({ method: "GET", url: "/health" });

    // Assert
    expect(res.statusCode).toBe(500);

    await app.close();
  });
});
