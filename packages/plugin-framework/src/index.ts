/**
 * @audebase/plugin-framework — Core plugin architecture
 *
 * Provides PluginManager, PluginHost, InlinePluginHost for Phase 1a.
 * See docs/modules/plugin-framework-sdd.md for the full API contract.
 */

// Core types
export type {
  PluginInstance,
  PluginHost,
  PluginHostOptions,
  LifecyclePhase,
  PluginStatus,
  Manifest,
} from "./types.js";

// PluginManager — orchestrator
export { PluginManager } from "./plugin-manager.js";

// PluginHost — abstraction
export type { PluginHost as IPluginHost } from "./types.js";

// InlinePluginHost — Phase 1a implementation
export { InlinePluginHost } from "./inline-host.js";

// Dependency resolver
export { resolveDependencies } from "./resolver.js";

// Lifecycle runner
export { runLifecycle, runLifecycleSequence } from "./lifecycle.js";
