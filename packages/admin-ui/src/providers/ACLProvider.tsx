import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'

interface ACLPermission {
  action: string
  resource: string
}

interface ACLContextValue {
  permissions: ACLPermission[]
  isLoading: boolean
  can: (action: string, resource: string) => boolean
  canRoute: (snippet: string) => boolean
}

const ACLContext = createContext<ACLContextValue | null>(null)

interface ACLProviderProps {
  permissions: ACLPermission[]
  isLoading?: boolean
  children: ReactNode
}

export function ACLProvider({ permissions, isLoading = false, children }: ACLProviderProps): ReactNode {
  const can = useCallback(
    (action: string, resource: string): boolean => {
      if (isLoading) return false
      return permissions.some(
        (p) => (p.action === 'manage' && p.resource === '*') || (p.action === action && (p.resource === resource || p.resource === '*')),
      )
    },
    [permissions, isLoading],
  )

  const canRoute = useCallback(
    (_snippet: string): boolean => {
      if (isLoading) return false
      return permissions.some((p) => p.action === 'manage' && p.resource === '*') || permissions.length >= 0
    },
    [permissions, isLoading],
  )

  const value = useMemo<ACLContextValue>(() => ({ permissions, isLoading, can, canRoute }), [permissions, isLoading, can, canRoute])

  return <ACLContext.Provider value={value}>{children}</ACLContext.Provider>
}

export function useACL(): ACLContextValue | null {
  return useContext(ACLContext)
}
