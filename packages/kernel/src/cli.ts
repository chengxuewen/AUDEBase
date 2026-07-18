#!/usr/bin/env node
/**
 * AUDEBase kernel CLI entry point.
 *
 * ponytail: parse process.argv directly — no commander/yargs dependency.
 * Two commands: `aude start` and `aude db:migrate`.
 */

import pino from "pino";
import { loadConfig } from "./config";
import { createDatabaseProvider } from "./db";
import { startupPipeline } from "./startup";
import { startKernel } from "./index";

const HELP_TEXT = `Usage: aude <command>

Commands:
  start         Start the AUDEBase kernel server
  db:migrate    Run database migrations and exit
  --help, -h    Show this help message

Examples:
  aude start
  aude db:migrate
  DATABASE_URL=postgres://... AUDE_JWT_SECRET=... aude start
`;

// ── Parsing (extracted for testability) ──────────────────────

export interface ParsedArgs {
  command: "start" | "db:migrate" | "help" | "unknown";
  unknownName?: string;
}

export function parseArgs(args: readonly string[]): ParsedArgs {
  // args[0] = node, args[1] = script path (or "aude" via bin)
  const cmd = args[2];

  if (cmd === "start") {
    return { command: "start" };
  }

  if (cmd === "db:migrate") {
    return { command: "db:migrate" };
  }

  if (cmd === "--help" || cmd === "-h") {
    return { command: "help" };
  }

  return { command: "unknown", unknownName: cmd };
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

  // For both start and db:migrate, load and validate config first
  let config: ReturnType<typeof loadConfig>;
  try {
    config = loadConfig();
  } catch (err: unknown) {
    const logger = pino({ level: "info" });
    logger.error({ err }, "invalid configuration");
    process.exit(1);
  }

  if (parsed.command === "start") {
    // `startKernel` creates the app, calls .listen(), and registers shutdown handlers
    try {
      await startKernel();
      // startKernel registers SIGTERM/SIGINT handlers but doesn't log "listening" explicitly.
      // The Fastify logger will output "Server listening at http://{host}:{port}" via fastify automatically.
      // ponytail: no extra log needed — Fastify does it.
    } catch (err: unknown) {
      const logger = pino({ level: "info" });
      logger.error({ err }, "kernel failed to start");
      process.exit(1);
    }
    return;
  }

  // db:migrate — create a standalone logger + DB + run startup pipeline
  if (parsed.command === "db:migrate") {
    const logger = pino({ level: config.AUDE_LOG_LEVEL });
    const db = createDatabaseProvider({
      connectionString: config.DATABASE_URL,
      logger,
    });

    try {
      const result = await startupPipeline(db, logger);
      process.stdout.write(`Migration complete. (${result.migrationCount} migrations run)\n`);
    } catch (err: unknown) {
      logger.error({ err }, "migration failed");
      await db.close();
      process.exit(1);
    } finally {
      await db.close();
    }
    process.exit(0);
  }
}

// ── Entry ────────────────────────────────────────────────────

// ponytail: only run when executed directly, not when imported
const isDirectExecute =
  process.argv[1]?.endsWith("cli.ts") ||
  process.argv[1]?.endsWith("cli.js") ||
  process.argv[1]?.endsWith("aude");

if (isDirectExecute) {
  const parsed = parseArgs(process.argv);
  void runCommand(parsed);
}
