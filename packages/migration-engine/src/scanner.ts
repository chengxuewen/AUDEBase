import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { MigrationStage, MIGRATION_STAGE_ORDER, type MigrationFile } from "./types.js";

const STAGE_FILES: Readonly<Record<MigrationStage, string>> = {
  [MigrationStage.PRELOAD]: "preload.sql",
  [MigrationStage.POSTSYNC]: "postsync.sql",
  [MigrationStage.POSTLOAD]: "postload.sql",
};

function parseSemVer(version: string): readonly [number, number, number] {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid SemVer: ${version}`);
  }
  return [parts[0]!, parts[1]!, parts[2]!];
}

function compareSemVer(a: string, b: string): number {
  const [aMajor, aMinor, aPatch] = parseSemVer(a);
  const [bMajor, bMinor, bPatch] = parseSemVer(b);
  if (aMajor !== bMajor) return aMajor - bMajor;
  if (aMinor !== bMinor) return aMinor - bMinor;
  return aPatch - bPatch;
}

function compareStage(a: MigrationStage, b: MigrationStage): number {
  return MIGRATION_STAGE_ORDER.indexOf(a) - MIGRATION_STAGE_ORDER.indexOf(b);
}

export interface MigrationFileSpec {
  readonly version: string;
  readonly stage: MigrationStage;
  readonly pluginName: string;
  readonly filePath: string;
  readonly content: string;
}

export class MigrationScanner {
  /**
   * Discover migration files under `pluginDir/migrations/`.
   * Only returns files for versions <= currentVersion, sorted SemVer ascending.
   */
  async scan(
    pluginDir: string,
    pluginName: string,
    currentVersion: string,
  ): Promise<readonly MigrationFile[]> {
    const migrationsDir = join(pluginDir, "migrations");
    let versionDirs: string[];

    try {
      versionDirs = await readdir(migrationsDir, { withFileTypes: true }).then((entries) =>
        entries.filter((e) => e.isDirectory()).map((e) => e.name),
      );
    } catch {
      return [];
    }

    const results: MigrationFile[] = [];

    for (const version of versionDirs) {
      // Skip versions malformed or > currentVersion
      try {
        parseSemVer(version);
      } catch {
        continue; // skip non-SemVer directories
      }

      if (compareSemVer(version, currentVersion) > 0) continue;

      for (const stage of MIGRATION_STAGE_ORDER) {
        const fileName = STAGE_FILES[stage];
        const filePath = join(migrationsDir, version, fileName);
        let content: string;
        try {
          content = await readFile(filePath, "utf-8");
        } catch {
          continue; // optional stage file
        }
        results.push({
          version,
          stage,
          pluginName,
          filePath,
          content,
        });
      }
    }

    results.sort((a, b) => {
      const versionCmp = compareSemVer(a.version, b.version);
      if (versionCmp !== 0) return versionCmp;
      return compareStage(a.stage, b.stage);
    });

    return results;
  }
}
