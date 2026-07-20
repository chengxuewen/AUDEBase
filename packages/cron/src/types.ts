/**
 * @audebase/cron - Type definitions
 *
 * Structural types only. No bullmq dependency at type level.
 */

/** Logger interface injected by Core */
export interface CronLogger {
  info(msg: string, data?: unknown): void
  error(msg: string, err?: unknown): void
  warn(msg: string, data?: unknown): void
}

/** Options for constructing a CronManager */
export interface CronManagerOptions {
  /** Redis URL (e.g. redis://localhost:6379) or connection object */
  readonly connection: string | { host: string; port: number }
  /** Optional structured logger */
  readonly logger?: CronLogger
}

/** Configuration for a cron job */
export interface CronJobConfig {
  /** Unique job name within the plugin scope */
  readonly name: string
  /** Cron expression: 5-field (min hour day month weekday) or 6-field (sec min hour day month weekday) */
  readonly schedule: string
  /** Async handler invoked when the job fires */
  readonly handler: () => Promise<void>
  /** Optional: IANA timezone (e.g. "Asia/Shanghai"). Defaults to UTC. */
  readonly timezone?: string
  /** Optional: max retry attempts on failure (1-10, default 3) */
  readonly maxRetries?: number
  /** Optional: plugin name for namespacing (auto-set by Core) */
  readonly pluginName?: string
}

/** Result returned by list() */
export interface CronJobInfo {
  readonly name: string
  readonly schedule: string
  readonly status: 'active' | 'paused'
}

/** Execution log entry for a single job run */
export interface CronExecutionLog {
  readonly jobName: string
  readonly pluginName: string
  readonly startedAt: string
  readonly completedAt: string
  readonly durationMs: number
  readonly success: boolean
  readonly error: string | null
}
