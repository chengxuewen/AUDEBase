/**
 * E2E smoke test — verifies kernel starts and health endpoints respond.
 *
 * ponytail: one test file. Skips gracefully when env vars are missing.
 */
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { createKernelApp } from "../index";

const hasEnv =
  process.env.DATABASE_URL &&
  process.env.AUDE_JWT_SECRET &&
  process.env.AUDE_JWT_SECRET.length >= 32;

let app: Awaited<ReturnType<typeof createKernelApp>> | undefined;

beforeAll(async () => {
  if (!hasEnv) return;
  app = await createKernelApp({ skipPlugins: true });
  await app.ready();
});

afterAll(async () => {
  await app?.close();
});

describe("E2E smoke test", () => {
  test("GET /health returns ok", { skip: !hasEnv }, async () => {
    const res = await app!.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ status: string }>();
    expect(body.status).toBe("ok");
  });

  test("GET /health/ready returns 200", { skip: !hasEnv }, async () => {
    const res = await app!.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(200);
  });

  test("GET /api/users without auth returns 401", { skip: !hasEnv }, async () => {
    const res = await app!.inject({ method: "GET", url: "/api/users" });
    expect(res.statusCode).toBe(401);
  });
});
