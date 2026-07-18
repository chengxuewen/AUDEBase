/**
 * Tests for dependency resolver (Kahn topological sort).
 */
import { describe, it, expect } from "vitest";
import { ErrorCode, UserError } from "@audebase/shared-types";
import type { Manifest } from "@audebase/manifest-engine";
import { resolveDependencies } from "../resolver.js";

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

function namesOf(manifests: readonly Manifest[]): string[] {
  return manifests.map((m) => m.name);
}

// ── Tests ──────────────────────────────────────────────────────

describe("resolveDependencies", () => {
  it("returns empty array for empty input", () => {
    // Arrange & Act
    const result = resolveDependencies([]);

    // Assert
    expect(result).toEqual([]);
  });

  it("returns single plugin with no dependencies", () => {
    // Arrange
    const m = makeManifest("plugin-a");

    // Act
    const result = resolveDependencies([m]);

    // Assert
    expect(namesOf(result)).toEqual(["plugin-a"]);
  });

  it("sorts simple linear dependency chain (A → B → C)", () => {
    // Arrange
    const a = makeManifest("A", ["B"]);
    const b = makeManifest("B", ["C"]);
    const c = makeManifest("C");

    // Act
    const result = resolveDependencies([a, b, c]);

    // Assert
    expect(namesOf(result)).toEqual(["C", "B", "A"]);
  });

  it("sorts diamond dependency (D depends on B,C; B,C depend on A)", () => {
    // Arrange
    const a = makeManifest("A");
    const b = makeManifest("B", ["A"]);
    const c = makeManifest("C", ["A"]);
    const d = makeManifest("D", ["B", "C"]);

    // Act
    const result = resolveDependencies([d, b, c, a]);

    // Assert
    const names = namesOf(result);
    expect(names[0]).toBe("A");
    expect(names).toContain("B");
    expect(names).toContain("C");
    expect(names[names.length - 1]).toBe("D");
    // B must come before D, C must come before D
    expect(names.indexOf("B")).toBeLessThan(names.indexOf("D"));
    expect(names.indexOf("C")).toBeLessThan(names.indexOf("D"));
  });

  it("sorts multiple independent plugins", () => {
    // Arrange
    const plugins = [makeManifest("Z"), makeManifest("A"), makeManifest("M")];

    // Act
    const result = resolveDependencies(plugins);

    // Assert
    expect(result).toHaveLength(3);
    // All present, order depends on stable insertion
    expect(namesOf(result).sort()).toEqual(["A", "M", "Z"]);
  });

  it("throws on circular dependency (A → B → A)", () => {
    // Arrange
    const a = makeManifest("A", ["B"]);
    const b = makeManifest("B", ["A"]);

    // Act & Assert
    expect(() => resolveDependencies([a, b])).toThrow(UserError);
    try {
      resolveDependencies([a, b]);
    } catch (err) {
      expect(err).toBeInstanceOf(UserError);
      expect((err as UserError).code).toBe(ErrorCode.PLUGIN_CIRCULAR_DEPENDENCY);
    }
  });

  it("throws on circular dependency (A → B → C → A)", () => {
    // Arrange
    const a = makeManifest("A", ["B"]);
    const b = makeManifest("B", ["C"]);
    const c = makeManifest("C", ["A"]);

    // Act & Assert
    expect(() => resolveDependencies([a, b, c])).toThrow(UserError);
  });

  it("throws on missing dependency", () => {
    // Arrange
    const a = makeManifest("A", ["nonexistent"]);

    // Act & Assert
    expect(() => resolveDependencies([a])).toThrow(UserError);
    try {
      resolveDependencies([a]);
    } catch (err) {
      expect(err).toBeInstanceOf(UserError);
      expect((err as UserError).code).toBe(ErrorCode.PLUGIN_DEPENDENCY_MISSING);
      expect((err as UserError).details).toMatchObject({
        plugin: "A",
        missing: "nonexistent",
      });
    }
  });

  it("throws on self-dependency (A → A)", () => {
    // Arrange
    const a = makeManifest("A", ["A"]);

    // Act & Assert
    expect(() => resolveDependencies([a])).toThrow(UserError);
  });

  it("places SYSTEM partition plugins before others", () => {
    // Arrange
    const sys1 = makeManifest("sys-auth");
    const sys2 = makeManifest("sys-rbac");
    const biz = makeManifest("oa-approval", [], "oa");

    // Act
    const result = resolveDependencies([biz, sys1, sys2]);

    // Assert
    const names = namesOf(result);
    expect(names).toContain("sys-auth");
    expect(names).toContain("sys-rbac");
    expect(names).toContain("oa-approval");
    expect(names.indexOf("sys-auth")).toBeLessThan(names.indexOf("oa-approval"));
    expect(names.indexOf("sys-rbac")).toBeLessThan(names.indexOf("oa-approval"));
  });

  it("preserves topological order within partition groups", () => {
    // Arrange
    const sysBase = makeManifest("sys-base");
    const sysDep = makeManifest("sys-dep", ["sys-base"]);
    const oaDep = makeManifest("oa-dep", ["sys-base"], "oa");
    const erp = makeManifest("erp-core", ["sys-base", "oa-dep"], "erp");

    // Act
    const result = resolveDependencies([erp, oaDep, sysDep, sysBase]);

    // Assert
    const names = namesOf(result);
    // SYSTEM plugins first: sys-base before sys-dep
    expect(names.indexOf("sys-base")).toBeLessThan(names.indexOf("sys-dep"));
    // SYSTEM before non-SYSTEM
    expect(names.indexOf("sys-dep")).toBeLessThan(names.indexOf("oa-dep"));
    // Topological: erp-core depends on oa-dep, so oa-dep before erp-core
    expect(names.indexOf("oa-dep")).toBeLessThan(names.indexOf("erp-core"));
  });

  it("handles plugins with no dependencies field (undefined)", () => {
    // Arrange
    const m = {
      name: "A",
      version: "1.0.0",
      display_name: "A",
      runtime: { mode: "inline" as const, partition: "SYSTEM" },
    };

    // Act
    const result = resolveDependencies([m]);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("A");
  });

  it("handles 10+ plugins in complex graph", () => {
    // Arrange: A → B,C; B → D,E; C → F,G; D→H; E→H; F→I; G→I; H→J; I→J
    const J = makeManifest("J");
    const I = makeManifest("I", ["J"]);
    const H = makeManifest("H", ["J"]);
    const G = makeManifest("G", ["I"]);
    const F = makeManifest("F", ["I"]);
    const E = makeManifest("E", ["H"]);
    const D = makeManifest("D", ["H"]);
    const C = makeManifest("C", ["F", "G"]);
    const B = makeManifest("B", ["D", "E"]);
    const A = makeManifest("A", ["B", "C"]);

    // Act
    const result = resolveDependencies([A, B, C, D, E, F, G, H, I, J]);

    // Assert
    expect(result).toHaveLength(10);
    const names = namesOf(result);
    // J is root (no deps) → must be first
    expect(names[0]).toBe("J");
    // A is leaf (depends on everyone) → must be last
    expect(names[names.length - 1]).toBe("A");
  });
});
