import { pgTable, uuid, varchar, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * audit_log — 审计日志表
 *
 * API 写操作自动记录。复合索引支持按资源查询审计历史。
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenant_id: uuid("tenant_id").notNull(),

    actor_id: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 100 }).notNull(),
    resource_type: varchar("resource_type", { length: 200 }).notNull(),
    resource_id: uuid("resource_id"),

    old_values: jsonb("old_values"),
    new_values: jsonb("new_values"),

    ip: varchar("ip", { length: 50 }),
    user_agent: varchar("user_agent", { length: 500 }),
    request_id: varchar("request_id", { length: 100 }),

    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_audit_log_tenant").on(table.tenant_id),
    index("idx_audit_log_resource").on(table.tenant_id, table.resource_type, table.resource_id),
    index("idx_audit_log_actor").on(table.tenant_id, table.actor_id),
    index("idx_audit_log_action").on(table.action),
    index("idx_audit_log_created").on(table.created_at.desc()),
  ],
);

export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
