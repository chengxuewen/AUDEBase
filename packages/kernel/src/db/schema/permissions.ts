import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  uniqueIndex,
  index,
  foreignKey,
} from "drizzle-orm/pg-core";
import { modules } from "./modules";

/**
 * permissions — RBAC 权限项表
 *
 * 每个权限项描述一个 action + resource 组合。
 * 系统权限 tenant_id = NULL。
 */
export const permissions = pgTable(
  "permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenant_id: uuid("tenant_id"),

    action: varchar("action", { length: 100 }).notNull(),
    resource: varchar("resource", { length: 200 }).notNull(),
    display_name: varchar("display_name", { length: 255 }).notNull(),
    module_id: uuid("module_id"),

    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_permissions_action_resource").on(table.action, table.resource),
    index("idx_permissions_resource").on(table.resource),
    foreignKey({
      columns: [table.module_id],
      foreignColumns: [modules.id],
      name: "fk_permissions_module",
    }),
  ],
);

export type Permission = typeof permissions.$inferSelect;
export type NewPermission = typeof permissions.$inferInsert;
