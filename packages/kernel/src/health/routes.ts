import { type FastifyInstance } from "fastify";

/**
 * 健康检查响应（/health）
 */
export interface HealthResponse {
  status: "ok";
  db: boolean;
  redis?: boolean;
  uptime: number;
  version: string;
  timestamp: string;
}

/**
 * Readiness 响应（/health/ready）
 */
export interface ReadyResponse {
  status: "ready" | "not_ready";
}

/**
 * 注册健康检查路由
 *
 * GET /health — 完整状态（db, redis?, uptime, version）
 * GET /health/ready — Kubernetes readiness probe
 */
export function registerHealthRoutes(
  app: FastifyInstance,
  dbCheck: () => Promise<boolean>,
  options: { startTime: number; version: string },
): void {
  app.get("/health", async (_request, reply) => {
    const db = await dbCheck();
    const uptime = Math.floor((Date.now() - options.startTime) / 1000);

    const body: HealthResponse = {
      status: "ok",
      db,
      uptime,
      version: options.version,
      timestamp: new Date().toISOString(),
    };

    return reply.status(200).send(body);
  });

  app.get("/health/ready", async (_request, reply) => {
    const db = await dbCheck();
    if (!db) {
      const body: ReadyResponse = { status: "not_ready" };
      return reply.status(503).send(body);
    }
    const body: ReadyResponse = { status: "ready" };
    return reply.status(200).send(body);
  });
}
