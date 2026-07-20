import { useQuery } from '@tanstack/react-query'
import { apiGet } from '../../../api/client.js'

export interface Role {
  id: string
  name: string
  slug: string
  description: string | null
  is_system: boolean
}

interface RolesResponse {
  data: Role[]
  page: number
  pageSize: number
}

export function useRoles() {
  return useQuery({
    queryKey: ['@audebase/admin-ui', 'roles'],
    queryFn: () => apiGet<RolesResponse>('/api/roles'),
  })
}
