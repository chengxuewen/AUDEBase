import type { FastifyInstance } from 'fastify'
import { HealthService, type HealthCheckResult } from './service.js'

interface DbLike {
  execute: (sql: string) => Promise<unknown>
}

interface RedisLike {
  ping: () => Promise<string>
}

export function registerHealthRoutes(
  app: FastifyInstance,
  db: DbLike,
  redis: RedisLike | null,
): void {
  const healthService = new HealthService(db, redis)

  app.get('/health', async (_request, reply) => {
    const result = await healthService.check()
    return reply.send(result)
  })

  app.get('/api/health', async (_request, reply) => {
    const result = await healthService.check()
    return reply.send(result)
  })

  app.get('/health/ready', async (_request, reply) => {
    const result = await healthService.check()
    if (result.db) {
      return reply.send({ status: 'ready' })
    }
    return reply.code(503).send({ status: 'not_ready' })
  })
}

export type { HealthCheckResult }
