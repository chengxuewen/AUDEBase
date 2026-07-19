import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { BullScheduler } from "../scheduler";
import type { CronJob, CronHandler } from "../types";

// ponytail: mock bullmq entirely — tests scheduler logic, not Redis/Worker internals.
// Integration tests with real Redis belong in E2E suite.

const mockQueueClose = vi.fn().mockResolvedValue(undefined);
const mockWorkerClose = vi.fn().mockResolvedValue(undefined);
const mockQueueAdd = vi.fn().mockResolvedValue(undefined);
const mockQueueRemoveRepeatable = vi.fn().mockResolvedValue(undefined);
const mockGetRepeatableJobs = vi.fn().mockResolvedValue([]);

vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: mockQueueAdd,
    removeRepeatable: mockQueueRemoveRepeatable,
    getRepeatableJobs: mockGetRepeatableJobs,
    close: mockQueueClose,
  })),
  Worker: vi.fn().mockImplementation(() => ({
    close: mockWorkerClose,
  })),
}));

function createRedisUrl(): string {
  return "redis://localhost:6379";
}

function createJob(overrides: Partial<CronJob> = {}): CronJob {
  return {
    name: "test-cleanup",
    schedule: "0 3 * * *",
    pluginName: "test-plugin",
    ...overrides,
  };
}

function createHandler(): CronHandler {
  return vi.fn().mockResolvedValue(undefined);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetRepeatableJobs.mockResolvedValue([]);
});

// ── BullScheduler.add ─────────────────────────────────────────

describe("BullScheduler.add", () => {
  let scheduler: BullScheduler;

  beforeEach(async () => {
    scheduler = new BullScheduler({ redisUrl: createRedisUrl() });
    await scheduler.start();
  });

  afterEach(async () => {
    await scheduler.stop();
  });

  test("registers repeatable job on start", async () => {
    // Arrange
    const handler = createHandler();

    // Act
    await scheduler.add(createJob({ name: "midnight-sync" }), handler);

    // Assert
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "midnight-sync",
      { pluginName: "test-plugin" },
      { repeat: { pattern: "0 3 * * *" }, jobId: "cron:midnight-sync" },
    );
  });

  test("adds multiple jobs", async () => {
    // Arrange
    mockGetRepeatableJobs.mockResolvedValue([{ name: "job-a" }, { name: "job-b" }]);

    // Act
    await scheduler.add(createJob({ name: "job-a" }), createHandler());
    await scheduler.add(createJob({ name: "job-b" }), createHandler());
    const jobs = await scheduler.list();

    // Assert
    expect(jobs).toHaveLength(2);
  });

  test("add before start registers on start", async () => {
    // Arrange
    const early = new BullScheduler({ redisUrl: createRedisUrl() });
    const handler = createHandler();

    // Act — add before start, then start
    await early.add(createJob({ name: "early-bird" }), handler);
    await early.start();

    // Assert
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "early-bird",
      { pluginName: "test-plugin" },
      { repeat: { pattern: "0 3 * * *" }, jobId: "cron:early-bird" },
    );

    await early.stop();
  });
});

// ── BullScheduler.remove ───────────────────────────────────────

describe("BullScheduler.remove", () => {
  let scheduler: BullScheduler;

  beforeEach(async () => {
    scheduler = new BullScheduler({ redisUrl: createRedisUrl() });
    await scheduler.add(createJob({ name: "keep-me" }), createHandler());
    await scheduler.add(createJob({ name: "remove-me" }), createHandler());
    await scheduler.start();
  });

  afterEach(async () => {
    await scheduler.stop();
  });

  test("calls removeRepeatable on queue", async () => {
    // Act
    await scheduler.remove("remove-me");

    // Assert
    expect(mockQueueRemoveRepeatable).toHaveBeenCalledWith("remove-me", { pattern: "0 3 * * *" });
  });

  test("removed job no longer in list", async () => {
    // Arrange
    mockGetRepeatableJobs.mockResolvedValue([{ name: "keep-me" }]);

    // Act
    await scheduler.remove("remove-me");
    const jobs = await scheduler.list();

    // Assert
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.name).toBe("keep-me");
  });

  test("removing non-existent job does not throw", async () => {
    await expect(scheduler.remove("does-not-exist")).resolves.toBeUndefined();
  });
});

// ── BullScheduler.list ─────────────────────────────────────────

describe("BullScheduler.list", () => {
  test("returns empty array when not started", async () => {
    // Arrange
    const scheduler = new BullScheduler({ redisUrl: createRedisUrl() });
    await scheduler.add(createJob(), createHandler());

    // Act
    const jobs = await scheduler.list();

    // Assert
    expect(jobs).toEqual([]);
    await scheduler.stop();
  });

  test("returns registered jobs after start", async () => {
    // Arrange
    const scheduler = new BullScheduler({ redisUrl: createRedisUrl() });
    await scheduler.add(createJob({ name: "job-x" }), createHandler());
    await scheduler.start();
    mockGetRepeatableJobs.mockResolvedValue([{ name: "job-x" }]);

    // Act
    const jobs = await scheduler.list();

    // Assert
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.name).toBe("job-x");

    await scheduler.stop();
  });
});

// ── BullScheduler.start/stop ──────────────────────────────────

describe("BullScheduler.start/stop lifecycle", () => {
  test("start creates Queue and Worker", async () => {
    // Arrange
    const scheduler = new BullScheduler({ redisUrl: createRedisUrl() });

    // Act
    await scheduler.start();

    // Assert
    const { Queue: MockQueue, Worker: MockWorker } = await import("bullmq");
    expect(MockQueue).toHaveBeenCalledTimes(1);
    expect(MockWorker).toHaveBeenCalledTimes(1);

    await scheduler.stop();
  });

  test("stop closes queue and worker", async () => {
    // Arrange
    const scheduler = new BullScheduler({ redisUrl: createRedisUrl() });
    await scheduler.start();

    // Act
    await scheduler.stop();

    // Assert
    expect(mockQueueClose).toHaveBeenCalled();
    expect(mockWorkerClose).toHaveBeenCalled();
  });

  test("start is idempotent", async () => {
    // Arrange
    const scheduler = new BullScheduler({ redisUrl: createRedisUrl() });
    await scheduler.start();
    await scheduler.start();

    // Act
    await scheduler.stop();
    // Assert — no error thrown
  });

  test("double stop is safe", async () => {
    // Arrange
    const scheduler = new BullScheduler({ redisUrl: createRedisUrl() });
    await scheduler.start();
    await scheduler.stop();

    // Act & Assert
    await expect(scheduler.stop()).resolves.toBeUndefined();
  });

  test("stop before start is safe", async () => {
    // Arrange
    const scheduler = new BullScheduler({ redisUrl: createRedisUrl() });

    // Act & Assert
    await expect(scheduler.stop()).resolves.toBeUndefined();
  });
});

// ── CronJob type ──────────────────────────────────────────────

describe("CronJob type", () => {
  test("validates required fields", () => {
    // Arrange
    const job: CronJob = {
      name: "midnight-sync",
      schedule: "0 0 * * *",
      pluginName: "@audebase/plugin-erp",
    };

    // Assert
    expect(job.name).toBe("midnight-sync");
    expect(job.schedule).toBe("0 0 * * *");
    expect(job.pluginName).toBe("@audebase/plugin-erp");
  });

  test("handles every-minute schedule", () => {
    // Arrange
    const job: CronJob = {
      name: "heartbeat",
      schedule: "* * * * *",
      pluginName: "system",
    };

    // Assert
    expect(job.schedule).toBe("* * * * *");
  });
});
