import { useQuery } from '@tanstack/react-query'

interface Role {
  id: string
  name: string
  display_name: string
  permissions: unknown[]
  user_count: number
}

interface PaginatedResponse<T> {
  data: T[]
  meta: { count: number; page: number; pageSize: number; totalPages: number }
}

export function useRoles() {
  return useQuery({
    queryKey: ['@audebase/admin-ui', 'roles'],
    queryFn: async (): Promise<PaginatedResponse<Role>> => {
      return {
        data: [],
        meta: { count: 0, page: 1, pageSize: 20, totalPages: 0 },
      }
    },
  })
}
