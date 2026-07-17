import { useQuery } from '@tanstack/react-query'

export interface ExtensionField {
  name: string
  type: string
}

export interface Extension {
  collection: string
  pluginName: string
  fields: ExtensionField[]
}

// ponytail: mock returns empty array - backend endpoint comes in Phase 1b
async function fetchExtensions(): Promise<Extension[]> {
  return []
}

export function useExtensions() {
  return useQuery({
    queryKey: ['@audebase/admin-ui', 'extensions'],
    queryFn: fetchExtensions,
  })
}
