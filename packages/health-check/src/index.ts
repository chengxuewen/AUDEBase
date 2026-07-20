/**
 * @audebase/health-check - Barrel exports
 */

export { HealthCheckService } from './health/service.js'
export type { HealthStatus, ReadyResult } from './health/service.js'
export { registerHealthRoutes } from './health/routes.js'
export type { FastifyLike, FastifyReplyLike } from './health/routes.js'
export type { DatabaseProvider, RedisClient } from './types.js'
