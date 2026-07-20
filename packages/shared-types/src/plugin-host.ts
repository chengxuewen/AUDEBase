/**
 * PluginHost interface - Phase 1a (Inline)
 *
 * @audebase/shared-types
 */

import type { PluginStatus } from './plugin.js'

/**
 * Plugin manifest with all fields required by the plugin framework
 */
export interface PluginManifest {
  name: string
  version: string
  display_name: string
  description?: string
  category?: string
  license?: string
  author?: string
  application: { entry: string }
  runtime: { mode: 'inline' | 'process' | 'container'; partition: string }
  dependencies: string[]
  auto_install: boolean
  assets: unknown[]
  security: Record<string, unknown>
  models: unknown[]
  permissions: unknown[]
  cron: unknown[]
  data: unknown[]
}

/**
 * Logger interface for plugins (Pino-compatible subset)
 */
export interface PluginLogger {
  info: (msg: string, ...args: unknown[]) => void
  error: (msg: string, ...args: unknown[]) => void
  warn: (msg: string, ...args: unknown[]) => void
  debug?: (msg: string, ...args: unknown[]) => void
}

/**
 * Config manager interface for plugins
 */
export interface PluginConfig {
  get: (key: string) => unknown
}

/**
 * PluginHost - the context injected into each plugin by the framework.
 * Phase 1a: inline mode (same process, direct function calls).
 */
export interface PluginHost {
  /** Plugin name (package name) */
  readonly name: string
  /** Plugin status */
  readonly status: PluginStatus
  /** Plugin manifest */
  readonly manifest: PluginManifest

  // === Lifecycle hooks ===
  afterAdd?(): Promise<void>
  beforeLoad?(): Promise<void>
  load(): Promise<void>
  install?(): Promise<void>
  afterEnable?(): Promise<void>
  afterDisable?(): Promise<void>
  preUninstall?(): Promise<void>

  // === Context injection ===
  /** Database access (Drizzle instance or mock) */
  readonly db: unknown
  /** Translation function */
  t(key: string, params?: Record<string, string>): string
  /** Pino logger instance */
  logger: PluginLogger
  /** Core config manager */
  config: PluginConfig
}
