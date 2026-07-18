import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/**
 * modules — 插件注册表
 *
 * 对应 Odoo ir.module.module。记录所有已安装/已发现的插件元数据。
 * 系统模块 tenant_id = NULL。
 */
export const modules = pgTable(
  "modules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenant_id: uuid("tenant_id"),

    name: varchar("name", { length: 200 }).notNull(),
    version: varchar("version", { length: 50 }).notNull(),
    display_name: varchar("display_name", { length: 255 }).notNull(),

    state: varchar("state", { length: 20 }).notNull().default("discovered"),
    category: varchar("category", { length: 100 }),
    description: text("description"),
    author: varchar("author", { length: 255 }),
    license: varchar("license", { length: 100 }),
    dependencies: jsonb("dependencies").default([]),
    runtime_mode: varchar("runtime_mode", { length: 20 }).notNull().default("inline"),
    runtime_partition: varchar("runtime_partition", { length: 50 }).notNull().default("SYSTEM"),
    auto_install: boolean("auto_install").default(false),
    manifest_path: varchar("manifest_path", { length: 500 }),
    installed_at: timestamp("installed_at", { withTimezone: true }),

    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_modules_name").on(table.name),
    index("idx_modules_tenant").on(table.tenant_id),
    index("idx_modules_state").on(table.state),
  ],
);

export type Module = typeof modules.$inferSelect;
export type NewModule = typeof modules.$inferInsert;
