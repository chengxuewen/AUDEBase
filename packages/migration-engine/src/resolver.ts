import type { MigrationStage } from "./types.js";
import { MIGRATION_STAGE_ORDER, type MigrationFile, type MigrationRecord } from "./types.js";

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

function historyKey(record: MigrationRecord): string {
  return `${record.pluginName}|${record.version}|${record.stage}`;
}

export class MigrationResolver {
  /**
   * Filter migrations already completed (by matching plugin+version+stage in history).
   * Failed migrations are NOT filtered — they retry on next run.
   * Returns pending migrations sorted by version then stage.
   */
  resolve(
    migrations: readonly MigrationFile[],
    history: readonly MigrationRecord[],
  ): readonly MigrationFile[] {
    const completed = new Set(history.filter((r) => r.status === "completed").map(historyKey));

    const pending = migrations.filter(
      (m) => !completed.has(`${m.pluginName}|${m.version}|${m.stage}`),
    );

    return [...pending].sort((a, b) => {
      const versionCmp = compareSemVer(a.version, b.version);
      if (versionCmp !== 0) return versionCmp;
      return compareStage(a.stage, b.stage);
    });
  }
}
