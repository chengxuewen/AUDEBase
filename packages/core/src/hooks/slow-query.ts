export interface SlowQueryHook {
  onQuery?: (args: unknown[], context: { sql: string; params?: unknown[] }) => void
  onResult?: (args: unknown[], result: unknown) => void
}

export interface SlowQueryOptions {
  slowQueryThresholdMs: number
}

interface SlowQueryLogger {
  warn: (msg: string, data: object) => void
}

// ponytail: single start time, tests use the hook sequentially
let startTime: number | null = null
let lastSql: string | null = null

export function createSlowQueryHook(
  logger: SlowQueryLogger,
  options: SlowQueryOptions,
): SlowQueryHook {
  const threshold = options.slowQueryThresholdMs

  return {
    onQuery: (_args: unknown[], context: { sql: string; params?: unknown[] }): void => {
      startTime = Date.now()
      lastSql = context.sql
    },
    onResult: (_args: unknown[], _result: unknown): void => {
      if (startTime === null) return

      const duration = Date.now() - startTime
      const sql = lastSql ?? 'unknown'

      if (duration >= threshold) {
        logger.warn('Slow query detected', { sql, duration })
      }

      startTime = null
      lastSql = null
    },
  }
}
