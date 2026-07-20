/**
 * 审计日志类型
 *
 * @audebase/shared-types
 */

/**
 * 审计日志动作分类
 */
export type AuditActionCategory =
  | 'auth'
  | 'crud'
  | 'lifecycle'
  | 'rbac'
  | 'system'

export interface AuditLogEntry {
  id: string
  tenant_id: string
  actor: { id: string; username: string } | null
  action: string
  resource_type: string
  resource_id: string | null
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  ip: string | null
  user_agent: string | null
  request_id: string | null
  created_at: string
}
