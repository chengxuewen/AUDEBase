import { useQuery } from '@tanstack/react-query'

interface Plugin {
  id: string
  name: string
  display_name: string
  version: string
  status: string
  category: string
}

interface PaginatedResponse<T> {
  data: T[]
  meta: { count: number; page: number; pageSize: number; totalPages: number }
}

export function usePlugins() {
  return useQuery({
    queryKey: ['@audebase/admin-ui', 'plugins'],
    queryFn: async (): Promise<PaginatedResponse<Plugin>> => {
      return {
        data: [],
        meta: { count: 0, page: 1, pageSize: 20, totalPages: 0 },
      }
    },
  })
}
