import { describe, test, expect, vi, beforeEach } from "vitest";
import { scanManifests, initAndLoadPlugins, type LoaderResult } from "../../plugins/loader";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Capture what readdir and access resolve/reject with
let mockDirs: string[] = [];
let mockManifestPaths: string[] = [];

vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(async (_dir: unknown, _opts: unknown) => {
    return mockDirs.map((name) => ({ name, isDirectory: () => true }));
  }),
  access: vi.fn(async (path: string) => {
    if (mockManifestPaths.some((p) => path.endsWith(p))) {
      return;
    }
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  }),
}));

vi.mock("@audebase/manifest-engine", () => {
  return {
    ManifestLoader: vi.fn(() => ({
      loadFromFile: vi.fn(async (filePath: string) => {
        // Simulate loading: filePath → manifest
        const dirName = filePath.split("/").slice(-2, -1)[0];
        if (dirName === "bad-plugin") {
          throw new Error("YAML parse error");
        }
        return {
          name: `@audebase/${dirName}`,
          version: "1.0.0",
          display_name: dirName,
          description: `${dirName} plugin`,
          dependencies: [],
          runtime: { mode: "inline" as const, partition: "SYSTEM" },
        };
      }),
      validate: vi.fn(() => ({ valid: true, errors: [] })),
      getCached: vi.fn(),
      clearCache: vi.fn(),
    })),
    validateManifest: vi.fn(),
    validateManifestSafe: vi.fn(() => ({ valid: true, errors: [] })),
    manifestSchema: {},
  };
});

vi.mock("@audebase/plugin-framework", () => {
  return {
    PluginManager: vi.fn(function (this: Record<string, unknown>, _host: unknown) {
      this.loadPlugins = vi.fn(async (manifests: Array<{ name: string }>) => {
        const map = new Map<string, Record<string, unknown>>();
        for (const m of manifests) {
          if (m.name.includes("fail")) {
            throw new Error(`Failed to load "${m.name}"`);
          }
          map.set(m.name, { source: { installed: true } });
        }
        return map;
      });
      this.loadPlugin = vi.fn();
      this.unloadPlugin = vi.fn();
      this.getPlugin = vi.fn((name: string) => instanceMap.get(name));
      this.unloadPlugins = vi.fn();
      this.getLoadedPlugins = vi.fn(() => [...instanceMap.keys()]);
      this.getPluginInstance = vi.fn((name: string) => instanceMap.get(name));
      return this;
    }),
    InlinePluginHost: vi.fn(),
    resolveDependencies: vi.fn((m: readonly unknown[]) => [...m]),
  };
});

// ---------------------------------------------------------------------------
// Tests: scanManifests
// ---------------------------------------------------------------------------

describe("scanManifests", () => {
  beforeEach(() => {
    mockDirs = [];
    mockManifestPaths = [];
  });

  test("discovers a single plugin with a manifest.yaml file", async () => {
    // Arrange
    const logger = createMockLogger();
    mockDirs = ["plugin-core", "no-manifest"];
    // Only plugin-core should have a manifest.yaml
    mockManifestPaths = ["plugin-core/manifest.yaml"];

    // Act
    const manifests = await scanManifests("/fake/packages", logger);

    // Assert
    expect(manifests).toHaveLength(1);
    expect(manifests[0]?.name).toBe("@audebase/plugin-core");
  });

  test("discovers multiple plugins with manifest.yaml files", async () => {
    // Arrange
    const logger = createMockLogger();
    mockDirs = ["plugin-core", "rbac", "audit", "i18n"];
    mockManifestPaths = [
      "plugin-core/manifest.yaml",
      "rbac/manifest.yaml",
      "audit/manifest.yaml",
      "i18n/manifest.yaml",
    ];

    // Act
    const manifests = await scanManifests("/fake/packages", logger);

    // Assert
    expect(manifests).toHaveLength(4);
    expect(manifests.map((m) => m.name)).toEqual([
      "@audebase/plugin-core",
      "@audebase/rbac",
      "@audebase/audit",
      "@audebase/i18n",
    ]);
  });

  test("returns empty array when no packages have manifest.yaml", async () => {
    // Arrange
    const logger = createMockLogger();
    mockDirs = ["no-manifest-a", "no-manifest-b"];
    mockManifestPaths = []; // none

    // Act
    const manifests = await scanManifests("/fake/packages", logger);

    // Assert
    expect(manifests).toEqual([]);
  });

  test("skips packages whose manifest.yaml fails to load", async () => {
    // Arrange
    const logger = createMockLogger();
    mockDirs = ["plugin-core", "bad-plugin"];
    mockManifestPaths = ["plugin-core/manifest.yaml", "bad-plugin/manifest.yaml"];

    // Act
    const manifests = await scanManifests("/fake/packages", logger);

    // Assert
    // Only plugin-core should be loaded; bad-plugin's parse error is skipped
    expect(manifests).toHaveLength(1);
    expect(manifests[0]?.name).toBe("@audebase/plugin-core");
    // Logger should have warned about the failed load
    expect(logger.warn).toHaveBeenCalled();
  });

  test("logs discovery information", async () => {
    // Arrange
    const logger = createMockLogger();
    mockDirs = ["plugin-core"];
    mockManifestPaths = ["plugin-core/manifest.yaml"];

    // Act
    await scanManifests("/fake/packages", logger);

    // Assert
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ manifestCount: 1 }),
      "manifests discovered",
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ manifestCount: 1 }),
      "manifests loaded and validated",
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: initAndLoadPlugins
// ---------------------------------------------------------------------------

describe("initAndLoadPlugins", () => {
  test("loads all manifests and returns LoaderResult", async () => {
    // Arrange
    const logger = createMockLogger();
    const manifests = [
      {
        name: "@audebase/plugin-core",
        version: "1.0.0",
        display_name: "Core",
        description: "Core plugin",
        dependencies: [],
        runtime: { mode: "inline" as const, partition: "SYSTEM" as const },
      },
      {
        name: "@audebase/rbac",
        version: "1.0.0",
        display_name: "RBAC",
        description: "RBAC plugin",
        dependencies: ["@audebase/plugin-core"],
        runtime: { mode: "inline" as const, partition: "SYSTEM" as const },
      },
    ];

    // Act
    const result: LoaderResult = await initAndLoadPlugins(manifests, logger);

    // Assert
    expect(result).toHaveProperty("manifests");
    expect(result).toHaveProperty("pluginManager");
    expect(result).toHaveProperty("loadedCount");
    expect(result).toHaveProperty("loadedNames");
    expect(result.loadedCount).toBe(2);
    expect(result.loadedNames).toEqual(["@audebase/plugin-core", "@audebase/rbac"]);
  });

  test("returns zero loadedCount when manifest list is empty", async () => {
    // Arrange
    const logger = createMockLogger();

    // Act
    const result: LoaderResult = await initAndLoadPlugins([], logger);

    // Assert
    expect(result.loadedCount).toBe(0);
    expect(result.loadedNames).toEqual([]);
  });

  test("logs plugin loading progress", async () => {
    // Arrange
    const logger = createMockLogger();
    const manifests = [
      {
        name: "@audebase/plugin-core",
        version: "1.0.0",
        display_name: "Core",
        description: "Core plugin",
        dependencies: [],
        runtime: { mode: "inline" as const, partition: "SYSTEM" as const },
      },
    ];

    // Act
    await initAndLoadPlugins(manifests, logger);

    // Assert
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ sortedOrder: ["@audebase/plugin-core"] }),
      "manifests sorted by dependencies",
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ pluginCount: 1 }),
      "plugins loaded",
    );
  });

  test("logs error when PluginManager.loadPlugins throws", async () => {
    // Arrange
    const logger = createMockLogger();
    const manifests = [
      {
        name: "@audebase/fail-plugin",
        version: "1.0.0",
        display_name: "Fail",
        description: "This will fail",
        dependencies: [],
        runtime: { mode: "inline" as const, partition: "SYSTEM" as const },
      },
    ];

    // Act
    const result: LoaderResult = await initAndLoadPlugins(manifests, logger);

    // Assert
    // Plugin name containing "fail" causes our mock to throw
    expect(result.loadedCount).toBe(0);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "startup" }),
      "plugin loading failed",
    );
  });
});
