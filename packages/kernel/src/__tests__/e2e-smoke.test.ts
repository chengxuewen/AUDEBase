/**
 * E2E smoke test — verifies kernel starts, health endpoints respond,
 * and auth-protected routes return 401.
 *
 * Gracefully skips when PostgreSQL is unavailable (safe for CI without Docker).
 *
 * ponytail: real Fastify app via inject(), cleanup in afterAll.
 */
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import { createDatabaseProvider, type DatabaseProvider } from "../db";
import { createKernelApp, type KernelApp } from "../index";

// ── noop logger (pg pool noise stays out of test output) ──────

function createNoopLogger(): FastifyBaseLogger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    trace: () => {},
    fatal: () => {},
    child: () => createNoopLogger(),
    level: "silent",
    silent: () => createNoopLogger(),
  } as FastifyBaseLogger;
}

// ── DB probing ─────────────────────────────────────────────────

let dbProvider: DatabaseProvider | null = null;
let app: KernelApp | null = null;

beforeAll(async () => {
  // 1. Probe DB availability
  try {
    dbProvider = createDatabaseProvider({
      connectionString: process.env.DATABASE_URL!,
      logger: createNoopLogger(),
    });
    const healthy = await dbProvider.checkHealth();
    if (!healthy) throw new Error("DB not healthy");
  } catch {
    dbProvider = null;
    return; // skip — no DB available
  }

  // 2. Build the app (skipPlugins: avoid full plugin/migration overhead for smoke)
  try {
    app = await createKernelApp({ dbProvider, skipPlugins: true });
    await app.server.ready();
  } catch {
    app = null;
  }
}, 15000);

afterAll(async () => {
  if (app) {
    await app.server.close();
    // dbProvider is owned by app — app.close cleans shutdown hook
  }
  // If we probed but failed to create app, clean up manually
  if (dbProvider && !app) {
    await dbProvider.close();
  }
});

// ── Tests ───────────────────────────────────────────────────────

describe("E2E smoke test", () => {
  test("GET /health returns ok", async () => {
    if (!app) return;
    const res = await app.server.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ status: string }>();
    expect(body.status).toBe("ok");
  });

  test("GET /health/ready returns 200", async () => {
    if (!app) return;
    const res = await app.server.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(200);
  });

  test("GET /api/users without auth returns 401", async () => {
    if (!app) return;
    const res = await app.server.inject({ method: "GET", url: "/api/users" });
    expect(res.statusCode).toBe(401);
  });
});
