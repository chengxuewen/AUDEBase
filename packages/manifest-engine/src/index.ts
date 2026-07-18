// Barrel exports for @audebase/manifest-engine
export { ManifestLoader } from "./loader.js";
export { validateManifest, validateManifestSafe, manifestSchema } from "./validator.js";
export type { ManifestSchema } from "./validator.js";
export type {
  Manifest,
  CollectionDef,
  PermissionDef,
  AuthorInfo,
  EntryConfig,
  LifecycleConfig,
  RuntimeConfig,
  SecurityConfig,
  AssetsConfig,
  LocaleConfig,
  ValidationResult,
  ValidationError,
} from "./types.js";
