import { describe, test, expect } from "vitest";
import { validateManifest, validateManifestSafe } from "../validator.js";
import { manifestSchema } from "../schema.js";

// ── Valid minimal manifest ──────────────────────────────────

const minimalManifest = {
  name: "@audebase/plugin-test",
  version: "1.0.0",
  display_name: "Test Plugin",
};

const fullManifest = {
  name: "@audebase/plugin-core",
  version: "1.0.0",
  display_name: "Core Plugin",
  description: "The core plugin with bootstrap data",
  category: "SYSTEM",
  license: "Apache-2.0",
  dependencies: ["@audebase/plugin-rbac", "@audebase/plugin-audit"],
  assets: ["./public/logo.png"],
  lifecycle: {
    hooks: {
      afterAdd: "./hooks/afterAdd.ts",
    },
    auto_install: true,
  },
  runtime: {
    mode: "inline" as const,
    partition: "SYSTEM",
    crash_policy: "restart" as const,
  },
  security: {
    db_namespace: "core",
  },
  exports: ["handleRequest"],
  provides: ["menu.admin"],
  permissions: [{ action: "plugin:read", resource: "plugin", description: "Read plugins" }],
  models: [{ name: "user", table: "users" }],
  locale: {
    path: "./locale",
  },
  data: ["./seed/001_admin.sql"],
};

// ── Tests ───────────────────────────────────────────────────

describe("validateManifest", () => {
  test("valid minimal manifest passes", () => {
    const result = validateManifest(minimalManifest);
    expect(result.name).toBe("@audebase/plugin-test");
    expect(result.version).toBe("1.0.0");
    expect(result.display_name).toBe("Test Plugin");
  });

  test("valid full manifest passes", () => {
    const result = validateManifest(fullManifest);
    expect(result.name).toBe("@audebase/plugin-core");
    expect(result.description).toBe("The core plugin with bootstrap data");
    expect(result.runtime?.mode).toBe("inline");
    expect(result.permissions).toHaveLength(1);
    expect(result.models).toHaveLength(1);
    expect(result.dependencies).toEqual(["@audebase/plugin-rbac", "@audebase/plugin-audit"]);
    expect(result.locale?.path).toBe("./locale");
    expect(result.lifecycle?.auto_install).toBe(true);
  });

  test("missing name throws", () => {
    expect(() => validateManifest({ version: "1.0.0", display_name: "X" })).toThrow();
  });

  test("missing version throws", () => {
    expect(() => validateManifest({ name: "@audebase/plugin-x", display_name: "X" })).toThrow();
  });

  test("missing display_name is OK (optional)", () => {
    const result = validateManifest({ name: "@audebase/plugin-x", version: "1.0.0" });
    expect(result.name).toBe("@audebase/plugin-x");
    expect(result.version).toBe("1.0.0");
  });

  test("invalid name format throws", () => {
    expect(() =>
      validateManifest({ name: "MY-PLUGIN", version: "1.0.0", display_name: "X" }),
    ).toThrow();
  });

  test("name must match @scope/plugin-* format (underscore not allowed)", () => {
    expect(() =>
      validateManifest({ name: "@audebase/plugin_core", version: "1.0.0", display_name: "X" }),
    ).toThrow();
  });

  test("invalid version (v1) throws", () => {
    expect(() =>
      validateManifest({ name: "@audebase/plugin-x", version: "v1", display_name: "X" }),
    ).toThrow();
  });

  test("invalid version (not semver) throws", () => {
    expect(() =>
      validateManifest({ name: "@audebase/plugin-x", version: "not-a-version", display_name: "X" }),
    ).toThrow();
  });

  test("valid semver versions pass", () => {
    const versions = ["0.0.0", "1.0.0", "999.999.999", "1.0.0-alpha.1", "1.0.0+build.123"];
    for (const v of versions) {
      expect(() =>
        validateManifest({ name: "@audebase/plugin-x", version: v, display_name: "X" }),
      ).not.toThrow();
    }
  });

  test("invalid runtime.mode throws", () => {
    expect(() =>
      validateManifest({
        ...minimalManifest,
        runtime: { mode: "bad" as const, partition: "SYSTEM" },
      }),
    ).toThrow();
  });

  test("runtime.mode=process should fail in Phase 1a", () => {
    expect(() =>
      validateManifest({
        ...minimalManifest,
        runtime: { mode: "process" as const, partition: "SYSTEM" },
      }),
    ).toThrow();
  });

  test("empty permissions list passes", () => {
    const result = validateManifest({
      ...minimalManifest,
      permissions: [],
    });
    expect(result.permissions).toHaveLength(0);
  });

  test("empty models list passes", () => {
    const result = validateManifest({
      ...minimalManifest,
      models: [],
    });
    expect(result.models).toHaveLength(0);
  });

  test("invalid collection name throws", () => {
    expect(() =>
      validateManifest({
        ...minimalManifest,
        models: [{ name: "Invalid-Name", table: "users" }],
      }),
    ).toThrow();
  });

  test("invalid permission action throws", () => {
    expect(() =>
      validateManifest({
        ...minimalManifest,
        permissions: [{ action: "INVALID_ACTION", resource: "test" }],
      }),
    ).toThrow();
  });
});

// ── validateManifestSafe tests ──────────────────────────────

describe("validateManifestSafe", () => {
  test("returns valid=true for good manifest", () => {
    const result = validateManifestSafe(minimalManifest);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("returns valid=false with errors for bad manifest", () => {
    const result = validateManifestSafe({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("errors contain path, message, code", () => {
    const result = validateManifestSafe({ version: "bad", display_name: "X" });
    expect(result.valid).toBe(false);
    for (const err of result.errors) {
      expect(typeof err.path).toBe("string");
      expect(typeof err.message).toBe("string");
      expect(["MISSING_FIELD", "INVALID_FORMAT", "INVALID_VALUE", "UNKNOWN_FIELD"]).toContain(
        err.code,
      );
    }
  });

  test("aggregates all errors (not fail-fast)", () => {
    // Missing name + invalid version + missing display_name
    const result = validateManifestSafe({ version: "x" });
    expect(result.valid).toBe(false);
    // Should have at least 2 errors: missing name and missing display_name
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});

// ── manifestSchema directly ─────────────────────────────────

describe("manifestSchema", () => {
  test("parse returns parsed manifest", () => {
    const parsed = manifestSchema.parse(minimalManifest);
    expect(parsed.name).toBe("@audebase/plugin-test");
    expect(parsed.version).toBe("1.0.0");
  });

  test("safeParse returns success for valid data", () => {
    const result = manifestSchema.safeParse(minimalManifest);
    expect(result.success).toBe(true);
  });

  test("safeParse returns error for invalid data", () => {
    const result = manifestSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
