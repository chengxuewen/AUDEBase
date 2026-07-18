import { z } from "zod";

/**
 * 审计日志动作分类
 */
export type AuditActionCategory =
  | "auth" // login, logout, refresh_token, password_change
  | "crud" // create, read, update, delete
  | "lifecycle" // install, uninstall, enable, disable, upgrade
  | "rbac" // assign_role, revoke_role, create_role, delete_role
  | "system"; // startup, shutdown, health_check

/**
 * 审计日志条目
 */
export interface AuditLogEntry {
  id: string;
  tenant_id: string;
  actor: { id: string; username: string } | null; // NULL = 系统操作
  action: string;
  resource_type: string;
  resource_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip: string | null;
  user_agent: string | null;
  request_id: string | null;
  created_at: string;
}

// === Zod Schemas ===

/** 审计动作分类 Zod schema */
export const auditActionCategorySchema = z.enum(["auth", "crud", "lifecycle", "rbac", "system"]);

/** 分页审计日志响应 Zod schema */
export const paginatedAuditLogsSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().uuid(),
      tenant_id: z.string().uuid(),
      actor: z
        .object({
          id: z.string().uuid(),
          username: z.string(),
        })
        .nullable(),
      action: z.string(),
      resource_type: z.string(),
      resource_id: z.string().uuid().nullable(),
      old_values: z.record(z.string(), z.unknown()).nullable(),
      new_values: z.record(z.string(), z.unknown()).nullable(),
      ip: z.string().nullable(),
      user_agent: z.string().nullable(),
      request_id: z.string().nullable(),
      created_at: z.string(),
    }),
  ),
  meta: z.object({
    count: z.number().int().min(0),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(100),
    totalPages: z.number().int().min(0),
  }),
});
