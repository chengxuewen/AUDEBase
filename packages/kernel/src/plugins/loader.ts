/**
 * loader.ts — Dynamic plugin manifest discovery and loading.
 *
 * Scans the packages/ directory for manifest.yaml files, loads and validates
 * each, and initialises the PluginManager with all discovered plugins.
 *
 * Replaces the hardcoded KNOWN_PLUGINS list in startup.ts (§ Phase 1a).
 */
import { readdir, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { FastifyBaseLogger } from "fastify";
import type { Manifest } from "@audebase/manifest-engine";
import { ManifestLoader } from "@audebase/manifest-engine";
import { PluginManager, InlinePluginHost, resolveDependencies } from "@audebase/plugin-framework";

// ── Types ──────────────────────────────────────────────────────

export interface LoaderResult {
  /** All loaded and validated manifests in dependency order */
  manifests: Manifest[];
  /** The PluginManager instance with all plugins registered */
  pluginManager: PluginManager;
  /** Number of plugins successfully loaded */
  loadedCount: number;
  /** Names of loaded plugins in dependency order */
  loadedNames: string[];
}

// ── Manifest Discovery ─────────────────────────────────────────

const MANIFEST_FILENAME = "manifest.yaml";

/**
 * Scan a directory for subdirectories containing manifest.yaml files.
 *
 * Uses `readdir` on the packages directory; checks each entry for
 * a `manifest.yaml` file via `access(entry/manifest.yaml)`.
 *
 * This avoids glob / recursive descent — Phase 1a plugins are one level deep.
 *
 * @returns Absolute paths to discovered manifest.yaml files.
 */
async function findManifestPaths(packagesDir: string): Promise<string[]> {
  const absoluteDir = resolve(packagesDir);
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(absoluteDir, entry.name, MANIFEST_FILENAME);
    try {
      await access(manifestPath);
      results.push(manifestPath);
    } catch {
      // Directory has no manifest.yaml — skip
    }
  }

  return results;
}

/**
 * Load and validate all manifest.yaml files found in `packagesDir`.
 *
 * Each manifest is: read → parsed (inline YAML) → validated (Zod schema).
 * Validation failures are logged as warnings (the invalid manifest is skipped).
 *
 * @returns Array of valid Manifest objects.
 */
export async function scanManifests(
  packagesDir: string,
  logger: FastifyBaseLogger,
): Promise<Manifest[]> {
  const paths = await findManifestPaths(packagesDir);
  logger.info({ manifestCount: paths.length, paths }, "manifests discovered");

  const loader = new ManifestLoader();
  const manifests: Manifest[] = [];

  for (const filePath of paths) {
    try {
      const manifest = await loader.loadFromFile(filePath);
      manifests.push(manifest);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ phase: "startup", filePath, err: msg }, "manifest load failed, skipping");
    }
  }

  logger.info({ manifestCount: manifests.length }, "manifests loaded and validated");
  return manifests;
}

// ── Plugin Manager Initialization ──────────────────────────────

/**
 * Create a PluginManager, register all manifests, and load plugins
 * in dependency order.
 *
 * Errors from individual plugin loads are logged (the plugin is skipped)
 * but do not halt the pipeline (Phase 1a: no cascading rollback).
 *
 * @param manifests Manifests to load (already validated and deduplicated).
 * @param logger   Fastify logger for progress and error reporting.
 * @returns PluginManager with successfully loaded plugins + metadata.
 */
export async function initAndLoadPlugins(
  manifests: Manifest[],
  logger: FastifyBaseLogger,
): Promise<LoaderResult> {
  const sorted = resolveDependencies(manifests);
  logger.info({ sortedOrder: sorted.map((m) => m.name) }, "manifests sorted by dependencies");

  const host = new InlinePluginHost();
  const manager = new PluginManager(host);

  let loadedCount = 0;
  const loadedNames: string[] = [];

  try {
    const loaded = await manager.loadPlugins(sorted);
    loadedCount = loaded.size;
    loaded.forEach((_, name) => loadedNames.push(name));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ phase: "startup", err: msg }, "plugin loading failed");
  }

  logger.info({ pluginCount: loadedCount, pluginNames: loadedNames }, "plugins loaded");

  return {
    manifests: sorted,
    pluginManager: manager,
    loadedCount,
    loadedNames,
  };
}
