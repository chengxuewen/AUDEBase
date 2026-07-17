import { useQuery } from '@tanstack/react-query'
import { apiGet } from '../../../api/client.js'

export interface ExtensionField {
  name: string
  type: string
}

export interface Extension {
  collection: string
  pluginName: string
  fields: ExtensionField[]
}

export function useExtensions() {
  return useQuery({
    queryKey: ['@audebase/admin-ui', 'extensions'],
    queryFn: () => apiGet<Extension[]>('/api/extensions'),
  })
}
