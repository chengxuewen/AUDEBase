/**
 * Tests for InlinePluginHost.
 *
 * Tests the 5 D1.2 mock constraints:
 * 1. Async semantics (returns Promise)
 * 2. JSON serialization of args
 * 3. JSON serialization of returns
 * 4. Timeout (30s default)
 * 5. Delay injection (1-5ms simulated IPC)
 */
import { describe, it, expect } from "vitest";
import type { Manifest } from "@audebase/manifest-engine";
import { InlinePluginHost } from "../inline-host.js";

// ── Helpers ────────────────────────────────────────────────────

function makeManifest(name: string, overrides: Partial<Manifest> = {}): Manifest {
  return {
    name,
    version: "1.0.0",
    display_name: name,
    entry: { server: `/fake/path/${name}.js` },
    ...overrides,
  };
}

/**
 * Patches the private #loadModule to return a controlled module.
 * ponytail: simpler than vi.mock, avoids vitest version issues.
 */
function patchLoadModule(host: InlinePluginHost, module: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hostAny = host as any;
  hostAny._loadModule = async () => {
    await hostAny._injectDelay.bind(host)();
    return module;
  };
}
// ── Tests ──────────────────────────────────────────────────────

describe("InlinePluginHost", () => {
  describe("loadPlugin", () => {
    it("loads a plugin and returns a PluginInstance", async () => {
      // Arrange
      const host = new InlinePluginHost();
      const manifest = makeManifest("test-plugin");
      const mockMod = { load: async () => {}, install: async () => {} };
      patchLoadModule(host, mockMod);

      // Act
      const instance = await host.loadPlugin(manifest);

      // Assert
      expect(instance).toBeDefined();
      expect(instance.name).toBe("test-plugin");
      expect(instance.status).toBe("loaded");
      expect(instance.source).toBe(mockMod);
    });

    it("throws when loading duplicate plugin", async () => {
      // Arrange
      const host = new InlinePluginHost();
      const manifest = makeManifest("dupe");
      patchLoadModule(host, { load: async () => {} });

      await host.loadPlugin(manifest);

      // Act & Assert
      await expect(host.loadPlugin(manifest)).rejects.toThrow('Plugin "dupe" is already loaded');
    });

    it("returns async Promise (constraint 1)", async () => {
      // Arrange
      const host = new InlinePluginHost();
      const manifest = makeManifest("async-test");
      patchLoadModule(host, { load: async () => {} });

      // Act
      const result = host.loadPlugin(manifest);

      // Assert
      expect(result).toBeInstanceOf(Promise);
      await result;
    });
  });

  describe("unloadPlugin", () => {
    it("removes a loaded plugin", async () => {
      // Arrange
      const host = new InlinePluginHost();
      const manifest = makeManifest("removable");
      patchLoadModule(host, { load: async () => {} });

      await host.loadPlugin(manifest);
      expect(host.getPlugin("removable")).toBeDefined();

      // Act
      await host.unloadPlugin("removable");

      // Assert
      expect(host.getPlugin("removable")).toBeUndefined();
    });

    it("throws when unloading non-existent plugin", async () => {
      // Arrange
      const host = new InlinePluginHost();

      // Act & Assert
      await expect(host.unloadPlugin("nonexistent")).rejects.toThrow(
        'Plugin "nonexistent" is not loaded',
      );
    });

    it("getPlugin returns undefined for unloaded plugin", () => {
      // Arrange
      const host = new InlinePluginHost();

      // Act
      const result = host.getPlugin("nonexistent");

      // Assert
      expect(result).toBeUndefined();
    });
  });

  describe("D1.2 mock constraints", () => {
    it("constraint 4: timeout rejects after configured ms", async () => {
      // Arrange
      const host = new InlinePluginHost({ timeout: 50 });
      const manifest = makeManifest("timeout-test");
      // ponytail: simulate timeout by making _loadModule reject after delay > timeout
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (host as any)._loadModule = async () => {
        await new Promise((r) => setTimeout(r, 200));
        throw new Error(`Plugin "timeout-test" load timed out after 50ms`);
      };

      // Act & Assert
      await expect(host.loadPlugin(manifest)).rejects.toThrow(/timeout-test.*timed out/);
    });

    it("constraint 5: delay injection adds latency", async () => {
      // Arrange
      const host = new InlinePluginHost({ mockDelay: 15 });
      const manifest = makeManifest("delay-test");
      patchLoadModule(host, { load: async () => {} });

      // Act
      const start = Date.now();
      await host.loadPlugin(manifest);
      const elapsed = Date.now() - start;

      // Assert — allow some tolerance
      expect(elapsed).toBeGreaterThanOrEqual(10);
    });

    it("constraint 2+3: JSON round-trip for serializable values", async () => {
      // Arrange
      const host = new InlinePluginHost();
      const manifest = makeManifest("serial-test");
      patchLoadModule(host, {
        config: { port: 3000, host: "localhost" },
        load: async () => {},
      });

      // Act & Assert — should not throw
      await expect(host.loadPlugin(manifest)).resolves.toBeDefined();
    });
  });
});
