/**
 * Audit log input types
 *
 * @audebase/audit
 */

import type { ListQueryParams } from '@audebase/shared-types'

/**
 * Input for recording an audit event.
 * `tenant_id` is null for system-level operations.
 */
export interface AuditLogInput {
  tenant_id: string | null
  actor_id: string | null
  action: string
  resource_type: string
  resource_id: string | null
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  ip: string | null
  user_agent: string | null
  request_id: string | null
}

/**
 * Query parameters for audit log retrieval.
 * `tenant_id` is required for tenant isolation enforcement.
 */
export interface AuditLogQueryParams extends ListQueryParams {
  tenant_id: string | null
  filter?: {
    action?: string | { $in: string[] }
    resource_type?: string
    resource_id?: string
    actor_id?: string
    created_at?: {
      $gte?: string
      $lte?: string
    }
  }
}
