import { pgTable, uuid, timestamp, primaryKey, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { roles } from "./roles";

/**
 * user_roles — 用户↔角色关联表
 *
 * 多对多关联，PK 为 (user_id, role_id)。
 */
export const userRoles = pgTable(
  "user_roles",
  {
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role_id: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    tenant_id: uuid("tenant_id").notNull(),

    assigned_at: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    assigned_by: uuid("assigned_by"),
  },
  (table) => [
    primaryKey({ columns: [table.user_id, table.role_id] }),
    index("idx_user_roles_role").on(table.role_id),
    index("idx_user_roles_tenant").on(table.tenant_id),
  ],
);

export type UserRole = typeof userRoles.$inferSelect;
export type NewUserRole = typeof userRoles.$inferInsert;
