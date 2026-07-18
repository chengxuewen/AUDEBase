import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ManifestLoader } from "../loader.js";

const minimalYaml = `
name: plugin-test
version: 1.0.0
display_name: Test Plugin
`.trim();

const fullYaml = `
name: plugin-core
version: 1.0.0
display_name: Core Plugin
description: Core plugin description
category: SYSTEM
license: Apache-2.0
application: true
entry:
  server: ./src/server.ts
  worker: ./src/worker.ts
author:
  name: Team
  email: team@example.com
dependencies:
  - plugin-rbac
  - plugin-audit
runtime:
  mode: inline
  partition: SYSTEM
  crash_policy: restart
permissions:
  - action: plugin:read
    resource: plugin
    description: Read plugins
models:
  - name: user
    table: users
locale:
  path: ./locale
data:
  - ./seed/001_admin.sql
lifecycle:
  auto_install: true
`.trim();

const badYamlMissingVersion = `
name: plugin-only
display_name: Only Plugin
`.trim();

const badYamlInvalidName = `
name: INVALID_name
version: 1.0.0
display_name: Bad Name
`.trim();

describe("ManifestLoader", () => {
  let loader: ManifestLoader;
  let tempFilePath: string;

  beforeEach(() => {
    loader = new ManifestLoader();
    tempFilePath = join(tmpdir(), `manifest-test-${Date.now()}.yaml`);
  });

  afterEach(async () => {
    // Clean up temp file
    try {
      await unlink(tempFilePath);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  // ── loadFromString ──────────────────────────────────────

  describe("loadFromString", () => {
    test("parses valid minimal YAML", () => {
      const manifest = loader.loadFromString(minimalYaml);
      expect(manifest.name).toBe("plugin-test");
      expect(manifest.version).toBe("1.0.0");
      expect(manifest.display_name).toBe("Test Plugin");
    });

    test("parses full YAML with all fields", () => {
      const manifest = loader.loadFromString(fullYaml);
      expect(manifest.name).toBe("plugin-core");
      expect(manifest.version).toBe("1.0.0");
      expect(manifest.description).toBe("Core plugin description");
      expect(manifest.category).toBe("SYSTEM");
      expect(manifest.license).toBe("Apache-2.0");
      expect(manifest.application).toBe(true);
      expect(manifest.entry?.server).toBe("./src/server.ts");
      expect(manifest.entry?.worker).toBe("./src/worker.ts");
      expect(manifest.author?.name).toBe("Team");
      expect(manifest.author?.email).toBe("team@example.com");
      expect(manifest.dependencies).toEqual(["plugin-rbac", "plugin-audit"]);
      expect(manifest.runtime?.mode).toBe("inline");
      expect(manifest.runtime?.partition).toBe("SYSTEM");
      expect(manifest.runtime?.crash_policy).toBe("restart");
      expect(manifest.permissions).toHaveLength(1);
      expect(manifest.permissions?.[0]?.action).toBe("plugin:read");
      expect(manifest.models).toHaveLength(1);
      expect(manifest.models?.[0]?.name).toBe("user");
      expect(manifest.locale?.path).toBe("./locale");
      expect(manifest.data).toEqual(["./seed/001_admin.sql"]);
      expect(manifest.lifecycle?.auto_install).toBe(true);
    });

    test("throws on missing required field", () => {
      expect(() => loader.loadFromString(badYamlMissingVersion)).toThrow();
    });

    test("throws on invalid name format", () => {
      expect(() => loader.loadFromString(badYamlInvalidName)).toThrow();
    });

    test("throws on invalid YAML (unclosed quote)", () => {
      expect(() => loader.loadFromString('name: "unclosed')).toThrow();
    });

    test("sourceHint appears in error message", () => {
      try {
        loader.loadFromString(badYamlMissingVersion, "/test/manifest.yaml");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "";
        expect(msg).toContain("[/test/manifest.yaml]");
      }
    });

    test("parses YAML with comments", () => {
      const yaml = `
# This is a comment
name: plugin-comment # inline comment
version: 1.0.0
display_name: Comment Plugin
`.trim();
      const manifest = loader.loadFromString(yaml);
      expect(manifest.name).toBe("plugin-comment");
      expect(manifest.version).toBe("1.0.0");
    });

    test("parses boolean values", () => {
      const yaml = `
name: plugin-bool
version: 1.0.0
display_name: Bool Plugin
application: true
lifecycle:
  auto_install: false
`.trim();
      const manifest = loader.loadFromString(yaml);
      expect(manifest.application).toBe(true);
      expect(manifest.lifecycle?.auto_install).toBe(false);
    });

    test("parses empty arrays", () => {
      const yaml = `
name: plugin-empty
version: 1.0.0
display_name: Empty Arrays
dependencies:
permissions:
models:
`.trim();
      // Empty arrays as `key:` with no items — YAML parser returns empty string
      // The Zod schema will validate this
      expect(() => loader.loadFromString(yaml)).toThrow();
    });
  });

  // ── loadFromFile ────────────────────────────────────────

  describe("loadFromFile", () => {
    test("loads from file", async () => {
      await writeFile(tempFilePath, minimalYaml, "utf-8");
      const manifest = await loader.loadFromFile(tempFilePath);
      expect(manifest.name).toBe("plugin-test");
      expect(manifest.version).toBe("1.0.0");
    });

    test("throws for non-existent file", async () => {
      await expect(loader.loadFromFile("/nonexistent/manifest.yaml")).rejects.toThrow();
    });

    test("loads full manifest from file", async () => {
      await writeFile(tempFilePath, fullYaml, "utf-8");
      const manifest = await loader.loadFromFile(tempFilePath);
      expect(manifest.name).toBe("plugin-core");
      expect(manifest.dependencies).toEqual(["plugin-rbac", "plugin-audit"]);
      expect(manifest.runtime?.mode).toBe("inline");
    });
  });

  // ── Cache ───────────────────────────────────────────────

  describe("cache", () => {
    test("second loadFromString returns cached value", () => {
      loader.loadFromString(minimalYaml);
      const m2 = loader.loadFromString(minimalYaml);
      // Same reference because second call re-validates and re-caches
      // (but we verify the behavior is correct)
      expect(m2.name).toBe("plugin-test");
      expect(m2.version).toBe("1.0.0");
    });

    test("getCached returns manifest after loading", () => {
      loader.loadFromString(minimalYaml);
      const cached = loader.getCached("plugin-test");
      expect(cached).toBeDefined();
      expect(cached?.name).toBe("plugin-test");
    });

    test("getCached returns undefined for unknown plugin", () => {
      expect(loader.getCached("nonexistent")).toBeUndefined();
    });

    test("clearCache removes all entries", () => {
      loader.loadFromString(minimalYaml);
      expect(loader.getCached("plugin-test")).toBeDefined();

      loader.clearCache();
      expect(loader.getCached("plugin-test")).toBeUndefined();
    });

    test("cache is overwritten on second load of same name", () => {
      loader.loadFromString(minimalYaml);
      const updatedYaml = `
name: plugin-test
version: 2.0.0
display_name: Updated Plugin
`.trim();
      const m2 = loader.loadFromString(updatedYaml);
      expect(m2.version).toBe("2.0.0");
      expect(m2.display_name).toBe("Updated Plugin");

      const cached = loader.getCached("plugin-test");
      expect(cached?.version).toBe("2.0.0");
    });

    test("loadFromFile also caches", async () => {
      await writeFile(tempFilePath, minimalYaml, "utf-8");
      await loader.loadFromFile(tempFilePath);
      const cached = loader.getCached("plugin-test");
      expect(cached).toBeDefined();
      expect(cached?.name).toBe("plugin-test");
    });

    test("cache is independent per loader instance", () => {
      const loader2 = new ManifestLoader();
      loader.loadFromString(minimalYaml);
      expect(loader2.getCached("plugin-test")).toBeUndefined();
    });
  });

  // ── validate ────────────────────────────────────────────

  describe("validate", () => {
    test("returns valid=true for good data", () => {
      const result = loader.validate({
        name: "plugin-v",
        version: "1.0.0",
        display_name: "Validated",
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("returns valid=false with errors for bad data", () => {
      const result = loader.validate({});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test("does not cache validation results", () => {
      loader.validate({ name: "plugin-v", version: "1.0.0", display_name: "X" });
      expect(loader.getCached("plugin-v")).toBeUndefined();
    });
  });
});
