import { describe, test, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MigrationScanner } from "../scanner.js";
import { MigrationStage } from "../types.js";

function createTempPluginDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "migration-scanner-test-"));
  return dir;
}

function makeMigrations(baseDir: string, files: Record<string, string>): void {
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = join(baseDir, relPath);
    mkdirSync(join(fullPath, ".."), { recursive: true });
    writeFileSync(fullPath, content, "utf-8");
  }
}

describe("MigrationScanner", () => {
  test("discovers migration files and sorts by SemVer ascending then stage", async () => {
    // Arrange
    const dir = createTempPluginDir();
    try {
      makeMigrations(dir, {
        "migrations/1.0.0/preload.sql": "CREATE TABLE users",
        "migrations/1.0.0/postsync.sql": "INSERT INTO users",
        "migrations/1.0.0/postload.sql": "REINDEX TABLE users",
        "migrations/0.1.0/preload.sql": "CREATE TABLE roles",
        "migrations/0.1.0/postload.sql": "REINDEX TABLE roles",
      });
      const scanner = new MigrationScanner();

      // Act
      const result = await scanner.scan(dir, "test-plugin", "2.0.0");

      // Assert
      expect(result).toHaveLength(5);
      // 0.1.0 before 1.0.0
      expect(result[0]!.version).toBe("0.1.0");
      expect(result[0]!.stage).toBe(MigrationStage.PRELOAD);
      expect(result[0]!.content).toBe("CREATE TABLE roles");
      expect(result[1]!.version).toBe("0.1.0");
      expect(result[1]!.stage).toBe(MigrationStage.POSTLOAD);
      expect(result[2]!.version).toBe("1.0.0");
      expect(result[2]!.stage).toBe(MigrationStage.PRELOAD);
      expect(result[3]!.version).toBe("1.0.0");
      expect(result[3]!.stage).toBe(MigrationStage.POSTSYNC);
      expect(result[4]!.version).toBe("1.0.0");
      expect(result[4]!.stage).toBe(MigrationStage.POSTLOAD);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("skips versions greater than currentVersion", async () => {
    // Arrange
    const dir = createTempPluginDir();
    try {
      makeMigrations(dir, {
        "migrations/0.1.0/preload.sql": "a",
        "migrations/1.0.0/preload.sql": "b",
        "migrations/2.0.0/preload.sql": "c",
      });
      const scanner = new MigrationScanner();

      // Act
      const result = await scanner.scan(dir, "test-plugin", "1.0.0");

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0]!.version).toBe("0.1.0");
      expect(result[1]!.version).toBe("1.0.0");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("handles empty migrations directory", async () => {
    // Arrange
    const dir = createTempPluginDir();
    try {
      mkdirSync(join(dir, "migrations"));
      const scanner = new MigrationScanner();

      // Act
      const result = await scanner.scan(dir, "test-plugin", "1.0.0");

      // Assert
      expect(result).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("handles missing migrations directory gracefully", async () => {
    // Arrange
    const dir = createTempPluginDir();
    try {
      const scanner = new MigrationScanner();

      // Act
      const result = await scanner.scan(dir, "test-plugin", "1.0.0");

      // Assert
      expect(result).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("skips non-SemVer directory names", async () => {
    // Arrange
    const dir = createTempPluginDir();
    try {
      makeMigrations(dir, {
        "migrations/0.1.0/preload.sql": "a",
      });
      // Non-directory, non-SemVer entry — should be skipped by scanner
      writeFileSync(join(dir, "migrations", "readme.txt"), "not a version");
      const scanner = new MigrationScanner();

      // Act
      const result = await scanner.scan(dir, "test-plugin", "2.0.0");

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]!.version).toBe("0.1.0");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("sorts multiple versions correctly: 0.1.0 < 0.2.0 < 1.0.0 < 2.0.0", async () => {
    // Arrange
    const dir = createTempPluginDir();
    try {
      makeMigrations(dir, {
        "migrations/2.0.0/preload.sql": "d",
        "migrations/0.2.0/preload.sql": "b",
        "migrations/1.0.0/preload.sql": "c",
        "migrations/0.1.0/preload.sql": "a",
      });
      const scanner = new MigrationScanner();

      // Act
      const result = await scanner.scan(dir, "test-plugin", "3.0.0");

      // Assert
      const versions = result.map((m) => m.version);
      expect(versions).toEqual(["0.1.0", "0.2.0", "1.0.0", "2.0.0"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("only includes migrations with version less than or equal to currentVersion", async () => {
    // Arrange
    const dir = createTempPluginDir();
    try {
      makeMigrations(dir, {
        "migrations/1.0.0/preload.sql": "a",
        "migrations/1.0.1/preload.sql": "b",
        "migrations/1.1.0/preload.sql": "c",
      });
      const scanner = new MigrationScanner();

      // Act
      const result = await scanner.scan(dir, "test-plugin", "1.0.1");

      // Assert
      const versions = result.map((m) => m.version);
      expect(versions).toEqual(["1.0.0", "1.0.1"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("includes pluginName and filePath in results", async () => {
    // Arrange
    const dir = createTempPluginDir();
    try {
      makeMigrations(dir, {
        "migrations/1.0.0/preload.sql": "CREATE TABLE test",
      });
      const scanner = new MigrationScanner();

      // Act
      const result = await scanner.scan(dir, "my-plugin", "2.0.0");

      // Assert
      expect(result).toHaveLength(1);
      const m = result[0]!;
      expect(m.pluginName).toBe("my-plugin");
      expect(m.filePath).toContain("migrations/1.0.0/preload.sql");
      expect(m.content).toBe("CREATE TABLE test");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
