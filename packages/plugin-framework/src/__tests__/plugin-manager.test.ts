/**
 * Tests for PluginManager — orchestration layer.
 *
 * Tests: load/unload, enable/disable, dependency resolution integration,
 * lifecycle execution, error handling, state tracking.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode, UserError } from "@audebase/shared-types";
import type { Manifest } from "@audebase/manifest-engine";
import type { PluginInstance, PluginHost } from "../types.js";
import { PluginManager } from "../plugin-manager.js";

// ── Helpers ────────────────────────────────────────────────────

function makeManifest(name: string, deps: string[] = [], partition: string = "SYSTEM"): Manifest {
  return {
    name,
    version: "1.0.0",
    display_name: name,
    dependencies: deps,
    runtime: { mode: "inline", partition },
  };
}

function createMockHost(plugins: Record<string, Record<string, unknown>> = {}): PluginHost {
  const instances = new Map<string, PluginInstance>();

  return {
    async loadPlugin(manifest: Manifest): Promise<PluginInstance> {
      const source = plugins[manifest.name] ?? { load: async () => {} };
      const instance: PluginInstance = {
        name: manifest.name,
        manifest,
        status: "loaded",
        source,
        load:
          typeof source.load === "function" ? (source.load as () => Promise<void>) : async () => {},
        afterAdd:
          typeof source.afterAdd === "function"
            ? (source.afterAdd as () => Promise<void>)
            : undefined,
        beforeLoad:
          typeof source.beforeLoad === "function"
            ? (source.beforeLoad as () => Promise<void>)
            : undefined,
        install:
          typeof source.install === "function"
            ? (source.install as () => Promise<void>)
            : undefined,
        afterEnable:
          typeof source.afterEnable === "function"
            ? (source.afterEnable as () => Promise<void>)
            : undefined,
        afterDisable:
          typeof source.afterDisable === "function"
            ? (source.afterDisable as () => Promise<void>)
            : undefined,
        preUninstall:
          typeof source.preUninstall === "function"
            ? (source.preUninstall as () => Promise<void>)
            : undefined,
      };
      instances.set(manifest.name, instance);
      return instance;
    },
    async unloadPlugin(name: string): Promise<void> {
      instances.delete(name);
    },
    getPlugin(name: string): PluginInstance | undefined {
      return instances.get(name);
    },
  };
}

// ── Tests ──────────────────────────────────────────────────────

describe("PluginManager", () => {
  let mgr: PluginManager;
  let host: PluginHost;

  beforeEach(() => {
    host = createMockHost();
    mgr = new PluginManager(host);
  });

  describe("static resolveDependencies", () => {
    it("returns sorted manifests", () => {
      // Arrange
      const a = makeManifest("core-lib");
      const b = makeManifest("core-app", ["core-lib"]);

      // Act
      const result = PluginManager.resolveDependencies([b, a]);

      // Assert
      expect(result.map((m) => m.name)).toEqual(["core-lib", "core-app"]);
    });
  });

  describe("loadPlugin / loadPlugins", () => {
    it("loads a single plugin and tracks it", async () => {
      // Arrange
      const manifest = makeManifest("test-plugin");

      // Act
      const instance = await mgr.loadPlugin(manifest);

      // Assert
      expect(instance).toBeDefined();
      expect(instance.name).toBe("test-plugin");
      expect(instance.status).toBe("loaded");
      expect(mgr.getPlugin("test-plugin")).toBeDefined();
      expect(mgr.isLoaded("test-plugin")).toBe(true);
    });

    it("loads multiple plugins in dependency order", async () => {
      // Arrange
      const core = makeManifest("core-lib");
      const app = makeManifest("core-app", ["core-lib"]);

      // Act
      const results = await mgr.loadPlugins([app, core]);

      // Assert
      expect(results.size).toBe(2);
      expect(results.has("core-lib")).toBe(true);
      expect(results.has("core-app")).toBe(true);
    });

    it("skips failing plugins without blocking others", async () => {
      // Arrange
      const bad = makeManifest("bad-plugin");
      const good = makeManifest("good-plugin");
      const failingHost = createMockHost({
        "bad-plugin": {
          load: async () => {
            throw new Error("bad plugin load failed");
          },
        },
        "good-plugin": {
          load: async () => {},
        },
      });
      const failingMgr = new PluginManager(failingHost);

      // Act
      const results = await failingMgr.loadPlugins([bad, good]);

      // Assert
      expect(results.size).toBe(1);
      expect(results.has("good-plugin")).toBe(true);
      expect(results.has("bad-plugin")).toBe(false);
    });
  });

  describe("unloadPlugin", () => {
    it("unloads a previously loaded plugin", async () => {
      // Arrange
      const manifest = makeManifest("to-unload");
      await mgr.loadPlugin(manifest);
      expect(mgr.isLoaded("to-unload")).toBe(true);

      // Act
      await mgr.unloadPlugin("to-unload");

      // Assert
      expect(mgr.isLoaded("to-unload")).toBe(false);
      expect(mgr.getPlugin("to-unload")).toBeUndefined();
    });

    it("throws when unloading non-existent plugin", async () => {
      // Act & Assert
      await expect(mgr.unloadPlugin("nonexistent")).rejects.toThrow(UserError);
      await expect(mgr.unloadPlugin("nonexistent")).rejects.toMatchObject({
        code: ErrorCode.PLUGIN_NOT_FOUND,
      });
    });

    it("runs preUninstall hook before unloading", async () => {
      // Arrange
      const preUninstallHook = vi.fn().mockResolvedValue(undefined);
      const hostWithHooks = createMockHost({
        "with-uninstall-hook": {
          load: async () => {},
          preUninstall: preUninstallHook,
        },
      });
      const hookMgr = new PluginManager(hostWithHooks);

      await hookMgr.loadPlugin(makeManifest("with-uninstall-hook"));

      // Act
      await hookMgr.unloadPlugin("with-uninstall-hook");

      // Assert
      expect(preUninstallHook).toHaveBeenCalledTimes(1);
    });
  });

  describe("enablePlugin / disablePlugin", () => {
    it("enables a loaded plugin and runs afterEnable", async () => {
      // Arrange
      const afterEnableHook = vi.fn().mockResolvedValue(undefined);
      const hostWithHooks = createMockHost({
        "enable-test": {
          load: async () => {},
          afterEnable: afterEnableHook,
        },
      });
      const hookMgr = new PluginManager(hostWithHooks);
      await hookMgr.loadPlugin(makeManifest("enable-test"));

      // Act
      await hookMgr.enablePlugin("enable-test");

      // Assert
      expect(afterEnableHook).toHaveBeenCalledTimes(1);
      const inst = hookMgr.getPlugin("enable-test");
      expect(inst?.status).toBe("enabled");
    });

    it("disablePlugin runs afterDisable and sets status to disabled", async () => {
      // Arrange
      const afterDisableHook = vi.fn().mockResolvedValue(undefined);
      const hostWithHooks = createMockHost({
        "disable-test": {
          load: async () => {},
          afterDisable: afterDisableHook,
        },
      });
      const hookMgr = new PluginManager(hostWithHooks);
      await hookMgr.loadPlugin(makeManifest("disable-test"));
      await hookMgr.enablePlugin("disable-test");

      // Act
      await hookMgr.disablePlugin("disable-test");

      // Assert
      expect(afterDisableHook).toHaveBeenCalledTimes(1);
      const inst = hookMgr.getPlugin("disable-test");
      expect(inst?.status).toBe("disabled");
    });

    it("throws when enabling non-existent plugin", async () => {
      // Act & Assert
      await expect(mgr.enablePlugin("nonexistent")).rejects.toThrow(UserError);
    });

    it("throws when disabling non-existent plugin", async () => {
      // Act & Assert
      await expect(mgr.disablePlugin("nonexistent")).rejects.toThrow(UserError);
    });
  });

  describe("getPlugin / getPlugins / isLoaded", () => {
    it("getPlugins returns all loaded plugins in load order", async () => {
      // Arrange
      const a = makeManifest("a");
      const b = makeManifest("b");
      await mgr.loadPlugins([a, b]);

      // Act
      const plugins = mgr.getPlugins();

      // Assert
      expect(plugins).toHaveLength(2);
      expect(plugins[0]!.name).toBe("a");
      expect(plugins[1]!.name).toBe("b");
    });

    it("isLoaded returns false for unloaded plugins", () => {
      // Act & Assert
      expect(mgr.isLoaded("nonexistent")).toBe(false);
    });
  });

  describe("error handling", () => {
    it("loadPlugin throws when plugin fails to load (single)", async () => {
      // Arrange
      const brokenHost: PluginHost = {
        loadPlugin: async () => {
          throw new Error("load failure");
        },
        unloadPlugin: async () => {},
        getPlugin: () => undefined,
      };
      const brokenMgr = new PluginManager(brokenHost);

      // Act & Assert
      await expect(brokenMgr.loadPlugin(makeManifest("fail"))).rejects.toThrow(UserError);
    });

    it("throws on non-existent plugin query", () => {
      // Act
      const result = mgr.getPlugin("nonexistent");

      // Assert
      expect(result).toBeUndefined();
    });
  });
});
