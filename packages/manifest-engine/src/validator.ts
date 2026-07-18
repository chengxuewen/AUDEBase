/**
 * Zod schemas and validation for manifest.yaml fields.
 * Phase 1a field subset per D1.5.
 */
import { z } from "zod";
import type { Manifest, ValidationResult, ValidationError } from "./types.js";

// ── Sub-schemas ────────────────────────────────────────────

const authorSchema = z.object({
  name: z.string().min(1, "author.name 不能为空"),
  email: z.string().email("author.email 格式无效").optional(),
  url: z.string().url("author.url 格式无效").optional(),
});

const entrySchema = z.object({
  server: z.string().optional(),
  worker: z.string().optional(),
});

const lifecycleSchema = z.object({
  hooks: z.record(z.string(), z.string()).optional(),
  auto_install: z.boolean().optional(),
});

const runtimeSchema = z.object({
  mode: z.enum(["inline", "process", "container"], {
    errorMap: () => ({ message: "Phase 1a 仅支持 mode=inline" }),
  }),
  partition: z.string().min(1, "runtime.partition 不能为空"),
  crash_policy: z.enum(["restart", "ignore"]).optional(),
});

const securitySchema = z.object({
  db_namespace: z.string().optional(),
});

const assetsSchema = z.object({
  admin: z.string().optional(),
  public: z.array(z.string()).optional(),
});

const localeSchema = z.object({
  path: z.string().min(1, "locale.path 不能为空"),
});

const collectionDefSchema = z.object({
  name: z
    .string()
    .min(1, "Collection 名称不能为空")
    .regex(/^[a-z][a-z0-9_]*$/, "Collection 名必须为 snake_case"),
  table: z
    .string()
    .min(1, "表名不能为空")
    .regex(/^[a-z][a-z0-9_]*$/, "表名必须为 snake_case"),
});

const permissionDefSchema = z.object({
  action: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9_:*]+$/, "action 格式: resource:verb"),
  resource: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9_-]+$/, "resource 必须为 kebab-case"),
  description: z.string().optional(),
});

// ── Main manifest schema ────────────────────────────────────

export const manifestSchema = z.object({
  // Required fields
  name: z
    .string()
    .min(1, "name 不能为空")
    .regex(/^[a-z][a-z0-9-]*$/, "name 必须为 kebab-case 格式 (例如: plugin-core)"),
  version: z
    .string()
    .min(1, "version 不能为空")
    .regex(/^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/, "version 必须符合 SemVer 格式 (例如: 1.0.0)"),
  display_name: z.string().min(1, "display_name 不能为空").max(255, "display_name 最多 255 个字符"),

  // Optional fields
  description: z.string().optional(),
  category: z.string().optional(),
  license: z.string().optional(),
  application: z.boolean().optional(),
  entry: entrySchema.optional(),
  author: authorSchema.optional(),
  dependencies: z.array(z.string()).optional(),
  assets: assetsSchema.optional(),
  lifecycle: lifecycleSchema.optional(),
  runtime: runtimeSchema.optional(),
  security: securitySchema.optional(),
  exports: z.array(z.string()).optional(),
  provides: z.array(z.string()).optional(),
  permissions: z.array(permissionDefSchema).optional(),
  models: z.array(collectionDefSchema).optional(),
  locale: localeSchema.optional(),
  data: z.array(z.string()).optional(),
});

// ── Type inference ──────────────────────────────────────────

/** Manifest type derived from Zod schema */
export type ManifestSchema = z.infer<typeof manifestSchema>;

// ── Validation function ─────────────────────────────────────

/**
 * Validate raw data against the manifest schema.
 * Returns validated Manifest on success, throws on failure.
 */
export function validateManifest(data: unknown): Manifest {
  const parsed = manifestSchema.parse(data);
  // Zod .parse already ensures all required fields are present
  // Cast to Manifest (Zod output is read-only compatible)
  return parsed;
}

/**
 * Validate raw data and return a structured ValidationResult.
 * Unlike validateManifest, this never throws — it collects all errors.
 */
export function validateManifestSafe(data: unknown): ValidationResult {
  const result = manifestSchema.safeParse(data);
  if (result.success) {
    return { valid: true, errors: [] };
  }

  const errors: ValidationError[] = result.error.issues.map((issue) => {
    const path = issue.path.join(".");
    return {
      path: path || "(root)",
      message: issue.message,
      code: mapZodCode(issue.code),
    };
  });

  return { valid: false, errors };
}

function mapZodCode(
  code: string,
): "MISSING_FIELD" | "INVALID_FORMAT" | "INVALID_VALUE" | "UNKNOWN_FIELD" {
  switch (code) {
    case "invalid_type":
      return "MISSING_FIELD";
    case "invalid_string":
    case "invalid_enum_value":
    case "invalid_literal":
      return "INVALID_VALUE";
    default:
      return "INVALID_FORMAT";
  }
}
