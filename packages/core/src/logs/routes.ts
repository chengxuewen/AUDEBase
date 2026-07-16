/**
 * GET /api/logs route handler.
 *
 * Returns the most recent 100 log entries (newest first).
 * Auth required - wire via `onRequest: [authHook]` in app.ts.
 *
 * @audebase/core
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { globalLogBuffer } from './buffer.js'

/**
 * Register the GET /api/logs route on the given Fastify instance.
 *
 * Caller must supply an `authHook` (e.g. requireAuth) to protect the route.
 */
export function registerLogRoutes(
  app: FastifyInstance,
  authHook: (request: unknown, reply: unknown) => Promise<void>,
): void {
  app.get('/api/logs', {
    onRequest: [authHook],
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ data: globalLogBuffer.snapshot() })
  })
}
