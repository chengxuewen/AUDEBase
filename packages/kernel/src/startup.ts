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
import type { Manifest } from "@audebase/manifest-engine";
import { ManifestLoader } from "@audebase/manifest-engine";
import {
  MigrationRunner,
  type MigrationRecord,
  type SqlExecutor,
} from "@audebase/migration-engine";
import { PluginManager, InlinePluginHost } from "@audebase/plugin-framework";
import type { DatabaseProvider } from "./db";
import { bootstrapKernel } from "./bootstrap";

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

interface KnownPluginSpec {
  name: string;
  version: string;
  display_name: string;
  description: string;
  dependencies: readonly string[];
  partition: string;
  auto_install: boolean;
}

/**
 * Phase 1a: hardcoded list of known plugins in the monorepo.
 * ponytail: build a dynamic scanner when plugin count > ~20.
 */
const KNOWN_PLUGINS: readonly KnownPluginSpec[] = [
  {
    name: "@audebase/plugin-core",
    version: "1.0.0",
    display_name: "Core Plugin",
    description: "Bootstrap plugin that creates initial system data on first run",
    dependencies: [],
    partition: "SYSTEM",
    auto_install: true,
  },
  {
    name: "@audebase/plugin-framework",
    version: "1.0.0",
    display_name: "Plugin Framework",
    description: "Core plugin architecture — PluginManager, PluginHost, InlinePluginHost",
    dependencies: [],
    partition: "SYSTEM",
    auto_install: false,
  },
  {
    name: "@audebase/manifest-engine",
    version: "1.0.0",
    display_name: "Manifest Engine",
    description: "Reads, parses, validates, and caches manifest.yaml files",
    dependencies: [],
    partition: "SYSTEM",
    auto_install: false,
  },
  {
    name: "@audebase/migration-engine",
    version: "1.0.0",
    display_name: "Migration Engine",
    description: "Three-stage database migration framework (Odoo + NocoBase)",
    dependencies: [],
    partition: "SYSTEM",
    auto_install: false,
  },
  {
    name: "@audebase/rbac",
    version: "1.0.0",
    display_name: "RBAC",
    description: "Role-based access control engine",
    dependencies: ["@audebase/plugin-core"],
    partition: "SYSTEM",
    auto_install: false,
  },
  {
    name: "@audebase/audit",
    version: "1.0.0",
    display_name: "Audit Log",
    description: "API write-operation audit logging",
    dependencies: ["@audebase/plugin-core"],
    partition: "SYSTEM",
    auto_install: false,
  },
  {
    name: "@audebase/i18n",
    version: "1.0.0",
    display_name: "i18n",
    description: "Internationalization engine with namespace isolation",
    dependencies: [],
    partition: "SYSTEM",
    auto_install: false,
  },
  {
    name: "@audebase/health-check",
    version: "1.0.0",
    display_name: "Health Check",
    description: "GET /health and /health/ready endpoints",
    dependencies: [],
    partition: "SYSTEM",
    auto_install: false,
  },
  {
    name: "@audebase/logging-infra",
    version: "1.0.0",
    display_name: "Logging Infrastructure",
    description: "Structured logging framework with Core aggregation",
    dependencies: [],
    partition: "SYSTEM",
    auto_install: false,
  },
];

// ── Builder ──────────────────────────────────────────────────

function buildManifests(): Manifest[] {
  return KNOWN_PLUGINS.map((spec) => ({
    name: spec.name,
    version: spec.version,
    display_name: spec.display_name,
    description: spec.description,
    dependencies: spec.dependencies,
    runtime: {
      mode: "inline" as const,
      partition: spec.partition,
    },
    lifecycle: {
      auto_install: spec.auto_install,
    },
  }));
}

function pluginPackageDir(pluginName: string): string {
  // ponytail: strip npm scope, use packages/<name>/ as plugin dir
  const dir = pluginName.replace("@audebase/", "");
  return `packages/${dir}`;
}

// ── Pipeline ─────────────────────────────────────────────────

/**
 * Run the full startup pipeline.
 *
 * Order:
 *   1. Build manifests for known plugins
 *   2. Validate each manifest
 *   3. Topological sort by dependencies
 *   4. Run migrations (no-op if no migration dirs)
 *   5. Bootstrap kernel (plugin-core install)
 *   6. Initialize PluginManager with InlinePluginHost
 *   7. Load plugins in sorted order
 *   8. Return StartupResult
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

  // a. Build manifests
  const manifests = buildManifests();
  const manifestCount = manifests.length;
  logger.info({ phase: "startup", manifestCount }, "manifests built");

  // b. Validate
  const loader = new ManifestLoader();
  for (const manifest of manifests) {
    const result = loader.validate(manifest);
    if (!result.valid) {
      logger.warn(
        {
          phase: "startup",
          plugin: manifest.name,
          errors: result.errors,
        },
        "manifest validation warning",
      );
    }
  }

  // c. Sort by dependencies (topological)
  const sorted = PluginManager.resolveDependencies(manifests);
  logger.info({ phase: "startup", sortedOrder: sorted.map((m) => m.name) }, "manifests sorted");

  // d. Run migrations
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

  // e. Bootstrap kernel (plugin-core install — creates admin user, roles, menus)
  try {
    await bootstrapKernel(db, logger);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(
      { phase: "startup", err: msg },
      "kernel bootstrap failed — continuing without seed data",
    );
  }

  // f. Init plugin framework
  const host = new InlinePluginHost();
  const manager = new PluginManager(host);

  // g. Load plugins
  let pluginCount = 0;
  const pluginNames: string[] = [];

  try {
    const loaded = await manager.loadPlugins(sorted);
    pluginCount = loaded.size;
    loaded.forEach((_, name) => pluginNames.push(name));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ phase: "startup", err: msg }, "plugin loading failed");
  }

  logger.info({ phase: "startup", pluginCount, pluginNames }, "plugins loaded");

  // h. Return
  return { manifestCount, migrationCount, pluginCount, pluginNames };
}
