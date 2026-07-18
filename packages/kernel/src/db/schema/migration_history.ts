import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { modules } from "./modules";

/**
 * migration_history — 迁移追踪表
 *
 * 记录每个模块的迁移执行历史。
 * 按 module_id + version 唯一约束，确保同版本不重复执行。
 */
export const migrationHistory = pgTable(
  "migration_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    module_id: uuid("module_id")
      .notNull()
      .references(() => modules.id, { onDelete: "cascade" }),

    version: varchar("version", { length: 50 }).notNull(),
    phase: varchar("phase", { length: 20 }).notNull(),
    filename: varchar("filename", { length: 500 }),

    status: varchar("status", { length: 20 }).notNull().default("pending"),
    error_message: text("error_message"),
    execution_time_ms: integer("execution_time_ms"),

    executed_at: timestamp("executed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_migration_version").on(table.module_id, table.version, table.phase),
    index("idx_migration_module").on(table.module_id),
    index("idx_migration_status").on(table.module_id, table.status),
  ],
);

export type MigrationHistory = typeof migrationHistory.$inferSelect;
export type NewMigrationHistory = typeof migrationHistory.$inferInsert;
