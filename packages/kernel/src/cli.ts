#!/usr/bin/env node
/**
 * AUDEBase kernel CLI entry point.
 */
import pino from "pino";
import { loadConfig } from "./config";
import { createDatabaseProvider } from "./db";
import { startupPipeline } from "./startup";
import { startKernel } from "./index";
import { modules } from "./db/schema/modules";
import { eq, isNull } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

const HELP_TEXT = `Usage: aude <command>

Commands:
  start                       Start the AUDEBase kernel server
  db:migrate                  Run database migrations and exit
  tenant create <name>        Create a new tenant
  tenant list                 List all tenants
  plugin scaffold <name>      Generate plugin skeleton
  plugin list                 List discovered system plugins
  plugin info <name>          Show detailed plugin info
  plugin enable <name>        Enable a plugin (set state to loaded)
  plugin disable <name>       Disable a plugin (set state to disabled)
  doctor                      Run health checks (manifest, TS, tests, i18n)
  --help, -h                  Show this help message

Examples:
  aude start
  aude db:migrate
  aude tenant create my-org
  aude tenant list
  aude plugin scaffold my-plugin --partition oa --with-models
  aude plugin list
  aude plugin info my-plugin
  aude plugin enable my-plugin
  aude doctor
  DATABASE_URL=postgres://... AUDE_JWT_SECRET=... aude start
`;

// ── Parsing (extracted for testability) ──────────────────────

export interface ParsedArgs {
  command: "start" | "db:migrate" | "tenant" | "plugin" | "doctor" | "help" | "unknown";
  subcommand?: "create" | "list" | "info" | "enable" | "disable" | "scaffold";
  tenantName?: string;
  pluginName?: string;
  unknownName?: string;
  pluginOptions?: {
    partition?: string;
    mode?: string;
    withModels?: boolean;
  };
}

function parsePluginOptions(args: readonly string[]): NonNullable<ParsedArgs["pluginOptions"]> {
  const options: NonNullable<ParsedArgs["pluginOptions"]> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--partition" && i + 1 < args.length) {
      options.partition = args[++i]!;
    } else if (arg === "--mode" && i + 1 < args.length) {
      options.mode = args[++i]!;
    } else if (arg === "--with-models") {
      options.withModels = true;
    }
  }
  return options;
}

export function parseArgs(args: readonly string[]): ParsedArgs {
  const cmd = args[2];

  if (cmd === "start") return { command: "start" };
  if (cmd === "db:migrate") return { command: "db:migrate" };
  if (cmd === "--help" || cmd === "-h") return { command: "help" };
  if (cmd === "doctor") return { command: "doctor" };

  if (cmd === "tenant") {
    const sub = args[3];
    if (sub === "create") return { command: "tenant", subcommand: "create", tenantName: args[4] };
    if (sub === "list") return { command: "tenant", subcommand: "list" };
    return { command: "tenant" };
  }

  if (cmd === "plugin") {
    const sub = args[3];
    if (sub === "scaffold") {
      return {
        command: "plugin",
        subcommand: "scaffold",
        pluginName: args[4],
        pluginOptions: parsePluginOptions(args.slice(5)),
      };
    }
    if (sub === "list") return { command: "plugin", subcommand: "list" };
    if (sub === "info") return { command: "plugin", subcommand: "info", pluginName: args[4] };
    if (sub === "enable") return { command: "plugin", subcommand: "enable", pluginName: args[4] };
    if (sub === "disable") return { command: "plugin", subcommand: "disable", pluginName: args[4] };
    return { command: "plugin" };
  }

  return { command: "unknown", unknownName: cmd };
}

// ── Tenant commands ──────────────────────────────────────────

async function tenantCreate(
  provider: ReturnType<typeof createDatabaseProvider>,
  logger: pino.Logger,
  name: string | undefined,
): Promise<void> {
  if (!name) {
    process.stderr.write("Usage: aude tenant create <name>\n");
    process.exit(1);
  }

  const { db } = provider;
  try {
    const [inserted] = await db
      .insert(modules)
      .values({
        name,
        version: "1.0.0",
        display_name: name,
        state: "loaded",
      })
      .returning();
    if (!inserted) {
      logger.error("failed to create tenant: no row returned");
      process.exit(1);
    }
    process.stdout.write(`Tenant created: ${name} (${inserted.id})\n`);
  } catch (err: unknown) {
    logger.error({ err }, "failed to create tenant");
    process.exit(1);
  }
}

async function tenantList(provider: ReturnType<typeof createDatabaseProvider>): Promise<void> {
  const { db } = provider;
  try {
    const rows = await db.select().from(modules);

    if (rows.length === 0) {
      process.stdout.write("No tenants found.\n");
      return;
    }

    for (const row of rows) {
      process.stdout.write(`${row.id}  ${row.name.padEnd(24)} ${row.state}\n`);
    }
  } catch {
    process.stderr.write("failed to list tenants\n");
    process.exit(1);
  }
}

// ── Plugin commands ──────────────────────────────────────────

function pluginScaffold(
  name: string | undefined,
  options: ParsedArgs["pluginOptions"] | undefined,
): void {
  if (!name) {
    process.stderr.write(
      "Usage: aude plugin scaffold <name> [--partition oa] [--mode inline] [--with-models]\n",
    );
    process.exit(1);
  }

  const partition = options?.partition ?? "oa";
  const mode = options?.mode ?? "inline";
  const withModels = options?.withModels ?? false;
  const pkgName = `@audebase/plugin-${name}`;
  const dir = path.join(process.cwd(), "packages", name);

  if (fs.existsSync(dir)) {
    process.stderr.write(`ERROR: directory already exists: ${dir}\n`);
    process.exit(1);
  }

  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.mkdirSync(path.join(dir, "locale"), { recursive: true });

  // manifest.yaml
  const manifest =
    [
      `name: "${pkgName}"`,
      `version: "0.1.0"`,
      `display_name: "${name}"`,
      `description: "Plugin: ${name}"`,
      `category: "${partition}"`,
      `license: "Apache-2.0"`,
      "",
      "application:",
      '  entry: "./src/index.ts"',
      '  author: "AUDEBase Team"',
      "",
      "dependencies: []",
      "",
      "lifecycle:",
      "  auto_install: false",
      "",
      "runtime:",
      `  mode: ${mode}`,
      `  partition: ${partition}`,
      "  crash_policy: restart",
      "",
      "security:",
      '  db_namespace: "public"',
      "",
      "permissions: []",
    ].join("\n") + "\n";

  // package.json
  const packageJson = `{
  "name": "${pkgName}",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsc --noEmit",
    "type-check": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@audebase/plugin-framework": "workspace:*",
    "@audebase/shared-types": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
`;

  // tsconfig.json
  const tsconfig = `{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
`;

  // vitest.config.ts
  const vitestConfig = `import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "${name}",
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/__tests__/**"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
`;

  // src/index.ts — PascalCase class name from kebab-case
  const className =
    name
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("") + "Plugin";

  const indexTs = `/**
 * ${pkgName} — Generated plugin.
 *
 * Category: ${partition}  |  Partition: ${partition}  |  Mode: ${mode}
 */

// ---------------------------------------------------------------------------
// Plugin Instance
// ---------------------------------------------------------------------------

/**
 * Plugin instance implementing the full plugin lifecycle.
 * All 7 lifecycle hooks are provided as async methods.
 */
export class ${className} {
  readonly name = "${pkgName}";

  private loaded = false;
  private installed = false;
  private enabled = false;

  async afterAdd(): Promise<void> {}

  async beforeLoad(): Promise<void> {}

  async load(): Promise<void> {
    this.loaded = true;
  }

  async install(): Promise<void> {
    this.installed = true;
  }

  async afterEnable(): Promise<void> {
    this.enabled = true;
  }

  async afterDisable(): Promise<void> {
    this.enabled = false;
  }

  async preUninstall(): Promise<void> {}

  get isLoaded(): boolean {
    return this.loaded;
  }

  get isInstalled(): boolean {
    return this.installed;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create a new plugin instance for the PluginManager. */
export function createPlugin(): ${className} {
  return new ${className}();
}
`;

  fs.writeFileSync(path.join(dir, "manifest.yaml"), manifest);
  fs.writeFileSync(path.join(dir, "package.json"), packageJson);
  fs.writeFileSync(path.join(dir, "tsconfig.json"), tsconfig);
  fs.writeFileSync(path.join(dir, "vitest.config.ts"), vitestConfig);
  fs.writeFileSync(path.join(dir, "src", "index.ts"), indexTs);
  fs.writeFileSync(path.join(dir, "locale", "zh-CN.json"), "{}\n");
  fs.writeFileSync(path.join(dir, "locale", "en-US.json"), "{}\n");

  if (withModels) {
    const migrationsDir = path.join(dir, "migrations", "0.1.0");
    fs.mkdirSync(migrationsDir, { recursive: true });
    fs.writeFileSync(path.join(migrationsDir, "preload.sql"), "-- Migration: 0.1.0 preload\n\n");
  }

  process.stdout.write(`Plugin scaffolded: ${dir}\n`);
}

async function pluginListOperation(
  provider: ReturnType<typeof createDatabaseProvider>,
  logger: pino.Logger,
): Promise<void> {
  const { db } = provider;
  try {
    const rows = await db.select().from(modules).where(isNull(modules.tenant_id));

    if (rows.length === 0) {
      process.stdout.write("No system plugins found.\n");
      return;
    }

    for (const row of rows) {
      process.stdout.write(`${row.id}  ${row.name.padEnd(32)} ${row.state}\n`);
    }
  } catch (err: unknown) {
    logger.error({ err }, "failed to list plugins");
    process.exit(1);
  }
}

async function pluginInfoOperation(
  provider: ReturnType<typeof createDatabaseProvider>,
  logger: pino.Logger,
  name: string | undefined,
): Promise<void> {
  if (!name) {
    process.stderr.write("Usage: aude plugin info <name>\n");
    process.exit(1);
  }
  const { db } = provider;
  try {
    const [row] = await db.select().from(modules).where(eq(modules.name, name));

    if (!row) {
      process.stdout.write(`Plugin not found: ${name}\n`);
      process.exit(1);
    }

    process.stdout.write(`Name:        ${row.name}\n`);
    process.stdout.write(`Version:     ${row.version}\n`);
    process.stdout.write(`Display:     ${row.display_name}\n`);
    process.stdout.write(`State:       ${row.state}\n`);
    process.stdout.write(`Category:    ${row.category ?? "-"}\n`);
    process.stdout.write(`Mode:        ${row.runtime_mode}\n`);
    process.stdout.write(`Partition:   ${row.runtime_partition}\n`);
    process.stdout.write(`Auto-Install: ${row.auto_install ? "yes" : "no"}\n`);
    process.stdout.write(`Manifest:    ${row.manifest_path ?? "-"}\n`);
    if (row.description) {
      process.stdout.write(`Description: ${row.description}\n`);
    }
    if (row.author) {
      process.stdout.write(`Author:      ${row.author}\n`);
    }
  } catch (err: unknown) {
    logger.error({ err }, "failed to get plugin info");
    process.exit(1);
  }
}

async function pluginSetState(
  provider: ReturnType<typeof createDatabaseProvider>,
  logger: pino.Logger,
  name: string | undefined,
  state: "loaded" | "disabled",
  verb: string,
): Promise<void> {
  if (!name) {
    process.stderr.write(`Usage: aude plugin ${verb} <name>\n`);
    process.exit(1);
  }
  const { db } = provider;
  try {
    const result = await db
      .update(modules)
      .set({ state, updated_at: new Date() })
      .where(eq(modules.name, name))
      .returning();

    if (result.length === 0) {
      process.stdout.write(`Plugin not found: ${name}\n`);
      process.exit(1);
    }

    process.stdout.write(`Plugin ${name} ${verb}d (state: ${state})\n`);
  } catch (err: unknown) {
    logger.error({ err }, `failed to ${verb} plugin`);
    process.exit(1);
  }
}

async function handlePluginCommand(
  parsed: ParsedArgs,
  provider: ReturnType<typeof createDatabaseProvider>,
  logger: pino.Logger,
): Promise<void> {
  if (parsed.subcommand === "list") {
    await pluginListOperation(provider, logger);
  } else if (parsed.subcommand === "info") {
    await pluginInfoOperation(provider, logger, parsed.pluginName);
  } else if (parsed.subcommand === "enable") {
    await pluginSetState(provider, logger, parsed.pluginName, "loaded", "enable");
  } else if (parsed.subcommand === "disable") {
    await pluginSetState(provider, logger, parsed.pluginName, "disabled", "disable");
  } else {
    process.stdout.write("Usage: aude plugin <scaffold|list|info|enable|disable>\n");
    process.exit(1);
  }
}

// ── Doctor ─────────────────────────────────────────────────────

interface DoctorResult {
  readonly label: string;
  readonly ok: boolean;
  readonly detail: string;
}

function checkManifests(): DoctorResult {
  const packagesDir = path.join(process.cwd(), "packages");
  const errors: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(packagesDir, { withFileTypes: true });
  } catch {
    return { label: "manifests", ok: false, detail: "cannot read packages directory" };
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(packagesDir, entry.name, "manifest.yaml");
    if (!fs.existsSync(manifestPath)) continue;

    try {
      const content = fs.readFileSync(manifestPath, "utf-8");
      if (!content.includes("name:") || !content.includes("version:")) {
        errors.push(`${entry.name}: missing required fields (name, version)`);
      }
    } catch {
      errors.push(`${entry.name}: cannot read`);
    }
  }

  if (errors.length > 0) {
    return { label: "manifests", ok: false, detail: errors.join("; ") };
  }
  return { label: "manifests", ok: true, detail: "all valid" };
}

function checkI18n(): DoctorResult {
  const packagesDir = path.join(process.cwd(), "packages");
  const errors: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(packagesDir, { withFileTypes: true });
  } catch {
    return { label: "i18n", ok: true, detail: "no locale files to check" };
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const localeDir = path.join(packagesDir, entry.name, "locale");
    if (!fs.existsSync(localeDir)) continue;

    const files = fs.readdirSync(localeDir).filter((f) => f.endsWith(".json"));
    if (files.length < 2) continue;

    const keysPerFile = new Map<string, Set<string>>();
    for (const f of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(localeDir, f), "utf-8")) as Record<
          string,
          unknown
        >;
        keysPerFile.set(f, new Set(Object.keys(data)));
      } catch {
        errors.push(`${entry.name}: cannot parse ${f}`);
      }
    }

    if (keysPerFile.size < 2) continue;

    const allKeys = [...keysPerFile.entries()];
    const [, refKeys] = allKeys[0]!;
    for (let i = 1; i < allKeys.length; i++) {
      const [currentFile, currentKeys] = allKeys[i]!;

      const missingInCurrent = [...refKeys].filter((k) => !currentKeys.has(k));
      const extraInCurrent = [...currentKeys].filter((k) => !refKeys.has(k));

      if (missingInCurrent.length > 0) {
        errors.push(`${entry.name}/${currentFile}: missing keys [${missingInCurrent.join(", ")}]`);
      }
      if (extraInCurrent.length > 0) {
        errors.push(`${entry.name}/${currentFile}: extra keys [${extraInCurrent.join(", ")}]`);
      }
    }
  }

  if (errors.length > 0) {
    return { label: "i18n", ok: false, detail: errors.join("; ") };
  }
  return { label: "i18n", ok: true, detail: "keys match" };
}

function runDoctor(): void {
  const results: DoctorResult[] = [];

  // a) manifest check
  results.push(checkManifests());

  // b) TypeScript check
  try {
    execSync("npx tsc --noEmit", {
      cwd: process.cwd(),
      stdio: "pipe",
      encoding: "utf-8",
    });
    results.push({ label: "typescript", ok: true, detail: "no errors" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({
      label: "typescript",
      ok: false,
      detail: msg.slice(0, 200),
    });
  }

  // c) Test check
  try {
    execSync("npx vitest run", {
      cwd: process.cwd(),
      stdio: "pipe",
      encoding: "utf-8",
      timeout: 120_000,
    });
    results.push({ label: "tests", ok: true, detail: "all passing" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({
      label: "tests",
      ok: false,
      detail: msg.slice(0, 200),
    });
  }

  // d) i18n check
  results.push(checkI18n());

  // Report
  let hasFailure = false;
  for (const r of results) {
    const mark = r.ok ? "\u2713" : "\u2717";
    process.stdout.write(`  ${mark} ${r.label}: ${r.detail}\n`);
    if (!r.ok) hasFailure = true;
  }

  if (hasFailure) {
    process.stdout.write("\nDoctor checks failed.\n");
    process.exit(1);
  }

  process.stdout.write("\nAll checks passed.\n");
  process.exit(0);
}

// ── Runner ───────────────────────────────────────────────────

async function runCommand(parsed: ParsedArgs): Promise<void> {
  if (parsed.command === "help") {
    process.stdout.write(HELP_TEXT);
    process.exit(0);
  }

  if (parsed.command === "unknown") {
    process.stdout.write(`Unknown command: ${parsed.unknownName ?? "(none)"}\n\n${HELP_TEXT}`);
    process.exit(1);
  }

  // plugin scaffold and doctor don't need database
  if (parsed.command === "plugin" && parsed.subcommand === "scaffold") {
    pluginScaffold(parsed.pluginName, parsed.pluginOptions);
    process.exit(0);
  }

  if (parsed.command === "doctor") {
    runDoctor();
    return;
  }

  let config: ReturnType<typeof loadConfig>;
  try {
    config = loadConfig();
  } catch (err: unknown) {
    const logger = pino({ level: "info" });
    logger.error({ err }, "invalid configuration");
    process.exit(1);
  }

  const logger = pino({ level: config.AUDE_LOG_LEVEL });

  if (parsed.command === "start") {
    try {
      await startKernel();
    } catch (err: unknown) {
      logger.error({ err }, "kernel failed to start");
      process.exit(1);
    }
    return;
  }

  const provider = createDatabaseProvider({
    connectionString: config.DATABASE_URL,
    logger,
  });

  try {
    if (parsed.command === "db:migrate") {
      const result = await startupPipeline(provider, logger);
      process.stdout.write(`Migration complete. (${result.migrationCount} migrations run)\n`);
    } else if (parsed.command === "tenant") {
      if (parsed.subcommand === "create") {
        await tenantCreate(provider, logger, parsed.tenantName);
      } else if (parsed.subcommand === "list") {
        await tenantList(provider);
      } else {
        process.stdout.write("Usage: aude tenant <create|list>\n");
        process.exit(1);
      }
    } else if (parsed.command === "plugin") {
      await handlePluginCommand(parsed, provider, logger);
    }
  } catch (err: unknown) {
    logger.error({ err }, "command failed");
    await provider.close();
    process.exit(1);
  } finally {
    await provider.close();
  }

  process.exit(0);
}

// ── Entry ────────────────────────────────────────────────────

const isDirectExecute =
  process.argv[1]?.includes("cli.ts") ||
  process.argv[1]?.includes("cli.js") ||
  process.argv[1]?.includes("aude");

if (isDirectExecute) {
  const parsed = parseArgs(process.argv);
  void runCommand(parsed);
}
