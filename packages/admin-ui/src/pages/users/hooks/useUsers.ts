import { useQuery } from '@tanstack/react-query'

interface User {
  id: string
  username: string
  is_active: boolean
  tenant_id: string | null
  created_at: string
}

interface PaginatedResponse<T> {
  data: T[]
  meta: { count: number; page: number; pageSize: number; totalPages: number }
}

export function useUsers() {
  return useQuery({
    queryKey: ['@audebase/admin-ui', 'users'],
    queryFn: async (): Promise<PaginatedResponse<User>> => {
      return {
        data: [],
        meta: { count: 0, page: 1, pageSize: 20, totalPages: 0 },
      }
    },
  })
}
