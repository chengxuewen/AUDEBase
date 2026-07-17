import { useQuery } from '@tanstack/react-query'
import { apiGet } from '../../../api/client.js'

export interface Plugin {
  id: string
  name: string
  display_name: string
  version: string
  state: string
  category: string
}

interface PluginsResponse {
  data: Plugin[]
}

export function usePlugins() {
  return useQuery({
    queryKey: ['@audebase/admin-ui', 'plugins'],
    queryFn: () => apiGet<PluginsResponse>('/api/plugins'),
  })
}
