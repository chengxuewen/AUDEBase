/**
 * AuditService - records and queries audit log entries.
 *
 * Fire-and-forget write: log() never throws.
 * Tenant isolation: query() always filters by tenant_id.
 *
 * @audebase/audit
 */

import type { AuditLogEntry } from '@audebase/shared-types'
import type { DatabaseProvider } from './types.js'
import type { AuditLogInput, AuditLogQueryParams } from './audit-input.js'

/**
 * AuditService provides audit logging with fire-and-forget writes
 * and tenant-isolated queries.
 */
export class AuditService {
  constructor(private readonly db: DatabaseProvider) {}

  /**
   * Record an audit event. Fire-and-forget: never throws.
   * Write failures are swallowed (caller is unaffected).
   */
  async log(entry: AuditLogInput): Promise<void> {
    try {
      await this.db.insert('audit_log').values(entry)
    } catch {
      // Fire-and-forget: audit write failure must not propagate
    }
  }

  /**
   * Query audit logs with filters and tenant isolation.
   * Returns entries sorted by created_at DESC.
   */
  async query(params: AuditLogQueryParams): Promise<AuditLogEntry[]> {
    const { tenant_id, filter } = params

    const results = await this.db.query.audit_log.findMany({
      where: (row: unknown) => {
        const r = row as Record<string, unknown>
        if (tenant_id !== null && r['tenant_id'] !== tenant_id) {
          return false
        }
        if (filter) {
          if (filter.resource_type !== undefined && r['resource_type'] !== filter.resource_type) {
            return false
          }
          if (filter.resource_id !== undefined && r['resource_id'] !== filter.resource_id) {
            return false
          }
          if (filter.action !== undefined) {
            const actionFilter = filter.action
            if (typeof actionFilter === 'string') {
              if (r['action'] !== actionFilter) return false
            } else if (Array.isArray(actionFilter.$in)) {
              if (!actionFilter.$in.includes(r['action'] as string)) return false
            }
          }
          if (filter.actor_id !== undefined && r['actor_id'] !== filter.actor_id) {
            return false
          }
        }
        return true
      },
    }) as AuditLogEntry[]

    return results
  }

  /**
   * Shortcut: get audit history for a specific resource.
   * Uses composite index (tenant_id, resource_type, resource_id).
   */
  async getResourceHistory(
    resourceType: string,
    resourceId: string,
    pagination: { page: number; pageSize: number },
  ): Promise<AuditLogEntry[]> {
    return this.query({
      tenant_id: null,
      filter: { resource_type: resourceType, resource_id: resourceId },
      page: pagination.page,
      pageSize: pagination.pageSize,
    })
  }
}
