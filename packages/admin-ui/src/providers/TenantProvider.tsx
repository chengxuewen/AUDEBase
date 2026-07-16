import { createContext, useContext, type ReactNode } from 'react'

interface TenantInfo {
  id: string
  name: string
}

interface TenantContextValue {
  tenantId: string | null
  availableTenants: TenantInfo[]
  onSwitchTenant?: (tenantId: string) => void
}

const TenantContext = createContext<TenantContextValue | null>(null)

interface TenantProviderProps {
  tenantId: string | null
  availableTenants?: TenantInfo[]
  onSwitchTenant?: (tenantId: string) => void
  children: ReactNode
}

export function TenantProvider({ tenantId, availableTenants = [], onSwitchTenant, children }: TenantProviderProps): ReactNode {
  const value: TenantContextValue = { tenantId, availableTenants, ...(onSwitchTenant !== undefined ? { onSwitchTenant } : {}) }
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
}

export function useTenant(): TenantContextValue | null {
  return useContext(TenantContext)
}
