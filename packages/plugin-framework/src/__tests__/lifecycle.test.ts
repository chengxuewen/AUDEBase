/**
 * Tests for lifecycle hook runner.
 */
import { describe, it, expect, vi } from "vitest";
import { ErrorCode, UserError } from "@audebase/shared-types";
import type { PluginInstance } from "../types.js";
import { runLifecycle, runLifecycleSequence } from "../lifecycle.js";

// ── Helpers ────────────────────────────────────────────────────

function makeInstance(hooks: Partial<Record<string, () => Promise<void>>> = {}): PluginInstance {
  return {
    name: "test-plugin",
    manifest: {
      name: "test-plugin",
      version: "1.0.0",
      display_name: "Test Plugin",
    },
    status: "loaded",
    source: {},
    load: async () => {},
    ...hooks,
  };
}

// ── Tests ──────────────────────────────────────────────────────

describe("runLifecycle", () => {
  it("calls the specified hook when defined", async () => {
    // Arrange
    const hook = vi.fn().mockResolvedValue(undefined);
    const instance = makeInstance({ afterAdd: hook });

    // Act
    await runLifecycle(instance, "afterAdd");

    // Assert
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it("skips silently when hook is undefined", async () => {
    // Arrange
    const instance = makeInstance({}); // no hooks defined

    // Act & Assert — should not throw
    await expect(runLifecycle(instance, "install")).resolves.toBeUndefined();
  });

  it("throws UserError when hook throws", async () => {
    // Arrange
    const instance = makeInstance({
      install: async () => {
        throw new Error("DB connection failed");
      },
    });

    // Act & Assert
    try {
      await runLifecycle(instance, "install");
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(UserError);
      expect((err as UserError).code).toBe(ErrorCode.PLUGIN_LIFECYCLE_ERROR);
      expect((err as UserError).message).toContain("install");
      expect((err as UserError).message).toContain("DB connection failed");
    }
  });

  it("propagates hook error details", async () => {
    // Arrange
    const instance = makeInstance({
      beforeLoad: async () => {
        throw new Error("schema mismatch");
      },
    });

    // Act & Assert
    try {
      await runLifecycle(instance, "beforeLoad");
    } catch (err) {
      const ue = err as UserError;
      expect(ue.details).toMatchObject({
        plugin: "test-plugin",
        phase: "beforeLoad",
        originalError: "schema mismatch",
      });
    }
  });
});

describe("runLifecycleSequence", () => {
  it("runs hooks in specified order", async () => {
    // Arrange
    const order: string[] = [];
    const instance = makeInstance({
      afterAdd: async () => {
        order.push("afterAdd");
      },
      beforeLoad: async () => {
        order.push("beforeLoad");
      },
      load: async () => {
        order.push("load");
      },
      install: async () => {
        order.push("install");
      },
    });

    // Act
    await runLifecycleSequence(instance, ["afterAdd", "beforeLoad", "load", "install"]);

    // Assert
    expect(order).toEqual(["afterAdd", "beforeLoad", "load", "install"]);
  });

  it("skips undefined hooks in sequence", async () => {
    // Arrange
    const order: string[] = [];
    const instance = makeInstance({
      afterAdd: async () => {
        order.push("afterAdd");
      },
      load: async () => {
        order.push("load");
      },
      // beforeLoad and install are undefined
    });

    // Act
    await runLifecycleSequence(instance, ["afterAdd", "beforeLoad", "load", "install"]);

    // Assert
    expect(order).toEqual(["afterAdd", "load"]);
  });

  it("stops at first error", async () => {
    // Arrange
    const order: string[] = [];
    const instance = makeInstance({
      afterAdd: async () => {
        order.push("afterAdd");
      },
      beforeLoad: async () => {
        throw new Error("beforeLoad failed");
      },
      load: async () => {
        order.push("load");
      },
    });

    // Act & Assert
    await expect(
      runLifecycleSequence(instance, ["afterAdd", "beforeLoad", "load"]),
    ).rejects.toThrow(UserError);

    // load should NOT have been called
    expect(order).toEqual(["afterAdd"]);
  });

  it("runs empty sequence without error", async () => {
    // Arrange
    const instance = makeInstance();

    // Act & Assert
    await expect(runLifecycleSequence(instance, [])).resolves.toBeUndefined();
  });
});
