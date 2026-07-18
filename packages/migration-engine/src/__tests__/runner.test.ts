import { describe, test, expect, vi } from "vitest";
import { MigrationRunner } from "../runner.js";
import {
  MigrationStage,
  type MigrationFile,
  type MigrationRecord,
  type MigrationResult,
} from "../types.js";

// Mock the scanner, resolver, executor dependencies so runner tests are unit-scoped.
// Use the constructor injection to pass mocks.

describe("MigrationRunner", () => {
  test("full pipeline from scan to result — all success", async () => {
    // Arrange
    const file: MigrationFile = {
      version: "1.0.0",
      stage: MigrationStage.PRELOAD,
      pluginName: "test",
      filePath: "/fake/preload.sql",
      content: "SELECT 1",
    };
    const mockScanner = {
      scan: vi.fn().mockResolvedValue([file]),
    };
    const mockResolver = {
      resolve: vi.fn().mockReturnValue([file]),
    };
    const mockExecutor = {
      execute: vi.fn().mockImplementation(async (m: MigrationFile): Promise<MigrationRecord> => ({
        id: "rec-1",
        pluginName: m.pluginName,
        version: m.version,
        stage: m.stage,
        status: "completed",
        executedAt: new Date(),
      })),
    };

    const runner = new MigrationRunner(mockScanner, mockResolver, mockExecutor);

    // Act
    const result: MigrationResult = await runner.run(
      "/fake/plugin",
      "test",
      "2.0.0",
      [],
      async (_sql: string): Promise<void> => {},
    );

    // Assert
    expect(result.success).toBe(true);
    expect(result.executed).toHaveLength(1);
    expect(result.executed[0]!.status).toBe("completed");
    expect(result.failed).toBeUndefined();
    expect(mockScanner.scan).toHaveBeenCalledWith("/fake/plugin", "test", "2.0.0");
    expect(mockResolver.resolve).toHaveBeenCalledWith([file], []);
    expect(mockExecutor.execute).toHaveBeenCalledTimes(1);
  });

  test("continues after one migration fails", async () => {
    // Arrange
    const file1: MigrationFile = {
      version: "0.1.0",
      stage: MigrationStage.PRELOAD,
      pluginName: "test",
      filePath: "/fake/0.1.0/preload.sql",
      content: "BAD SQL",
    };
    const file2: MigrationFile = {
      version: "1.0.0",
      stage: MigrationStage.PRELOAD,
      pluginName: "test",
      filePath: "/fake/1.0.0/preload.sql",
      content: "GOOD SQL",
    };
    const mockScanner = { scan: vi.fn().mockResolvedValue([file1, file2]) };
    const mockResolver = { resolve: vi.fn().mockReturnValue([file1, file2]) };
    const mockExecutor = {
      execute: vi
        .fn()
        .mockImplementationOnce(async (): Promise<MigrationRecord> => ({
          id: "rec-1",
          pluginName: "test",
          version: "0.1.0",
          stage: MigrationStage.PRELOAD,
          status: "failed",
          error: "syntax error",
          executedAt: new Date(),
        }))
        .mockImplementationOnce(async (m: MigrationFile): Promise<MigrationRecord> => ({
          id: "rec-2",
          pluginName: m.pluginName,
          version: m.version,
          stage: m.stage,
          status: "completed",
          executedAt: new Date(),
        })),
    };

    const runner = new MigrationRunner(mockScanner, mockResolver, mockExecutor);

    // Act
    const result: MigrationResult = await runner.run("/fake", "test", "2.0.0", [], async () => {});

    // Assert
    expect(result.success).toBe(false);
    expect(result.executed).toHaveLength(2);
    expect(result.executed[0]!.status).toBe("failed");
    expect(result.executed[1]!.status).toBe("completed");
    expect(result.failed).toHaveLength(1);
    expect(result.failed![0]!.version).toBe("0.1.0");
  });

  test("multiple versions and stages are handled in order", async () => {
    // Arrange
    const files: MigrationFile[] = [
      {
        version: "0.1.0",
        stage: MigrationStage.PRELOAD,
        pluginName: "test",
        filePath: "/a",
        content: "a",
      },
      {
        version: "0.1.0",
        stage: MigrationStage.POSTSYNC,
        pluginName: "test",
        filePath: "/b",
        content: "b",
      },
      {
        version: "1.0.0",
        stage: MigrationStage.PRELOAD,
        pluginName: "test",
        filePath: "/c",
        content: "c",
      },
    ];
    const executedInOrder: string[] = [];
    const mockScanner = { scan: vi.fn().mockResolvedValue(files) };
    const mockResolver = { resolve: vi.fn().mockReturnValue(files) };
    const mockExecutor = {
      execute: vi.fn().mockImplementation(async (m: MigrationFile): Promise<MigrationRecord> => {
        executedInOrder.push(`${m.version}:${m.stage}`);
        return {
          id: "r",
          pluginName: m.pluginName,
          version: m.version,
          stage: m.stage,
          status: "completed",
          executedAt: new Date(),
        };
      }),
    };

    const runner = new MigrationRunner(mockScanner, mockResolver, mockExecutor);

    // Act
    await runner.run("/fake", "test", "2.0.0", [], async () => {});

    // Assert
    expect(executedInOrder).toEqual(["0.1.0:preload", "0.1.0:postsync", "1.0.0:preload"]);
  });

  test("passes history to resolver for filtering", async () => {
    // Arrange
    const historyRecord: MigrationRecord = {
      id: "h1",
      pluginName: "test",
      version: "0.1.0",
      stage: MigrationStage.PRELOAD,
      status: "completed",
    };
    const mockScanner = { scan: vi.fn().mockResolvedValue([]) };
    const mockResolver = { resolve: vi.fn().mockReturnValue([]) };
    const mockExecutor = { execute: vi.fn() };

    const runner = new MigrationRunner(mockScanner, mockResolver, mockExecutor);

    // Act
    await runner.run("/fake", "test", "1.0.0", [historyRecord], async () => {});

    // Assert
    expect(mockResolver.resolve).toHaveBeenCalledWith([], [historyRecord]);
  });

  test("returns success=true with no failed when nothing pending", async () => {
    // Arrange
    const mockScanner = { scan: vi.fn().mockResolvedValue([]) };
    const mockResolver = { resolve: vi.fn().mockReturnValue([]) };
    const mockExecutor = { execute: vi.fn() };

    const runner = new MigrationRunner(mockScanner, mockResolver, mockExecutor);

    // Act
    const result = await runner.run("/fake", "test", "1.0.0", [], async () => {});

    // Assert
    expect(result.success).toBe(true);
    expect(result.executed).toHaveLength(0);
    expect(result.failed).toBeUndefined();
    expect(mockExecutor.execute).not.toHaveBeenCalled();
  });
});
