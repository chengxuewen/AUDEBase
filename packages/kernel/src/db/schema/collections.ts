import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  uniqueIndex,
  index,
  foreignKey,
} from "drizzle-orm/pg-core";
import { modules } from "./modules";

/**
 * collections — 数据模型注册表
 *
 * 对应 Odoo ir.model。记录所有插件声明的 Collection。
 */
export const collections = pgTable(
  "collections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenant_id: uuid("tenant_id"),
    module_id: uuid("module_id")
      .notNull()
      .references(() => modules.id, { onDelete: "cascade" }),

    name: varchar("name", { length: 200 }).notNull(),
    table_name: varchar("table_name", { length: 200 }).notNull(),
    display_name: varchar("display_name", { length: 255 }).notNull(),
    description: text("description"),

    extends_collection_id: uuid("extends_collection_id"),
    is_system: boolean("is_system").default(false),

    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_collections_name_tenant").on(table.name, table.tenant_id),
    uniqueIndex("uq_collections_table").on(table.table_name),
    index("idx_collections_module").on(table.module_id),
    index("idx_collections_tenant").on(table.tenant_id),
    foreignKey({
      columns: [table.extends_collection_id],
      foreignColumns: [table.id],
      name: "fk_collections_extends",
    }),
  ],
);

export type Collection = typeof collections.$inferSelect;
export type NewCollection = typeof collections.$inferInsert;
