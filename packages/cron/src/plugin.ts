import { BullScheduler } from "./scheduler";
import type { CronJob, CronHandler, CronRegistry } from "./types";

/**
 * Minimal server interface — avoids depending on fastify.
 * In production this is a FastifyInstance; in tests it can be a mock.
 */
interface CronServerHost {
  log: {
    info(obj: unknown, msg?: string): void;
    warn(obj: unknown, msg?: string): void;
    error(obj: unknown, msg?: string): void;
  };
  decorate(name: string, value: unknown): void;
  addHook(event: string, handler: () => Promise<void>): void;
}

/**
 * Manifest cron declaration shape (from manifest.yaml)
 */
interface ManifestCronEntry {
  name: string;
  schedule: string;
  handler: string;
}

/**
 * Options for registerCronPlugin
 */
export interface CronPluginOptions {
  /** Redis connection URL */
  redisUrl: string;
  /** Cron declarations from loaded plugins' manifest.yaml files */
  declarations?: ManifestCronEntry[];
  /**
   * Handler map: name → handler function.
   * In production, handlers are resolved from loaded plugins.
   */
  handlerMap?: Record<string, CronHandler>;
}

/**
 * Register the cron plugin on a Fastify instance.
 *
 * Creates a BullScheduler, registers declared cron jobs,
 * decorates the server with the scheduler instance, and starts processing.
 *
 * The scheduler is decorated as `server.cron` so plugins can use
 * `this.app.cron.add(...)` at runtime.
 */
export async function registerCronPlugin(
  server: CronServerHost,
  options: CronPluginOptions,
): Promise<void> {
  const { redisUrl, declarations = [], handlerMap = {} } = options;

  const scheduler = new BullScheduler({ redisUrl });

  // Register all manifest-declared cron jobs
  for (const entry of declarations) {
    const handler = handlerMap[entry.handler];
    if (!handler) {
      server.log.warn({ entry }, "cron: no handler registered for manifest cron entry — skipping");
      continue;
    }

    const cronJob: CronJob = {
      name: entry.name,
      schedule: entry.schedule,
      pluginName: "manifest",
    };

    await scheduler.add(cronJob, handler);
    server.log.info({ name: entry.name, schedule: entry.schedule }, "cron job registered");
  }

  // Start the scheduler (creates Queue + Worker)
  await scheduler.start();

  // Decorate server with cron registry so plugins can call this.app.cron.add()
  // ponytail: no declare module "fastify" augmentation here (cron doesn't depend on fastify).
  // Type augmentation for FastifyInstance.cron lives in kernel/src/plugins/cron.ts.
  server.decorate("cron", scheduler);

  // Add close hook to stop scheduler on server shutdown
  server.addHook("onClose", async () => {
    server.log.info("cron: shutting down scheduler");
    await scheduler.stop();
  });

  server.log.info({ count: declarations.length }, "cron plugin registered");
}

// Re-export types for consumers
export type { CronJob, CronHandler, CronRegistry };
