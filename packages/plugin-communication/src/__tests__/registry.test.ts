/**
 * Tests for ServiceRegistry.
 */
import { describe, it, expect } from "vitest";
import { ServiceRegistry } from "../registry.js";
import type { ServiceRegistration } from "../types.js";

// ── Helpers ────────────────────────────────────────────────────

function makeRegistration(overrides: Partial<ServiceRegistration> = {}): ServiceRegistration {
  return {
    method: "test:echo",
    pluginName: "test-plugin",
    handler: async (params) => params,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────

describe("ServiceRegistry", () => {
  describe("register", () => {
    it("registers a service handler by method name", () => {
      // Arrange
      const registry = new ServiceRegistry();
      const reg = makeRegistration();

      // Act
      registry.register(reg);

      // Assert
      const resolved = registry.resolve("test:echo");
      expect(resolved).toBeDefined();
      expect(resolved?.method).toBe("test:echo");
      expect(resolved?.pluginName).toBe("test-plugin");
    });

    it("throws when registering a duplicate method", () => {
      // Arrange
      const registry = new ServiceRegistry();
      const reg1 = makeRegistration();
      const reg2 = makeRegistration({ pluginName: "other-plugin" });
      registry.register(reg1);

      // Act & Assert
      expect(() => registry.register(reg2)).toThrow("already registered");
    });

    it("supports multiple services with different methods", () => {
      // Arrange
      const registry = new ServiceRegistry();
      const reg1 = makeRegistration({ method: "svc:a" });
      const reg2 = makeRegistration({ method: "svc:b" });

      // Act
      registry.register(reg1);
      registry.register(reg2);

      // Assert
      expect(registry.list()).toHaveLength(2);
    });
  });

  describe("unregister", () => {
    it("removes a registered service", () => {
      // Arrange
      const registry = new ServiceRegistry();
      registry.register(makeRegistration());

      // Act
      registry.unregister("test:echo");

      // Assert
      expect(registry.resolve("test:echo")).toBeUndefined();
    });

    it("does not throw when unregistering non-existent service", () => {
      // Arrange
      const registry = new ServiceRegistry();

      // Act & Assert
      expect(() => registry.unregister("nonexistent")).not.toThrow();
    });
  });

  describe("resolve", () => {
    it("returns undefined for unregistered method", () => {
      // Arrange
      const registry = new ServiceRegistry();

      // Act
      const result = registry.resolve("unknown:method");

      // Assert
      expect(result).toBeUndefined();
    });

    it("returns the registration with handler", async () => {
      // Arrange
      const registry = new ServiceRegistry();
      const handler = async (params: Readonly<Record<string, unknown>>) => ({
        echo: params.message,
      });
      registry.register(makeRegistration({ handler }));

      // Act
      const resolved = registry.resolve("test:echo");
      const result = await resolved!.handler({ message: "hello" });

      // Assert
      expect(result).toEqual({ echo: "hello" });
    });
  });

  describe("list", () => {
    it("returns empty array for empty registry", () => {
      // Arrange
      const registry = new ServiceRegistry();

      // Act
      const list = registry.list();

      // Assert
      expect(list).toHaveLength(0);
    });

    it("returns all registrations", () => {
      // Arrange
      const registry = new ServiceRegistry();
      registry.register(makeRegistration({ method: "svc:a" }));
      registry.register(makeRegistration({ method: "svc:b", pluginName: "other" }));

      // Act
      const list = registry.list();

      // Assert
      expect(list).toHaveLength(2);
      expect(list.map((r) => r.method).sort()).toEqual(["svc:a", "svc:b"]);
    });
  });

  describe("unregisterByPlugin", () => {
    it("removes all services for a given plugin", () => {
      // Arrange
      const registry = new ServiceRegistry();
      registry.register(makeRegistration({ method: "p1:a", pluginName: "plugin-1" }));
      registry.register(makeRegistration({ method: "p1:b", pluginName: "plugin-1" }));
      registry.register(makeRegistration({ method: "p2:a", pluginName: "plugin-2" }));

      // Act
      registry.unregisterByPlugin("plugin-1");

      // Assert
      expect(registry.list()).toHaveLength(1);
      expect(registry.resolve("p2:a")).toBeDefined();
      expect(registry.resolve("p1:a")).toBeUndefined();
      expect(registry.resolve("p1:b")).toBeUndefined();
    });

    it("does nothing for unknown plugin", () => {
      // Arrange
      const registry = new ServiceRegistry();
      registry.register(makeRegistration());

      // Act
      registry.unregisterByPlugin("unknown");

      // Assert
      expect(registry.list()).toHaveLength(1);
    });
  });
});
