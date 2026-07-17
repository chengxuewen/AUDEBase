import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Spin } from 'antd'
import { apiGet, getTenantId, setTenantId } from '../api/client.js'

interface TenantInfo {
  id: string
  name: string
}

interface TenantContextValue {
  tenantId: string
  availableTenants: TenantInfo[]
  switchTenant: (tenantId: string) => void
}

interface TenantsResponse {
  data: TenantInfo[]
}

const TenantContext = createContext<TenantContextValue | null>(null)

export function TenantProvider({ children }: { children: ReactNode }): ReactNode {
  const { data, isLoading } = useQuery({
    queryKey: ['@audebase/admin-ui', 'tenants'],
    queryFn: () => apiGet<TenantsResponse>('/api/tenants'),
  })

  const tenantId = getTenantId()
  const availableTenants = data?.data ?? []

  const value = useMemo<TenantContextValue>(() => ({
    tenantId,
    availableTenants,
    switchTenant: (newTenantId: string): void => {
      setTenantId(newTenantId)
      // D24: full page reload to clear all state
      window.location.href = '/'
    },
  }), [tenantId, availableTenants])

  if (isLoading && availableTenants.length === 0) {
    return <Spin />
  }

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
}

export function useTenant(): TenantContextValue | null {
  return useContext(TenantContext)
}
