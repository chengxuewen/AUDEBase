import { describe, test, expect } from "vitest";
import { MigrationExecutor } from "../executor.js";
import { MigrationStage, type MigrationFile } from "../types.js";

function makeFile(
  version: string,
  stage: MigrationStage,
  pluginName = "test-plugin",
  content = `-- ${version} ${stage}`,
): MigrationFile {
  return { version, stage, pluginName, filePath: `/fake/${stage}.sql`, content };
}

describe("MigrationExecutor", () => {
  test("executes SQL callback and returns completed record", async () => {
    // Arrange
    const migration = makeFile("1.0.0", MigrationStage.PRELOAD);
    const executed: string[] = [];
    const executeSql = async (sql: string): Promise<void> => {
      executed.push(sql);
    };
    const executor = new MigrationExecutor();

    // Act
    const record = await executor.execute(migration, executeSql);

    // Assert
    expect(record.status).toBe("completed");
    expect(record.pluginName).toBe("test-plugin");
    expect(record.version).toBe("1.0.0");
    expect(record.stage).toBe(MigrationStage.PRELOAD);
    expect(record.executedAt).toBeInstanceOf(Date);
    expect(executed).toEqual(["-- 1.0.0 preload"]);
  });

  test("catches SQL execution errors and returns failed record with error message", async () => {
    // Arrange
    const migration = makeFile("1.0.0", MigrationStage.POSTSYNC);
    const executeSql = async (_sql: string): Promise<void> => {
      throw new Error("table does not exist");
    };
    const executor = new MigrationExecutor();

    // Act
    const record = await executor.execute(migration, executeSql);

    // Assert
    expect(record.status).toBe("failed");
    expect(record.error).toBe("table does not exist");
    expect(record.executedAt).toBeInstanceOf(Date);
  });

  test("does NOT rethrow — returns failed record instead", async () => {
    // Arrange
    const migration = makeFile("1.0.0", MigrationStage.POSTLOAD);
    const executeSql = async (_sql: string): Promise<void> => {
      throw new Error("boom");
    };
    const executor = new MigrationExecutor();

    // Act
    const record = await executor.execute(migration, executeSql);

    // Assert
    expect(record.status).toBe("failed");
    expect(record.error).toBe("boom");
  });

  test("handles non-Error thrown values", async () => {
    // Arrange
    const migration = makeFile("1.0.0", MigrationStage.PRELOAD);
    const executeSql = async (_sql: string): Promise<void> => {
      throw new Error("string error");
    };
    const executor = new MigrationExecutor();

    // Act
    const record = await executor.execute(migration, executeSql);

    // Assert
    expect(record.status).toBe("failed");
    expect(record.error).toBe("string error");
  });

  test("generates unique IDs for each execution", async () => {
    // Arrange
    const migration = makeFile("1.0.0", MigrationStage.PRELOAD);
    const executeSql = async (_sql: string): Promise<void> => {};
    const executor = new MigrationExecutor();

    // Act
    const a = await executor.execute(migration, executeSql);
    const b = await executor.execute(migration, executeSql);

    // Assert
    expect(a.id).not.toBe(b.id);
  });
});
