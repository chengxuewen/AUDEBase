import { type MigrationFile, type MigrationRecord, type SqlExecutor } from "./types.js";

let nextId = 0;
function generateId(): string {
  nextId += 1;
  return `mig_${nextId}`;
}

export class MigrationExecutor {
  /**
   * Execute a single migration file through the provided SQL executor callback.
   * On success returns a completed MigrationRecord.
   * On failure returns a failed MigrationRecord with the error message (does NOT rethrow).
   */
  async execute(migration: MigrationFile, executeSql: SqlExecutor): Promise<MigrationRecord> {
    const id = generateId();
    const baseRecord: Omit<MigrationRecord, "status" | "error" | "executedAt"> = {
      id,
      pluginName: migration.pluginName,
      version: migration.version,
      stage: migration.stage,
    };

    try {
      await executeSql(migration.content);
      return {
        ...baseRecord,
        status: "completed",
        executedAt: new Date(),
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ...baseRecord,
        status: "failed",
        error: message,
        executedAt: new Date(),
      };
    }
  }
}
