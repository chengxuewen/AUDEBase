/**
 * HealthCheckService - DB/Redis health probe logic.
 *
 * @audebase/health-check
 */

import type { DatabaseProvider, RedisClient } from '../types.js'

/** Health status response shape (matches healthResponseSchema in shared-types). */
export interface HealthStatus {
  readonly status: 'ok'
  readonly db: boolean
  readonly redis?: boolean
  readonly uptime: number
  readonly version: string
  readonly timestamp: string
}

/** Ready check result. */
export interface ReadyResult {
  readonly ready: boolean
}

/** Probe timeout in milliseconds. */
const PROBE_TIMEOUT_MS = 3_000

/**
 * Health check service.
 *
 * Encapsulates DB/Redis probe logic for Fastify route handlers.
 */
export class HealthCheckService {
  private readonly db: DatabaseProvider
  private readonly redis: RedisClient | null
  private readonly startTime: number
  private readonly version: string

  constructor(
    db: DatabaseProvider,
    redis: RedisClient | null,
    startTime: number = Date.now(),
    version: string = '0.0.0',
  ) {
    this.db = db
    this.redis = redis
    this.startTime = startTime
    this.version = version
  }

  /**
   * Run full health check: parallel DB + Redis probes.
   * @returns aggregated health status
   */
  async check(): Promise<HealthStatus> {
    const [dbOk, redisOk] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ])

    const result: HealthStatus = {
      status: 'ok',
      db: dbOk,
      uptime: this.getUptime(),
      version: this.version,
      timestamp: new Date().toISOString(),
    }

    // Only include redis field when redis is configured
    if (redisOk !== undefined) {
      return { ...result, redis: redisOk }
    }

    return result
  }

  /**
   * Check database connectivity via SELECT 1 with 3s timeout.
   * @returns true if connection is healthy
   */
  async checkDatabase(): Promise<boolean> {
    try {
      await this.withTimeout(this.db.execute('SELECT 1'))
      return true
    } catch {
      return false
    }
  }

  /**
   * Check Redis connectivity via PING with 3s timeout.
   * @returns true if healthy, undefined if Redis is not configured
   */
  async checkRedis(): Promise<boolean | undefined> {
    if (this.redis === null) {
      return undefined
    }

    try {
      await this.withTimeout(this.redis.ping())
      return true
    } catch {
      return false
    }
  }

  /**
   * Get process uptime in seconds.
   * @returns integer seconds since startTime
   */
  getUptime(): number {
    return Math.floor((Date.now() - this.startTime) / 1_000)
  }

  /**
   * Check readiness (DB only, Redis does not affect readiness).
   * @returns { ready: boolean }
   */
  async checkReady(): Promise<ReadyResult> {
    const dbOk = await this.checkDatabase()
    return { ready: dbOk }
  }

  /**
   * Race a promise against a timeout.
   * @throws Error if timeout fires first
   */
  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    const timeout = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`timeout after ${PROBE_TIMEOUT_MS}ms`))
      }, PROBE_TIMEOUT_MS)
      // Allow the Node.js process to exit even if timer is pending
      timer.unref?.()
    })

    return Promise.race([promise, timeout])
  }
}
