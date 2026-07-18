/**
 * DB Integration Test — real PostgreSQL integration test for the full startup pipeline.
 *
 * Requires: `docker compose up -d` with PostgreSQL running on localhost:5432.
 * Gracefully skips when PostgreSQL is unavailable (safe for CI without Docker).
 *
 * Run: pnpm --filter @audebase/kernel vitest run src/__tests__/integration/db-integration.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import { createDatabaseProvider, type DatabaseProvider } from "../../db";
import { startupPipeline } from "../../startup";

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

const CONNECTION_STRING =
  process.env.DATABASE_URL ?? "postgres://audebase:audebase@localhost:5432/audebase";

let db: DatabaseProvider | null = null;
let dbAvailable = false;

beforeAll(async () => {
  try {
    const noopLogger = createNoopLogger();

    db = createDatabaseProvider({
      connectionString: CONNECTION_STRING,
      logger: noopLogger,
    });

    const healthy = await db.checkHealth();
    if (!healthy) throw new Error("DB not healthy");

    dbAvailable = true;
  } catch {
    process.stderr.write("PostgreSQL not available, skipping DB integration tests\n");
  }
}, 15000);

afterAll(async () => {
  if (db && dbAvailable) {
    try {
      // Clean up all tables
      await db.pool.query("DROP SCHEMA public CASCADE");
      await db.pool.query("CREATE SCHEMA public");
      await db.pool.query("GRANT ALL ON SCHEMA public TO audebase");
      await db.pool.query("GRANT ALL ON SCHEMA public TO public");
    } catch {
      // Best effort cleanup
    }
    await db.close();
  }
}, 15000);

function skipIfUnavailable() {
  if (!dbAvailable || !db) {
    return true;
  }
  return false;
}

describe("DB Integration", () => {
  test("database connection is healthy", async () => {
    if (skipIfUnavailable()) return;
    const healthy = await db!.checkHealth();
    expect(healthy).toBe(true);
  });

  test("startup pipeline creates schema tables", async () => {
    if (skipIfUnavailable()) return;
    const noopLogger = createNoopLogger();

    await startupPipeline(db!, noopLogger, { skipPlugins: false });

    // Verify key tables exist
    const tables = ["users", "roles", "modules", "audit_log", "migration_history"];
    for (const table of tables) {
      const result = await db!.pool.query(
        "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1)",
        [table],
      );
      expect(result.rows[0].exists, `Table '${table}' should exist`).toBe(true);
    }
  });

  test("bootstrap creates admin and member roles", async () => {
    if (skipIfUnavailable()) return;

    const result = await db!.pool.query(
      "SELECT name FROM roles WHERE name IN ($1, $2) ORDER BY name",
      ["admin", "member"],
    );
    expect(result.rows).toHaveLength(2);
    const names = result.rows.map((r: { name: string }) => r.name);
    expect(names).toContain("admin");
    expect(names).toContain("member");
  });

  test("bootstrap creates admin user", async () => {
    if (skipIfUnavailable()) return;

    const result = await db!.pool.query(
      "SELECT username, must_change_password FROM users WHERE username = $1",
      ["admin"],
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].username).toBe("admin");
    expect(result.rows[0].must_change_password).toBe(true);
  });

  test("startup pipeline is idempotent on second run", async () => {
    if (skipIfUnavailable()) return;

    // Count rows before second run
    const beforeUsers = await db!.pool.query("SELECT COUNT(*) as c FROM users");
    const beforeRoles = await db!.pool.query("SELECT COUNT(*) as c FROM roles");
    const noopLogger = createNoopLogger();

    // Run pipeline a second time
    await startupPipeline(db!, noopLogger, { skipPlugins: false });

    const afterUsers = await db!.pool.query("SELECT COUNT(*) as c FROM users");
    const afterRoles = await db!.pool.query("SELECT COUNT(*) as c FROM roles");

    expect(Number(afterUsers.rows[0].c)).toBe(Number(beforeUsers.rows[0].c));
    expect(Number(afterRoles.rows[0].c)).toBe(Number(beforeRoles.rows[0].c));
  });
});
