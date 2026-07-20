/**
 * @audebase/cron - CronManager unit tests
 *
 * AAA pattern. Mocks bullmq Queue/Worker to test CronManager logic
 * without real Redis. Verifies add/remove/list/validate/dedup/lifecycle.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ErrorCode } from '@audebase/shared-types'

// ─── Mock bullmq ───────────────────────────────────────────────

const mockUpsertJobScheduler = vi.fn(async (_key: string, _opts: unknown, _job: unknown) => {})
const mockRemoveJobScheduler = vi.fn(async (_key: string) => {})
const mockQueueClose = vi.fn(async () => {})
const mockQueuePause = vi.fn(async () => {})
const mockQueueResume = vi.fn(async () => {})
const mockQueueGetRepeatableJobs = vi.fn(async () => [])

const mockWorkerClose = vi.fn(async () => {})
const mockWorkerWaitUntilReady = vi.fn(async () => {})
let workerHandler: ((job: unknown) => Promise<void>) | null = null

vi.mock('bullmq', () => {
  return {
    Queue: vi.fn().mockImplementation(() => ({
      upsertJobScheduler: mockUpsertJobScheduler,
      removeJobScheduler: mockRemoveJobScheduler,
      close: mockQueueClose,
      pause: mockQueuePause,
      resume: mockQueueResume,
      getRepeatableJobs: mockQueueGetRepeatableJobs,
    })),
    Worker: vi.fn().mockImplementation((_name: string, handler: (job: unknown) => Promise<void>) => {
      workerHandler = handler
      return {
        close: mockWorkerClose,
        waitUntilReady: mockWorkerWaitUntilReady,
      }
    }),
  }
})

// Import after mock is set up
const { CronManager } = await import('../cron-manager.js')
import type { CronJobConfig, CronLogger } from '../types.js'

function createMockLogger(): { logger: CronLogger; calls: Record<string, unknown[]> } {
  const calls: Record<string, unknown[]> = {
    info: [],
    error: [],
    warn: [],
  }
  const logger: CronLogger = {
    info: (msg: string, data?: unknown) => {
      calls.info.push({ msg, data })
    },
    error: (msg: string, err?: unknown) => {
      calls.error.push({ msg, err })
    },
    warn: (msg: string, data?: unknown) => {
      calls.warn.push({ msg, data })
    },
  }
  return { logger, calls }
}

function createConfig(overrides: Partial<CronJobConfig> = {}): CronJobConfig {
  return {
    name: 'test-job',
    schedule: '*/5 * * * *',
    handler: vi.fn(async () => {}),
    ...overrides,
  }
}

describe('CronManager', () => {
  let manager: InstanceType<typeof CronManager>

  beforeEach(() => {
    vi.clearAllMocks()
    workerHandler = null
    manager = new CronManager({
      connection: 'redis://localhost:6379',
      logger: createMockLogger().logger,
    })
  })

  afterEach(async () => {
    // Ensure stop is called to clean up (swallow errors if already stopped)
    try {
      await manager.stop()
    } catch {
      // ignore
    }
  })

  describe('add()', () => {
    it('registers a valid cron job and calls upsertJobScheduler', async () => {
      // Arrange
      const config = createConfig({ name: 'daily-report', schedule: '0 8 * * *' })

      // Act
      await manager.add(config)

      // Assert
      expect(mockUpsertJobScheduler).toHaveBeenCalledTimes(1)
      const [key, schedulerOpts, jobOpts] = mockUpsertJobScheduler.mock.calls[0]!
      expect(key).toBe('daily-report')
      expect(schedulerOpts).toHaveProperty('pattern', '0 8 * * *')
      expect(jobOpts).toHaveProperty('name', 'daily-report')
      expect(jobOpts).toHaveProperty('opts.attempts', 3)
      expect(jobOpts).toHaveProperty('opts.backoff.type', 'exponential')
    })

    it('throws CRON_INVALID_SCHEDULE for malformed expression', async () => {
      // Arrange
      const config = createConfig({ schedule: 'not-a-cron-expression' })

      // Act & Assert
      await expect(manager.add(config)).rejects.toThrow()
      try {
        await manager.add(config)
      } catch (e) {
        const err = e as { code: ErrorCode; details?: { code?: string } }
        expect(err.code).toBe(ErrorCode.VALIDATION_ERROR)
        expect(err.details?.code).toBe('CRON_INVALID_SCHEDULE')
      }
    })

    it('throws CRON_DUPLICATE_NAME when adding a job with an existing name', async () => {
      // Arrange
      const config = createConfig({ name: 'dup-job' })
      await manager.add(config)

      // Act & Assert
      await expect(manager.add(config)).rejects.toThrow()
      try {
        await manager.add(config)
      } catch (e) {
        const err = e as { code: ErrorCode; details?: { code?: string } }
        expect(err.code).toBe(ErrorCode.CONFLICT)
        expect(err.details?.code).toBe('CRON_DUPLICATE_NAME')
      }
    })

    it('accepts 6-field cron expressions', async () => {
      // Arrange
      const config = createConfig({ name: 'six-field', schedule: '0 */5 * * * *' })

      // Act
      await manager.add(config)

      // Assert
      expect(mockUpsertJobScheduler).toHaveBeenCalledTimes(1)
    })

    it('passes timezone to scheduler options when provided', async () => {
      // Arrange
      const config = createConfig({ name: 'tz-job', timezone: 'Asia/Shanghai' })

      // Act
      await manager.add(config)

      // Assert
      const [, schedulerOpts] = mockUpsertJobScheduler.mock.calls[0]!
      expect(schedulerOpts).toHaveProperty('tz', 'Asia/Shanghai')
    })

    it('clamps maxRetries to 1-10 range with default 3', async () => {
      // Arrange & Act - default (no maxRetries)
      await manager.add(createConfig({ name: 'default-retries' }))
      let calls = mockUpsertJobScheduler.mock.calls
      let jobOpts = calls[calls.length - 1]![2] as { opts: { attempts: number } }
      expect(jobOpts.opts.attempts).toBe(3)

      // maxRetries = 0 -> clamped to 3
      manager = new CronManager({ connection: 'redis://localhost:6379' })
      await manager.add(createConfig({ name: 'zero-retries', maxRetries: 0 }))
      calls = mockUpsertJobScheduler.mock.calls
      jobOpts = calls[calls.length - 1]![2] as { opts: { attempts: number } }
      expect(jobOpts.opts.attempts).toBe(3)

      // maxRetries = 100 -> clamped to 10
      manager = new CronManager({ connection: 'redis://localhost:6379' })
      await manager.add(createConfig({ name: 'high-retries', maxRetries: 100 }))
      calls = mockUpsertJobScheduler.mock.calls
      jobOpts = calls[calls.length - 1]![2] as { opts: { attempts: number } }
      expect(jobOpts.opts.attempts).toBe(10)
    })
  })

  describe('remove()', () => {
    it('removes a registered job and calls removeJobScheduler', async () => {
      // Arrange
      const config = createConfig({ name: 'removable-job' })
      await manager.add(config)

      // Act
      await manager.remove('removable-job')

      // Assert
      expect(mockRemoveJobScheduler).toHaveBeenCalledWith('removable-job')
      const jobs = await manager.list()
      expect(jobs).toHaveLength(0)
    })

    it('is a no-op for non-existent job (no throw)', async () => {
      // Act & Assert
      await expect(manager.remove('nonexistent')).resolves.toBeUndefined()
      expect(mockRemoveJobScheduler).not.toHaveBeenCalled()
    })
  })

  describe('list()', () => {
    it('returns all registered jobs with correct info', async () => {
      // Arrange
      await manager.add(createConfig({ name: 'job-a', schedule: '0 8 * * *' }))
      await manager.add(createConfig({ name: 'job-b', schedule: '*/15 * * * *' }))

      // Act
      const jobs = await manager.list()

      // Assert
      expect(jobs).toHaveLength(2)
      const names = jobs.map((j) => j.name).sort()
      expect(names).toEqual(['job-a', 'job-b'])

      const jobA = jobs.find((j) => j.name === 'job-a')!
      expect(jobA.schedule).toBe('0 8 * * *')
      expect(jobA.status).toBe('paused') // not started yet
    })

    it('returns empty array when no jobs registered', async () => {
      // Act
      const jobs = await manager.list()

      // Assert
      expect(jobs).toHaveLength(0)
    })

    it('reflects active status after start()', async () => {
      // Arrange
      await manager.add(createConfig({ name: 'active-job' }))

      // Act
      await manager.start()
      const jobs = await manager.list()

      // Assert
      expect(jobs[0]!.status).toBe('active')
    })
  })

  describe('start() / stop() lifecycle', () => {
    it('creates a Worker and marks manager as started', async () => {
      // Act
      await manager.start()

      // Assert
      expect(workerHandler).not.toBeNull()
      expect(mockWorkerWaitUntilReady).toHaveBeenCalledTimes(1)
    })

    it('is idempotent - calling start() twice does not create a second worker', async () => {
      // Act
      await manager.start()
      await manager.start()

      // Assert - Worker constructor called only once per manager instance
      // (first call in beforeEach doesn't count - that's construction)
      // We check that waitUntilReady was called twice but Worker ctor only once after first start
      const { Worker } = await import('bullmq')
      expect(Worker).toHaveBeenCalledTimes(1)
    })

    it('closes worker and queue on stop()', async () => {
      // Arrange
      await manager.start()

      // Act
      await manager.stop()

      // Assert
      expect(mockWorkerClose).toHaveBeenCalledTimes(1)
      expect(mockQueueClose).toHaveBeenCalledTimes(1)
    })

    it('updates job status to paused after stop()', async () => {
      // Arrange
      await manager.add(createConfig({ name: 'lifecycle-job' }))
      await manager.start()

      // Act
      await manager.stop()
      const jobs = await manager.list()

      // Assert
      expect(jobs[0]!.status).toBe('paused')
    })
  })

  describe('job execution', () => {
    it('calls the handler when a job is processed', async () => {
      // Arrange
      const handler = vi.fn(async () => {})
      await manager.add(createConfig({ name: 'exec-job', handler }))
      await manager.start()

      // Act - simulate BullMQ invoking the worker handler
      const job = { name: 'exec-job', data: { jobName: 'exec-job' } }
      await workerHandler!(job)

      // Assert
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('logs structured execution info on success', async () => {
      // Arrange
      const { logger, calls } = createMockLogger()
      manager = new CronManager({ connection: 'redis://localhost:6379', logger })
      const handler = vi.fn(async () => {})
      await manager.add(createConfig({ name: 'logged-job', handler }))
      await manager.start()

      // Act
      await workerHandler!({ name: 'logged-job', data: { jobName: 'logged-job' } })

      // Assert
      const startedLogs = calls.info.filter((c) => c.msg === 'cron.job.started')
      const completedLogs = calls.info.filter((c) => c.msg === 'cron.job.completed')
      expect(startedLogs).toHaveLength(1)
      expect(completedLogs).toHaveLength(1)
      expect(completedLogs[0]!.data).toHaveProperty('jobName', 'logged-job')
      expect(completedLogs[0]!.data).toHaveProperty('durationMs')
    })

    it('logs error and re-throws when handler throws', async () => {
      // Arrange
      const { logger, calls } = createMockLogger()
      manager = new CronManager({ connection: 'redis://localhost:6379', logger })
      const handler = vi.fn(async () => {
        throw new Error('boom')
      })
      await manager.add(createConfig({ name: 'failing-job', handler }))
      await manager.start()

      // Act & Assert
      await expect(
        workerHandler!({ name: 'failing-job', data: { jobName: 'failing-job' } }),
      ).rejects.toThrow('boom')

      const errorLogs = calls.error.filter((c) => c.msg === 'cron.job.failed')
      expect(errorLogs).toHaveLength(1)
      expect(errorLogs[0]!.err).toHaveProperty('error', 'boom')
    })

    it('warns when an unknown job name is received by the worker', async () => {
      // Arrange
      const { logger, calls } = createMockLogger()
      manager = new CronManager({ connection: 'redis://localhost:6379', logger })
      await manager.start()

      // Act - send a job that was never registered
      await workerHandler!({ name: 'ghost', data: { jobName: 'ghost' } })

      // Assert
      expect(calls.warn).toHaveLength(1)
      expect(calls.warn[0]!.msg).toBe('cron.job.unknown')
    })
  })

  describe('job isolation', () => {
    it('one handler failure does not prevent other handlers from executing', async () => {
      // Arrange
      const handlerA = vi.fn(async () => {
        throw new Error('A fails')
      })
      const handlerB = vi.fn(async () => {})
      await manager.add(createConfig({ name: 'job-a', handler: handlerA }))
      await manager.add(createConfig({ name: 'job-b', handler: handlerB }))
      await manager.start()

      // Act - run job A (throws), then job B (should succeed)
      await expect(
        workerHandler!({ name: 'job-a', data: { jobName: 'job-a' } }),
      ).rejects.toThrow('A fails')

      await workerHandler!({ name: 'job-b', data: { jobName: 'job-b' } })

      // Assert
      expect(handlerA).toHaveBeenCalledTimes(1)
      expect(handlerB).toHaveBeenCalledTimes(1)
    })

    it('multiple jobs can be registered and executed independently', async () => {
      // Arrange
      const handlers: { name: string; fn: ReturnType<typeof vi.fn> }[] = []
      for (let i = 0; i < 5; i++) {
        const fn = vi.fn(async () => {})
        handlers.push({ name: `batch-${i}`, fn })
        await manager.add(
          createConfig({ name: `batch-${i}`, handler: fn, schedule: `*/${i + 1} * * * *` }),
        )
      }
      await manager.start()

      // Act - execute all handlers
      for (const h of handlers) {
        await workerHandler!({ name: h.name, data: { jobName: h.name } })
      }

      // Assert
      for (const h of handlers) {
        expect(h.fn).toHaveBeenCalledTimes(1)
      }

      // Verify list shows all 5
      const jobs = await manager.list()
      expect(jobs).toHaveLength(5)
    })
  })

  describe('connection options', () => {
    it('accepts string connection (Redis URL)', async () => {
      // Act
      const m = new CronManager({ connection: 'redis://localhost:6379' })

      // Assert - should construct without error
      expect(m).toBeDefined()
      await m.stop()
    })

    it('accepts object connection with host and port', async () => {
      // Act
      const m = new CronManager({ connection: { host: 'localhost', port: 6379 } })

      // Assert
      expect(m).toBeDefined()
      await m.stop()
    })
  })

  describe('schedule validation edge cases', () => {
    it.each([
      ['0 8 * * *', true],
      ['*/5 * * * *', true],
      ['0 0 1 * *', true],
      ['0 8 * * 0', true],
      ['*/15 * * * 1-5', true],
      ['0 */2 * * *', true],
      ['0 8 * * *', true],
      ['0 */5 * * * *', true], // 6-field
      ['', false],
      ['not-a-cron', false],
      ['* * *', false], // too few fields
      ['* * * * * * *', false], // too many fields
      ['abc def ghi jkl mno', false], // non-numeric
    ])('validates "%s" as %s', async (schedule, shouldPass) => {
      // Arrange
      const config = createConfig({ name: `validate-${schedule.replace(/\s+/g, '-')}`, schedule })

      if (shouldPass) {
        // Act & Assert
        await expect(manager.add(config)).resolves.toBeUndefined()
      } else {
        await expect(manager.add(config)).rejects.toThrow()
      }

      // Reset for next iteration
      try {
        await manager.remove(config.name)
      } catch {
        // ignore
      }
    })
  })
})
