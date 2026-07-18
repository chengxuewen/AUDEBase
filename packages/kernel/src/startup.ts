/**
 * startup.ts — Kernel startup orchestration pipeline.
 *
 * Wires manifest-engine + migration-engine + plugin-framework + plugin-core
 * together in the correct order for Phase 1a MVP.
 *
 * Pipeline order:
 *   a. Build manifests for known plugins (hardcoded for Phase 1a)
 *   b. Validate each manifest
 *   c. Topological sort by dependencies
 *   d. Run migrations per plugin (no-op when no migrations exist)
 *   e. Bootstrap kernel (run plugin-core install — creates admin, roles, menus)
 *   f. Create PluginManager + InlinePluginHost
 *   g. Load plugins in sorted order
 *   h. Return StartupResult
 */
import type { FastifyBaseLogger } from "fastify";
import { resolveDependencies } from "@audebase/plugin-framework";
import {
  MigrationRunner,
  type MigrationRecord,
  type SqlExecutor,
} from "@audebase/migration-engine";
import type { DatabaseProvider } from "./db";
import { bootstrapKernel } from "./bootstrap";
import { scanManifests, initAndLoadPlugins } from "./plugins/loader";
// ── Types ────────────────────────────────────────────────────

export interface StartupOptions {
  /** Directories to scan for plugin manifests (unused in Phase 1a — hardcoded) */
  pluginDirs?: string[];
  /** If true, skip the entire startup pipeline (for tests) */
  skipPlugins?: boolean;
}

export interface StartupResult {
  /** Number of manifests built */
  manifestCount: number;
  /** Total migration files executed across all plugins */
  migrationCount: number;
  /** Number of plugins successfully loaded */
  pluginCount: number;
  /** Loaded plugin names in dependency order */
  pluginNames: string[];
}
// ── Known plugin manifests (Phase 1a hardcoded) ──────────────

// ponytail: moved to plugins/loader.ts which scans manifest.yaml files dynamically.
// The loader discovers plugins in packages/*/manifest.yaml at startup.

// ── Pipeline ─────────────────────────────────────────────────

/**
 * Run the full startup pipeline.
 *
 * Order:
 *   1. Scan for manifest.yaml files in packages/
 *   2. Sort manifests by dependencies (topological)
 *   3. Run migrations (no-op if no migration dirs)
 *   4. Bootstrap kernel (plugin-core install)
 *   5. Initialize PluginManager with InlinePluginHost
 *   6. Load plugins in sorted order
 *   7. Return StartupResult
 *
 * Errors in individual plugin migrations or loading are logged and skipped —
 * the pipeline continues for remaining plugins (Phase 1a: no cascading rollback).
 */
export async function startupPipeline(
  db: DatabaseProvider,
  logger: FastifyBaseLogger,
  options?: StartupOptions,
): Promise<StartupResult> {
  if (options?.skipPlugins) {
    logger.info({ phase: "startup" }, "startup pipeline skipped (skipPlugins=true)");
    return { manifestCount: 0, migrationCount: 0, pluginCount: 0, pluginNames: [] };
  }

  logger.info({ phase: "startup" }, "startup pipeline started");

  // a. Scan for manifests (dynamic discovery via manifest.yaml)
  const packagesDir = "packages";
  const manifests = await scanManifests(packagesDir, logger);
  const manifestCount = manifests.length;

  // b. Sort by dependencies (topological)
  const sorted = resolveDependencies(manifests);
  logger.info({ phase: "startup", sortedOrder: sorted.map((m) => m.name) }, "manifests sorted");

  // c. Run migrations
  const runner = new MigrationRunner();
  const history: readonly MigrationRecord[] = [];
  let migrationCount = 0;

  for (const manifest of sorted) {
    try {
      const executeSql: SqlExecutor = async (sql: string) => {
        await db.pool.query(sql);
      };

      const pluginDir = pluginPackageDir(manifest.name);
      const result = await runner.run(
        pluginDir,
        manifest.name,
        manifest.version,
        history,
        executeSql,
      );
      migrationCount += result.executed.length;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(
        { phase: "startup", plugin: manifest.name, err: msg },
        "migration failed, continuing",
      );
    }
  }

  logger.info({ phase: "startup", migrationCount }, "migrations complete");

  // d. Bootstrap kernel (plugin-core install — creates admin user, roles, menus)
  try {
    await bootstrapKernel(db, logger);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(
      { phase: "startup", err: msg },
      "kernel bootstrap failed — continuing without seed data",
    );
  }

  // e. Init plugin framework and load all plugins
  const { loadedCount: pluginCount, loadedNames: pluginNames } = await initAndLoadPlugins(
    manifests,
    logger,
  );

  // f. Return
  return { manifestCount, migrationCount, pluginCount, pluginNames };
}

function pluginPackageDir(pluginName: string): string {
  // ponytail: strip npm scope, use packages/<name>/ as plugin dir
  const dir = pluginName.replace("@audebase/", "");
  return `packages/${dir}`;
}
