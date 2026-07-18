/** AUDEBase Migration Engine — three-stage Odoo+NocoBase migration types. */
export enum MigrationStage {
  PRELOAD = "preload",
  POSTSYNC = "postsync",
  POSTLOAD = "postload",
}

export const MIGRATION_STAGE_ORDER: readonly MigrationStage[] = [
  MigrationStage.PRELOAD,
  MigrationStage.POSTSYNC,
  MigrationStage.POSTLOAD,
] as const;

export interface MigrationFile {
  readonly version: string;
  readonly stage: MigrationStage;
  readonly pluginName: string;
  readonly filePath: string;
  readonly content: string;
}

export type MigrationStatus = "pending" | "running" | "completed" | "failed";

export interface MigrationRecord {
  readonly id: string;
  readonly pluginName: string;
  readonly version: string;
  readonly stage: MigrationStage;
  readonly status: MigrationStatus;
  readonly error?: string;
  readonly executedAt?: Date;
}

export interface MigrationResult {
  readonly success: boolean;
  readonly executed: readonly MigrationRecord[];
  readonly failed?: readonly MigrationRecord[];
}

export type SqlExecutor = (sql: string) => Promise<void>;
