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

const HELP_TEXT = `Usage: aude <command>

Commands:
  start           Start the AUDEBase kernel server
  db:migrate      Run database migrations and exit
  tenant create   Create a new tenant (aude tenant create <name>)
  tenant list     List all tenants
  --help, -h      Show this help message

Examples:
  aude start
  aude db:migrate
  aude tenant create my-org
  aude tenant list
  DATABASE_URL=postgres://... AUDE_JWT_SECRET=... aude start
`;

// ── Parsing (extracted for testability) ──────────────────────

export interface ParsedArgs {
  command: "start" | "db:migrate" | "tenant" | "help" | "unknown";
  subcommand?: "create" | "list";
  tenantName?: string;
  unknownName?: string;
}

export function parseArgs(args: readonly string[]): ParsedArgs {
  const cmd = args[2];

  if (cmd === "start") return { command: "start" };
  if (cmd === "db:migrate") return { command: "db:migrate" };
  if (cmd === "--help" || cmd === "-h") return { command: "help" };

  if (cmd === "tenant") {
    const sub = args[3];
    if (sub === "create") return { command: "tenant", subcommand: "create", tenantName: args[4] };
    if (sub === "list") return { command: "tenant", subcommand: "list" };
    return { command: "tenant" };
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
