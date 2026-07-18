/**
 * Manifest types for Phase 1a manifest.yaml parsing.
 * Based on D1.5 manifest.yaml fields spec.
 */

/** Collection model definition in manifest */
export interface CollectionDef {
  readonly name: string;
  readonly table: string;
}

/** Permission declaration */
export interface PermissionDef {
  readonly action: string;
  readonly resource: string;
  readonly description?: string;
}

/** Author info */
export interface AuthorInfo {
  readonly name: string;
  readonly email?: string;
  readonly url?: string;
}

/** Plugin entry points */
export interface EntryConfig {
  readonly server?: string;
  readonly worker?: string;
}

/** Lifecycle hooks configuration */
export interface LifecycleConfig {
  readonly hooks?: Record<string, string>;
  readonly auto_install?: boolean;
}

/** Runtime configuration */
export interface RuntimeConfig {
  readonly mode: "inline" | "process" | "container";
  readonly partition: string;
  readonly crash_policy?: "restart" | "ignore";
}

/** Security configuration */
export interface SecurityConfig {
  readonly db_namespace?: string;
}

/** Assets configuration */
export interface AssetsConfig {
  readonly admin?: string;
  readonly public?: string[];
}

/** Locale configuration */
export interface LocaleConfig {
  readonly path: string;
}

/** Parsed manifest.yaml result */
export interface Manifest {
  readonly name: string;
  readonly version: string;
  readonly display_name: string;
  readonly description?: string;
  readonly category?: string;
  readonly license?: string;
  readonly application?: boolean;
  readonly entry?: EntryConfig;
  readonly author?: AuthorInfo;
  readonly dependencies?: readonly string[];
  readonly assets?: AssetsConfig;
  readonly lifecycle?: LifecycleConfig;
  readonly runtime?: RuntimeConfig;
  readonly security?: SecurityConfig;
  readonly exports?: readonly string[];
  readonly provides?: readonly string[];
  readonly permissions?: readonly PermissionDef[];
  readonly models?: readonly CollectionDef[];
  readonly locale?: LocaleConfig;
  readonly data?: readonly string[];
}

/** Single validation error */
export interface ValidationError {
  /** Dot-path to the field (e.g. "runtime.mode") */
  path: string;
  /** Human-readable error message */
  message: string;
  /** Error category code */
  code: "MISSING_FIELD" | "INVALID_FORMAT" | "INVALID_VALUE" | "UNKNOWN_FIELD";
}

/** Result of a standalone validation */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** All validation errors (empty array = passed) */
  errors: ValidationError[];
}
