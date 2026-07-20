/**
 * Tests for parseManifestYaml — YAML parsing + validation pipeline.
 *
 * Covers: valid YAML, invalid YAML, edge cases, error conditions.
 */
import { describe, it, expect } from "vitest";
import { parseManifestYaml } from "../validator.js";

// ── Helpers ────────────────────────────────────────────────────

function validYaml(name: string): string {
  return `name: "${name}"
version: 1.0.0
display_name: Test Plugin
runtime:
  mode: inline
  partition: SYSTEM
application:
  entry: src/index.ts`;
}

// ── Tests ──────────────────────────────────────────────────────

describe("parseManifestYaml", () => {
  describe("valid YAML", () => {
    it("parses minimal valid YAML", () => {
      // Arrange
      const yaml = validYaml("@test/plugin-minimal");

      // Act
      const result = parseManifestYaml(yaml);

      // Assert
      expect(result.name).toBe("@test/plugin-minimal");
      expect(result.version).toBe("1.0.0");
      expect(result.display_name).toBe("Test Plugin");
    });

    it("parses YAML with category", () => {
      // Arrange
      const yaml = `${validYaml("@test/plugin-sys")}
category: SYSTEM`;

      // Act
      const result = parseManifestYaml(yaml);

      // Assert
      expect(result.category).toBe("SYSTEM");
    });

    it("parses YAML with dependencies", () => {
      // Arrange
      const yaml = `${validYaml("@test/plugin-with-deps")}
dependencies:
  - "@test/plugin-core"
  - "@test/plugin-rbac"`;

      // Act
      const result = parseManifestYaml(yaml);

      // Assert
      expect(result.dependencies).toHaveLength(2);
      expect(result.dependencies).toContain("@test/plugin-core");
    });

    it("parses YAML with models", () => {
      // Arrange
      const yaml = `${validYaml("@test/plugin-models")}
models:
  - name: user
    table: users
  - name: order
    table: orders`;

      // Act
      const result = parseManifestYaml(yaml);

      // Assert
      expect(result.models).toHaveLength(2);
      expect(result.models![0]!.name).toBe("user");
      expect(result.models![1]!.table).toBe("orders");
    });

    it("parses YAML with permissions", () => {
      // Arrange
      const yaml = `${validYaml("@test/plugin-perm")}
permissions:
  - action: users:read
    resource: users
  - action: users:create
    resource: users`;

      // Act
      const result = parseManifestYaml(yaml);

      // Assert
      expect(result.permissions).toHaveLength(2);
    });

    it("parses YAML with lifecycle config", () => {
      // Arrange
      const yaml = `${validYaml("@test/plugin-lifecycle")}
lifecycle:
  auto_install: true
  crash_policy: restart`;

      // Act
      const result = parseManifestYaml(yaml);

      // Assert
      expect(result.lifecycle?.auto_install).toBe(true);
    });
  });

  describe("invalid YAML", () => {
    it("throws on empty string", () => {
      // Act & Assert
      expect(() => parseManifestYaml("")).toThrow("PARSE_ERROR");
    });

    it("throws on whitespace-only string", () => {
      // Act & Assert
      expect(() => parseManifestYaml("   \n  \t  ")).toThrow("PARSE_ERROR");
    });

    it("throws on malformed YAML", () => {
      // Arrange — unclosed quote
      const bad = `name: "unclosed`;
      // Act & Assert
      expect(() => parseManifestYaml(bad)).toThrow("PARSE_ERROR");
    });

    it("throws on null document", () => {
      // Arrange
      const yaml = "null";
      // Act & Assert
      expect(() => parseManifestYaml(yaml)).toThrow("PARSE_ERROR");
    });

    it("throws on validation failure for missing fields", () => {
      // Arrange — missing name
      const yaml = `version: 1.0.0\ndisplay_name: X`;
      // Act & Assert
      expect(() => parseManifestYaml(yaml)).toThrow("VALIDATION_ERROR");
    });
  });

  describe("edge cases", () => {
    it("handles YAML with comments", () => {
      // Arrange
      const yaml = `# This is a comment
name: "@test/plugin-with-comments"
version: 1.0.0
display_name: Plugin With Comments # inline comment
runtime:
  mode: inline
  partition: SYSTEM
application:
  entry: src/index.ts`;

      // Act
      const result = parseManifestYaml(yaml);

      // Assert
      expect(result.name).toBe("@test/plugin-with-comments");
      expect(result.display_name).toBe("Plugin With Comments");
    });

    it("handles quoted string values", () => {
      // Arrange
      const yaml = `name: "@test/plugin-quotes"
version: "1.0.0"
display_name: "Plugin Name"
runtime:
  mode: inline
  partition: SYSTEM
application:
  entry: src/index.ts`;

      // Act
      const result = parseManifestYaml(yaml);

      // Assert
      expect(result.name).toBe("@test/plugin-quotes");
      expect(result.version).toBe("1.0.0");
    });

    it("handles boolean true/false values", () => {
      // Arrange
      const yaml = `${validYaml("@test/plugin-bool")}
lifecycle:
  auto_install: true
  crash_policy: ignore`;

      // Act
      const result = parseManifestYaml(yaml);

      // Assert
      expect(result.lifecycle?.auto_install).toBe(true);
    });
  });
});
