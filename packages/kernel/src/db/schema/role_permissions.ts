import { pgTable, uuid, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { roles } from "./roles";
import { permissions } from "./permissions";

/**
 * role_permissions — 角色↔权限关联表
 *
 * 多对多关联，PK 为 (role_id, permission_id)。
 */
export const rolePermissions = pgTable(
  "role_permissions",
  {
    role_id: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permission_id: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
    tenant_id: uuid("tenant_id"),

    assigned_at: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.role_id, table.permission_id] })],
);

export type RolePermission = typeof rolePermissions.$inferSelect;
export type NewRolePermission = typeof rolePermissions.$inferInsert;
