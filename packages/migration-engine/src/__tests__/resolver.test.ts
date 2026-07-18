import { describe, test, expect } from "vitest";
import { MigrationResolver } from "../resolver.js";
import { MigrationStage, type MigrationFile, type MigrationRecord } from "../types.js";

function makeFile(
  version: string,
  stage: MigrationStage,
  pluginName = "test-plugin",
): MigrationFile {
  return {
    version,
    stage,
    pluginName,
    filePath: `/fake/${version}/${stage}.sql`,
    content: `-- ${version} ${stage}`,
  };
}

function makeRecord(
  version: string,
  stage: MigrationStage,
  status: "completed" | "failed",
  pluginName = "test-plugin",
  id?: string,
): MigrationRecord {
  return {
    id: id ?? `${pluginName}-${version}-${stage}`,
    pluginName,
    version,
    stage,
    status,
  };
}

describe("MigrationResolver", () => {
  test("filters out already-completed migrations", () => {
    // Arrange
    const migrations: MigrationFile[] = [
      makeFile("0.1.0", MigrationStage.PRELOAD),
      makeFile("0.1.0", MigrationStage.POSTSYNC),
      makeFile("1.0.0", MigrationStage.PRELOAD),
    ];
    const history: MigrationRecord[] = [makeRecord("0.1.0", MigrationStage.PRELOAD, "completed")];
    const resolver = new MigrationResolver();

    // Act
    const result = resolver.resolve(migrations, history);

    // Assert
    expect(result).toHaveLength(2);
    expect(result[0]!.version).toBe("0.1.0");
    expect(result[0]!.stage).toBe(MigrationStage.POSTSYNC);
    expect(result[1]!.version).toBe("1.0.0");
    expect(result[1]!.stage).toBe(MigrationStage.PRELOAD);
  });

  test("does NOT filter failed migrations (retry on next run)", () => {
    // Arrange
    const migrations: MigrationFile[] = [
      makeFile("0.1.0", MigrationStage.PRELOAD),
      makeFile("1.0.0", MigrationStage.PRELOAD),
    ];
    const history: MigrationRecord[] = [makeRecord("0.1.0", MigrationStage.PRELOAD, "failed")];
    const resolver = new MigrationResolver();

    // Act
    const result = resolver.resolve(migrations, history);

    // Assert
    expect(result).toHaveLength(2); // failed still appears
    expect(result[0]!.version).toBe("0.1.0"); // retried
  });

  test("returns empty array when all migrations are completed", () => {
    // Arrange
    const migrations: MigrationFile[] = [makeFile("1.0.0", MigrationStage.PRELOAD)];
    const history: MigrationRecord[] = [makeRecord("1.0.0", MigrationStage.PRELOAD, "completed")];
    const resolver = new MigrationResolver();

    // Act
    const result = resolver.resolve(migrations, history);

    // Assert
    expect(result).toHaveLength(0);
  });

  test("sorts by version then stage", () => {
    // Arrange
    const migrations: MigrationFile[] = [
      makeFile("1.0.0", MigrationStage.POSTLOAD),
      makeFile("0.1.0", MigrationStage.POSTSYNC),
      makeFile("1.0.0", MigrationStage.PRELOAD),
      makeFile("0.1.0", MigrationStage.PRELOAD),
    ];
    const history: MigrationRecord[] = [];
    const resolver = new MigrationResolver();

    // Act
    const result = resolver.resolve(migrations, history);

    // Assert
    expect(result[0]!.version).toBe("0.1.0");
    expect(result[0]!.stage).toBe(MigrationStage.PRELOAD);
    expect(result[1]!.version).toBe("0.1.0");
    expect(result[1]!.stage).toBe(MigrationStage.POSTSYNC);
    expect(result[2]!.version).toBe("1.0.0");
    expect(result[2]!.stage).toBe(MigrationStage.PRELOAD);
    expect(result[3]!.version).toBe("1.0.0");
    expect(result[3]!.stage).toBe(MigrationStage.POSTLOAD);
  });

  test("only matches completed records by exact plugin+version+stage", () => {
    // Arrange
    const migrations: MigrationFile[] = [
      makeFile("1.0.0", MigrationStage.PRELOAD, "plugin-a"),
      makeFile("1.0.0", MigrationStage.PRELOAD, "plugin-b"),
    ];
    const history: MigrationRecord[] = [
      makeRecord("1.0.0", MigrationStage.PRELOAD, "completed", "plugin-a"),
    ];
    const resolver = new MigrationResolver();

    // Act
    const result = resolver.resolve(migrations, history);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]!.pluginName).toBe("plugin-b");
  });

  test("ignores non-completed statuses like 'running'", () => {
    // Arrange
    const migrations: MigrationFile[] = [makeFile("1.0.0", MigrationStage.PRELOAD)];
    const history: MigrationRecord[] = [
      makeRecord("1.0.0", MigrationStage.PRELOAD, "running" as "completed"),
    ];
    // running != completed, so it should not filter
    const resolver = new MigrationResolver();

    // Act
    const result = resolver.resolve(migrations, history);

    // Assert
    expect(result).toHaveLength(1);
  });
});
