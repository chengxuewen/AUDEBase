/**
 * Health check route registration.
 *
 * @audebase/health-check
 */

import type { HealthCheckService } from './service.js'

/**
 * Minimal Fastify-like interface for route registration.
 * Avoids hard dependency on fastify package.
 */
export interface FastifyLike {
  get(
    path: string,
    handler: (request: unknown, reply: FastifyReplyLike) => Promise<unknown>,
  ): void
}

/** Minimal Fastify reply interface. */
export interface FastifyReplyLike {
  code(statusCode: number): FastifyReplyLike
  send(payload: unknown): void
}

/**
 * Register health check routes.
 *
 * Routes (all unauthenticated):
 * - GET /health       (liveness probe)
 * - GET /api/health   (API consistency)
 * - GET /health/ready (readiness probe)
 *
 * @param app Fastify instance (or compatible)
 * @param service HealthCheckService instance
 */
export function registerHealthRoutes(
  app: FastifyLike,
  service: HealthCheckService,
): void {
  app.get('/health', async (_request, reply) => {
    const result = await service.check()
    reply.code(200).send(result)
  })

  app.get('/api/health', async (_request, reply) => {
    const result = await service.check()
    reply.code(200).send(result)
  })

  app.get('/health/ready', async (_request, reply) => {
    const { ready } = await service.checkReady()
    if (ready) {
      reply.code(200).send({ status: 'ready' })
    } else {
      reply.code(503).send({ status: 'not_ready', db: false })
    }
  })
}
