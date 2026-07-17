import { useQuery } from '@tanstack/react-query'
import { apiGet } from '../../../api/client.js'

export interface User {
  id: string
  username: string
  is_active: boolean
  tenant_id: string | null
  created_at: string | null
}

interface UsersResponse {
  data: User[]
  page: number
  pageSize: number
}

export function useUsers() {
  return useQuery({
    queryKey: ['@audebase/admin-ui', 'users'],
    queryFn: () => apiGet<UsersResponse>('/api/users'),
  })
}
