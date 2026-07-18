import { MigrationScanner } from "./scanner.js";
import { MigrationResolver } from "./resolver.js";
import { MigrationExecutor } from "./executor.js";
import { type MigrationRecord, type MigrationResult, type SqlExecutor } from "./types.js";

export class MigrationRunner {
  private readonly scanner: MigrationScanner;
  private readonly resolver: MigrationResolver;
  private readonly executor: MigrationExecutor;

  constructor(
    scanner?: MigrationScanner,
    resolver?: MigrationResolver,
    executor?: MigrationExecutor,
  ) {
    this.scanner = scanner ?? new MigrationScanner();
    this.resolver = resolver ?? new MigrationResolver();
    this.executor = executor ?? new MigrationExecutor();
  }

  /**
   * Full pipeline: scan → resolve → execute.
   * If any migration fails, it is marked failed and execution continues.
   */
  async run(
    pluginDir: string,
    pluginName: string,
    currentVersion: string,
    history: readonly MigrationRecord[],
    executeSql: SqlExecutor,
  ): Promise<MigrationResult> {
    const discovered = await this.scanner.scan(pluginDir, pluginName, currentVersion);
    const pending = this.resolver.resolve(discovered, history);

    const executed: MigrationRecord[] = [];
    const failed: MigrationRecord[] = [];

    for (const migration of pending) {
      const record = await this.executor.execute(migration, executeSql);
      executed.push(record);
      if (record.status === "failed") {
        failed.push(record);
      }
    }

    return {
      success: failed.length === 0,
      executed,
      failed: failed.length > 0 ? failed : undefined,
    };
  }
}
