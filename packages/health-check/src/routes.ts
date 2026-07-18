import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

/**
 * Health check response (/health).
 */
export interface HealthResponse {
  status: "ok";
  db: boolean;
  uptime: number;
  timestamp: string;
}

/**
 * Readiness response (/health/ready).
 */
export interface ReadyResponse {
  status: "ready" | "not_ready";
}

/**
 * Options for the health-check Fastify plugin.
 */
export interface HealthCheckOptions {
  /** Check whether the database is reachable. */
  dbCheck: () => Promise<boolean>;
  /** Epoch-ms timestamp of when the server started. */
  startTime: number;
}

/**
 * Fastify plugin that registers health-check routes.
 *
 * GET /health      — full status (db, uptime, timestamp)
 * GET /health/ready — Kubernetes readiness probe
 *
 * Usage: `await app.register(healthCheckPlugin, { dbCheck, startTime })`
 */
function healthCheckPlugin(server: FastifyInstance, opts: HealthCheckOptions): void {
  server.get("/health", async (_request, reply) => {
    const db = await opts.dbCheck();
    const uptime = Math.floor((Date.now() - opts.startTime) / 1000);

    const body: HealthResponse = {
      status: "ok",
      db,
      uptime,
      timestamp: new Date().toISOString(),
    };

    return reply.status(200).send(body);
  });

  server.get("/health/ready", async (_request, reply) => {
    const db = await opts.dbCheck();
    if (!db) {
      const body: ReadyResponse = { status: "not_ready" };
      return reply.status(503).send(body);
    }
    const body: ReadyResponse = { status: "ready" };
    return reply.status(200).send(body);
  });
}

export default fp(healthCheckPlugin, {
  name: "health-check",
});
