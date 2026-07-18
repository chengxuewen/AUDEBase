/**
 * Audit module type definitions
 *
 * Phase 1a: AuditEvent input and AuditQuery params.
 * Shared types (AuditLogEntry, AuditActionCategory) come from @audebase/shared-types.
 */

/**
 * Audit event — the input shape for AuditService.log()
 */
export interface AuditEvent {
  tenant_id: string;
  actor_id: string | null;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  ip?: string | null;
  user_agent?: string | null;
  request_id?: string | null;
}

/**
 * Audit query parameters for AuditService.query()
 */
export interface AuditQuery {
  tenant_id?: string;
  action?: string;
  resource_type?: string;
  resource_id?: string;
  actor_id?: string;
  /** Only return entries created before this date (ISO string) */
  beforeDate?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Result from AuditService.purge()
 */
export interface PurgeResult {
  deletedCount: number;
}
