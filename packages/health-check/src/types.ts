/**
 * Local type definitions for health-check dependencies.
 *
 * DatabaseProvider and RedisClient are defined here (not imported from @audebase/core)
 * because Core SDD is not yet generated (GO-021). These interfaces match the signatures
 * in health-check-sdd.md §2.5.
 */

/**
 * Database provider interface (subset used by health-check).
 * HealthCheckService only uses execute() for SELECT 1.
 */
export interface DatabaseProvider {
  /**
   * Execute raw SQL query.
   * @param sql SQL statement
   * @param params bind parameters
   */
  execute(sql: string, params?: unknown[]): Promise<unknown>
}

/**
 * Redis client interface (subset used by health-check).
 * Compatible with ioredis ping() signature.
 */
export interface RedisClient {
  /**
   * Send PING command.
   * @returns 'PONG' when connection is healthy
   */
  ping(): Promise<string>
}
