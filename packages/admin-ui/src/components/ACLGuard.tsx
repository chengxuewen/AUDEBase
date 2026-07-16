import type { ReactElement, ReactNode } from 'react'

interface ACLGuardProps {
  action: string
  resource: string
  can?: boolean
  isLoading?: boolean
  fallback?: ReactElement
  children: ReactNode
}

export function ACLGuard({ can = true, isLoading = false, fallback, children }: ACLGuardProps): ReactNode {
  if (isLoading) {
    return null
  }

  if (!can) {
    return fallback ?? null
  }

  return <>{children}</>
}
