/**
 * Cron module type definitions
 *
 * Phase 1b: BullMQ repeatable jobs for scheduled tasks.
 * Same-process execution only.
 */

import type { Queue, Worker, Job } from "bullmq";

/** Registered cron job descriptor */
export interface CronJob {
  /** Unique job name (e.g. "audit-cleanup") */
  name: string;
  /** Cron expression (e.g. "0 3 * * *") */
  schedule: string;
  /** Plugin that registered this job */
  pluginName: string;
}

/** Handler function signature for a cron job */
export type CronHandler = (job: Job) => Promise<void>;

/** Options for creating a BullScheduler */
export interface CronSchedulerOptions {
  /** Redis connection URL (e.g. redis://localhost:6379) */
  redisUrl: string;
  /** Optional queue name (default: "system-cron") */
  queueName?: string;
}

/** Cron management interface */
export interface CronRegistry {
  /** Register a repeatable cron job */
  add(job: CronJob, handler: CronHandler): Promise<void>;
  /** Remove a previously registered cron job */
  remove(name: string): Promise<void>;
  /** List all registered cron jobs */
  list(): Promise<CronJob[]>;
  /** Start processing (create Worker) */
  start(): Promise<void>;
  /** Stop processing (close Worker) */
  stop(): Promise<void>;
}

/** Internal: stored job with its handler */
export interface RegisteredJob {
  job: CronJob;
  handler: CronHandler;
  queue: Queue;
  worker: Worker | null;
}
