import { useQuery } from '@tanstack/react-query'

interface AuditLog {
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

interface PaginatedResponse<T> {
  data: T[]
  meta: { count: number; page: number; pageSize: number; totalPages: number }
}

export function useAuditLogs() {
  return useQuery({
    queryKey: ['@audebase/admin-ui', 'audit-logs'],
    queryFn: async (): Promise<PaginatedResponse<AuditLog>> => {
      return {
        data: [],
        meta: { count: 0, page: 1, pageSize: 20, totalPages: 0 },
      }
    },
  })
}
