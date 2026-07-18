import { describe, test, expect, vi } from "vitest";
import { bootstrapKernel } from "../bootstrap";
import type { DatabaseProvider } from "../db";

// ---------------------------------------------------------------------------
// Mock @audebase/plugin-core
// ---------------------------------------------------------------------------
vi.mock("@audebase/plugin-core", () => ({
  install: vi.fn(),
}));

import { install } from "@audebase/plugin-core";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a proxy-based mock drizzle DB.
 *
 * Every property access returns a new function proxy.  Async callables
 * resolve to [] so that all select/insert chains pass without error
 * and return empty results — enough for `install()` to proceed normally.
 */
function createMockDrizzleDb(): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handler: ProxyHandler<any> = {
    get(_target, _prop) {
      // Return a new async function that resolves to [].
      // This handles both property access (for chaining) and callability.
      const fn = (): Promise<[]> => Promise.resolve([]);
      return new Proxy(fn, handler);
    },
    apply(_target, _thisArg, _args) {
      return Promise.resolve([]);
    },
  };
  return new Proxy({}, handler);
}

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: () => createMockLogger(),
    level: "info",
    silent: vi.fn(),
  };
}

function createMockDbProvider(): DatabaseProvider {
  return {
    db: createMockDrizzleDb() as unknown as DatabaseProvider["db"],
    pool: {} as unknown as DatabaseProvider["pool"],
    checkHealth: async () => true,
    close: async () => {},
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("bootstrapKernel", () => {
  test("creates PluginDbContext and calls install from plugin-core", async () => {
    // Arrange
    const dbProvider = createMockDbProvider();
    const logger = createMockLogger();
    const mockInstall = install as ReturnType<typeof vi.fn>;

    // Act
    await bootstrapKernel(dbProvider, logger);

    // Assert
    expect(mockInstall).toHaveBeenCalledTimes(1);

    const context = mockInstall.mock.calls[0]?.[0];
    expect(context).toBeDefined();

    // Verify db context has all required methods
    expect(context.db).toHaveProperty("hasAnyUser");
    expect(context.db).toHaveProperty("createPermission");
    expect(context.db).toHaveProperty("createRole");
    expect(context.db).toHaveProperty("assignPermissionToRole");
    expect(context.db).toHaveProperty("createUser");
    expect(context.db).toHaveProperty("createMenuItem");

    // Verify each is a function
    expect(typeof context.db.hasAnyUser).toBe("function");
    expect(typeof context.db.createPermission).toBe("function");
    expect(typeof context.db.createRole).toBe("function");
    expect(typeof context.db.assignPermissionToRole).toBe("function");
    expect(typeof context.db.createUser).toBe("function");
    expect(typeof context.db.createMenuItem).toBe("function");

    // Verify logger was passed through
    expect(context.logger).toBe(logger);
  });

  test("logs bootstrap start and complete", async () => {
    // Arrange
    const dbProvider = createMockDbProvider();
    const logger = createMockLogger();

    // Act
    await bootstrapKernel(dbProvider, logger);

    // Assert
    expect(logger.info).toHaveBeenCalledWith({ phase: "bootstrap" }, "kernel bootstrap started");
    expect(logger.info).toHaveBeenCalledWith({ phase: "bootstrap" }, "kernel bootstrap complete");
  });

  test("idempotency — install is called once, plugin-core handles skip internally", async () => {
    // Arrange
    const dbProvider = createMockDbProvider();
    const logger = createMockLogger();
    const mockInstall = install as ReturnType<typeof vi.fn>;
    mockInstall.mockClear(); // reset after first test

    // Act — call twice
    await bootstrapKernel(dbProvider, logger);
    await bootstrapKernel(dbProvider, logger);

    // Assert — install is called both times (idempotency is inside install via hasAnyUser)
    expect(mockInstall).toHaveBeenCalledTimes(2);
  });
});
