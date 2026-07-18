/**
 * Core types for the plugin framework.
 *
 * PluginStatus is imported from @audebase/shared-types.
 * Manifest is imported from @audebase/manifest-engine.
 */
import type { Manifest } from "@audebase/manifest-engine";
import type { PluginStatus } from "@audebase/shared-types";

// Re-export for convenience
export type { PluginStatus } from "@audebase/shared-types";
export type { Manifest } from "@audebase/manifest-engine";

// ── PluginInstance ────────────────────────────────────────────

/**
 * A loaded plugin instance with its manifest and hooks.
 * Phase 1a: 2 states (loaded, disabled).
 */
export interface PluginInstance {
  /** Plugin package name */
  readonly name: string;
  /** Parsed manifest */
  readonly manifest: Manifest;
  /** Current state — managed by PluginManager */
  status: PluginStatus;
  /** Plugin's exported module (entry file result) */
  readonly source: Record<string, unknown>;

  // ── Lifecycle hooks (7 per D1.4) ──────────────────────────

  /** Called when plugin is first discovered (registration) */
  afterAdd?(): Promise<void>;
  /** Called before loading (register models, middleware, i18n) */
  beforeLoad?(): Promise<void>;
  /** Load the plugin (executed at entry import) */
  load(): Promise<void>;
  /** Install (create DB tables, config) */
  install?(): Promise<void>;
  /** After enabled (start cron, register listeners) */
  afterEnable?(): Promise<void>;
  /** After disabled (deregister listeners, stop cron) */
  afterDisable?(): Promise<void>;
  /** Before uninstall (warn about data loss) */
  preUninstall?(): Promise<void>;
}

// ── Lifecycle phase names ─────────────────────────────────────

export const LIFECYCLE_PHASES = [
  "afterAdd",
  "beforeLoad",
  "load",
  "install",
  "afterEnable",
  "afterDisable",
  "preUninstall",
] as const;

export type LifecyclePhase = (typeof LIFECYCLE_PHASES)[number];

// ── PluginHost interface ──────────────────────────────────────

/** Abstraction for loading/unloading a single plugin (D1.2). */
export interface PluginHost {
  /** Load a plugin from its manifest, returning a PluginInstance */
  loadPlugin(manifest: Manifest): Promise<PluginInstance>;
  /** Unload a previously loaded plugin */
  unloadPlugin(name: string): Promise<void>;
  /** Get a loaded plugin instance, or undefined */
  getPlugin(name: string): PluginInstance | undefined;
}

// ── PluginHost options ────────────────────────────────────────

/** Options for InlinePluginHost (Phase 1a mock constraints) */
export interface PluginHostOptions {
  /** Simulated IPC delay in ms (default 0 = no delay) */
  readonly mockDelay?: number;
  /** Timeout for plugin operations in ms (default 30000) */
  readonly timeout?: number;
}
