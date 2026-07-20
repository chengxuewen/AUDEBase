/**
 * Tests for registerManifests — batch registration with duplicate detection.
 *
 * Covers: valid registration, duplicate detection, dependency ordering.
 */
import { describe, it, expect } from "vitest";
import type { Manifest } from "../types.js";
import { registerManifests } from "../validator.js";

// ── Helpers ────────────────────────────────────────────────────

function makeManifest(name: string, deps: string[] = []): Manifest {
  return {
    name,
    version: "1.0.0",
    display_name: name,
    dependencies: deps,
    runtime: { mode: "inline", partition: "SYSTEM" },
  } as unknown as Manifest;
}

// ── Tests ──────────────────────────────────────────────────────

describe("registerManifests", () => {
  describe("valid registration", () => {
    it("returns manifests in dependency order", () => {
      // Arrange
      const core = makeManifest("@test/plugin-core");
      const app = makeManifest("@test/plugin-app", ["@test/plugin-core"]);

      // Act
      const result = registerManifests([app, core]);

      // Assert
      expect(result.map((m) => m.name)).toEqual(["@test/plugin-core", "@test/plugin-app"]);
    });

    it("returns empty array for empty input", () => {
      // Arrange & Act
      const result = registerManifests([]);

      // Assert
      expect(result).toHaveLength(0);
    });

    it("returns single manifest unchanged", () => {
      // Arrange
      const m = makeManifest("@test/plugin-single");

      // Act
      const result = registerManifests([m]);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe("@test/plugin-single");
    });

    it("handles multiple independent manifests", () => {
      // Arrange
      const a = makeManifest("@test/plugin-a");
      const b = makeManifest("@test/plugin-b");
      const c = makeManifest("@test/plugin-c");

      // Act
      const result = registerManifests([a, b, c]);

      // Assert
      expect(result).toHaveLength(3);
    });
  });

  describe("duplicate detection", () => {
    it("throws on duplicate plugin names", () => {
      // Arrange
      const m1 = makeManifest("@test/plugin-dup");
      const m2 = makeManifest("@test/plugin-dup");

      // Act & Assert
      expect(() => registerManifests([m1, m2])).toThrow("DUPLICATE_NAME");
    });

    it("throws with correct error message containing plugin name", () => {
      // Arrange
      const m1 = makeManifest("@test/plugin-dup2");
      const m2 = makeManifest("@test/plugin-dup2");

      // Act & Assert
      expect(() => registerManifests([m1, m2])).toThrow(
        '@test/plugin-dup2',
      );
    });
  });

  describe("error propagation", () => {
    it("throws on invalid manifest (missing version)", () => {
      // Arrange
      const bad = {
        name: "@test/plugin-bad",
        display_name: "Bad Plugin",
      } as Manifest;

      // Act & Assert
      expect(() => registerManifests([bad])).toThrow();
    });
  });
});
