export interface HealthCheckResult {
  status: 'ok' | 'degraded'
  db: boolean
  redis?: boolean
  uptime: number
  version: string
  timestamp: string
}

interface DbLike {
  execute: (sql: string) => Promise<unknown>
}

interface RedisLike {
  ping: () => Promise<string>
}

const VERSION = '0.1.0'

export class HealthService {
  private readonly db: DbLike
  private readonly redis: RedisLike | null
  private readonly startTime: number

  constructor(db: DbLike, redis: RedisLike | null) {
    this.db = db
    this.redis = redis
    this.startTime = Date.now()
  }

  async check(): Promise<HealthCheckResult> {
    let dbOk = false
    let redisOk: boolean | undefined

    try {
      await this.db.execute('SELECT 1')
      dbOk = true
    } catch {
      dbOk = false
    }

    if (this.redis !== null) {
      try {
        const result = await this.redis.ping()
        redisOk = result === 'PONG'
      } catch {
        redisOk = false
      }
    }

    const uptime = Math.floor((Date.now() - this.startTime) / 1000)
    const status: 'ok' | 'degraded' = dbOk ? 'ok' : 'degraded'

    const result: HealthCheckResult = {
      status,
      db: dbOk,
      uptime,
      version: VERSION,
      timestamp: new Date().toISOString(),
    }

    if (redisOk !== undefined) {
      result.redis = redisOk
    }

    return result
  }
}
