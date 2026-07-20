/**
 * @audebase/cron - CronManager
 *
 * Phase 1b: BullMQ repeatable jobs, same-process execution.
 * Uses Queue.upsertJobScheduler for repeatable scheduling.
 */

import { Queue, Worker, type ConnectionOptions } from 'bullmq'
import { ErrorCode, UserError } from '@audebase/shared-types'
import type {
  CronJobConfig,
  CronJobInfo,
  CronLogger,
  CronManagerOptions,
} from './types.js'

const QUEUE_NAME = 'audebase-cron'
const DEFAULT_MAX_RETRIES = 3
const MAX_RETRIES_LIMIT = 10
const BACKOFF_DELAY_MS = 1000

/** No-op logger used when none is provided */
const noopLogger: CronLogger = {
  info: () => {},
  error: () => {},
  warn: () => {},
}

/**
 * Validate a cron expression. Accepts standard 5-field or 6-field format.
 * Fields are whitespace-separated; each field is a valid cron component.
 * ponytail: regex validation is sufficient for Phase 1b — cron-parser would
 * be more thorough but adds a dependency for marginal benefit.
 */
function validateCronSchedule(schedule: string): boolean {
  const fields = schedule.trim().split(/\s+/)
  if (fields.length !== 5 && fields.length !== 6) {
    return false
  }

  // Each field: digits, *, ranges (1-5), lists (1,2,3), step values (*/5)
  // or combinations. This is intentionally permissive — BullMQ will reject
  // truly invalid expressions when upsertJobScheduler runs.
  const fieldPattern = /^(\*|\d+|\d+-\d+|\d+(,\d+)*|\*\/\d+|\d+\/\d+|\d+-\d+\/\d+)(\/\d+)?$/
  return fields.every((f) => fieldPattern.test(f))
}

function clampRetries(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_MAX_RETRIES
  }
  if (!Number.isInteger(value) || value < 1) {
    return DEFAULT_MAX_RETRIES
  }
  return Math.min(value, MAX_RETRIES_LIMIT)
}

function toConnectionOptions(
  connection: string | { host: string; port: number },
): ConnectionOptions {
  if (typeof connection === 'string') {
    return { url: connection }
  }
  return { host: connection.host, port: connection.port }
}

interface InternalJobEntry {
  readonly config: CronJobConfig
  readonly maxRetries: number
}

interface MutableExecutionLog {
  jobName: string
  pluginName: string
  startedAt: string
  completedAt: string
  durationMs: number
  success: boolean
  error: string | null
}

export class CronManager {
  private readonly queue: Queue
  private readonly logger: CronLogger
  private readonly connectionOpts: ConnectionOptions
  private readonly jobs: Map<string, InternalJobEntry> = new Map()
  private worker: Worker | null = null
  private isStarted = false

  constructor(options: CronManagerOptions) {
    this.connectionOpts = toConnectionOptions(options.connection)
    this.logger = options.logger ?? noopLogger
    this.queue = new Queue(QUEUE_NAME, { connection: this.connectionOpts })
  }

  async add(config: CronJobConfig): Promise<void> {
    // Validate schedule
    if (!validateCronSchedule(config.schedule)) {
      throw new UserError(
        ErrorCode.VALIDATION_ERROR,
        `Invalid cron schedule: "${config.schedule}"`,
        { code: 'CRON_INVALID_SCHEDULE', schedule: config.schedule },
      )
    }

    // Dedup check
    if (this.jobs.has(config.name)) {
      throw new UserError(
        ErrorCode.CONFLICT,
        `Cron job already exists: "${config.name}"`,
        { code: 'CRON_DUPLICATE_NAME', name: config.name },
      )
    }

    const maxRetries = clampRetries(config.maxRetries)
    const entry: InternalJobEntry = { config, maxRetries }
    this.jobs.set(config.name, entry)

    // Register with BullMQ as a repeatable job scheduler.
    // upsertJobScheduler creates/updates a job scheduler that repeats on the cron pattern.
    const pattern =
      config.schedule.trim().split(/\s+/).length === 6
        ? config.schedule
        : config.schedule // BullMQ accepts standard cron; 6-field is handled by cron-strider internally

    const schedulerOpts: Record<string, unknown> = {
      pattern,
    }
    if (config.timezone !== undefined) {
      schedulerOpts['tz'] = config.timezone
    }

    await this.queue.upsertJobScheduler(config.name, schedulerOpts, {
      name: config.name,
      data: { jobName: config.name },
      opts: {
        attempts: maxRetries,
        backoff: {
          type: 'exponential',
          delay: BACKOFF_DELAY_MS,
        },
      },
    })

    this.logger.info('cron.job.added', { name: config.name, schedule: config.schedule })
  }

  async remove(name: string): Promise<void> {
    const entry = this.jobs.get(name)
    if (entry === undefined) {
      // No-op if job doesn't exist
      return
    }

    await this.queue.removeJobScheduler(name)
    this.jobs.delete(name)
    this.logger.info('cron.job.removed', { name })
  }

  async list(): Promise<CronJobInfo[]> {
    const results: CronJobInfo[] = []
    for (const [name, entry] of this.jobs) {
      results.push({
        name,
        schedule: entry.config.schedule,
        status: this.isStarted ? 'active' : 'paused',
      })
    }
    return results
  }

  async start(): Promise<void> {
    if (this.isStarted) {
      return
    }

    this.worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        const jobName = (job.data as { jobName?: string })?.jobName ?? job.name
        const entry = this.jobs.get(jobName)
        if (entry === undefined) {
          this.logger.warn('cron.job.unknown', { jobName })
          return
        }

        const startedAt = Date.now()
        const log: MutableExecutionLog = {
          jobName,
          pluginName: entry.config.pluginName ?? 'unknown',
          startedAt: new Date(startedAt).toISOString(),
          completedAt: '',
          durationMs: 0,
          success: false,
          error: null,
        }

        try {
          this.logger.info('cron.job.started', { jobName })
          await entry.config.handler()
          log.completedAt = new Date().toISOString()
          log.durationMs = Date.now() - startedAt
          log.success = true
          this.logger.info('cron.job.completed', {
            jobName,
            durationMs: log.durationMs,
          })
        } catch (err) {
          log.completedAt = new Date().toISOString()
          log.durationMs = Date.now() - startedAt
          log.success = false
          log.error = err instanceof Error ? err.message : String(err)
          this.logger.error('cron.job.failed', {
            jobName,
            durationMs: log.durationMs,
            error: log.error,
          })
          // Re-throw so BullMQ retry mechanism kicks in
          throw err
        }
      },
      {
        connection: this.connectionOpts,
        concurrency: 1,
      },
    )

    await this.worker.waitUntilReady()
    this.isStarted = true
    this.logger.info('cron.manager.started', { jobCount: this.jobs.size })
  }

  async stop(): Promise<void> {
    if (this.worker !== null) {
      await this.worker.close()
      this.worker = null
    }
    await this.queue.close()
    this.isStarted = false
    this.logger.info('cron.manager.stopped', {})
  }
}
