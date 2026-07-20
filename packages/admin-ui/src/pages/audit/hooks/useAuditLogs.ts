import { useQuery } from '@tanstack/react-query'
import { apiGet } from '../../../api/client.js'

export interface AuditLog {
  id: string
  tenant_id: string | null
  actor_id: string
  action: string
  resource_type: string
  resource_id: string
  old_values: unknown
  new_values: unknown
  ip: string
  user_agent: string
  created_at: string
}

interface AuditLogResponse {
  data: AuditLog[]
  page: number
  pageSize: number
}

export function useAuditLogs() {
  return useQuery({
    queryKey: ['@audebase/admin-ui', 'audit-logs'],
    queryFn: () => apiGet<AuditLogResponse>('/api/audit-log'),
  })
}
