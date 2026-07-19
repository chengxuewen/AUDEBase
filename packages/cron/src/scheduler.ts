import { Queue, Worker, type Job } from "bullmq";
import type { CronJob, CronHandler, CronRegistry, CronSchedulerOptions } from "./types";

/**
 * BullScheduler — manages cron jobs via BullMQ repeatable jobs.
 *
 * Uses a single Queue per scheduler instance with repeatable jobs.
 * The Worker processes jobs in the same process (Phase 1).
 */
export class BullScheduler implements CronRegistry {
  private readonly queueName: string;
  private readonly redisUrl: string;
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private readonly handlers = new Map<string, CronHandler>();
  private readonly jobs = new Map<string, CronJob>();
  private started = false;

  constructor(options: CronSchedulerOptions) {
    this.redisUrl = options.redisUrl;
    this.queueName = options.queueName ?? "system-cron";
  }

  async add(job: CronJob, handler: CronHandler): Promise<void> {
    this.handlers.set(job.name, handler);
    this.jobs.set(job.name, job);

    // If already started, register the repeatable job immediately
    if (this.queue) {
      await this.queue.add(
        job.name,
        { pluginName: job.pluginName },
        {
          repeat: { pattern: job.schedule },
          jobId: `cron:${job.name}`,
        },
      );
    }
  }

  async remove(name: string): Promise<void> {
    if (this.queue) {
      await this.queue.removeRepeatable(name, { pattern: this.resolvePattern(name) });
    }
    this.handlers.delete(name);
    this.jobs.delete(name);
  }

  async list(): Promise<CronJob[]> {
    if (!this.queue) return [];

    const repeatableJobs = await this.queue.getRepeatableJobs();
    return repeatableJobs
      .map((rj) => this.jobs.get(rj.name))
      .filter((j): j is CronJob => j !== undefined);
  }

  async start(): Promise<void> {
    if (this.started) return;

    this.queue = new Queue(this.queueName, {
      connection: { url: this.redisUrl },
    });

    // Register all pending jobs
    const pending = Array.from(this.jobs.values());
    for (const job of pending) {
      await this.queue.add(
        job.name,
        { pluginName: job.pluginName },
        {
          repeat: { pattern: job.schedule },
          jobId: `cron:${job.name}`,
        },
      );
    }

    // Create worker that dispatches to registered handlers
    this.worker = new Worker(
      this.queueName,
      async (bullJob: Job) => {
        const handler = this.handlers.get(bullJob.name);
        if (handler) {
          await handler(bullJob);
        }
      },
      { connection: { url: this.redisUrl } },
    );

    this.started = true;
  }

  async stop(): Promise<void> {
    this.started = false;
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }
  }

  private resolvePattern(name: string): string {
    return this.jobs.get(name)?.schedule ?? "* * * * *";
  }
}
