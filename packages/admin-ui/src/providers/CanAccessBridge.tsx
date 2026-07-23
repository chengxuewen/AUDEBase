import { type ReactNode } from 'react'
import { useACL } from './ACLProvider.js'

interface CanAccessBridgeProps {
  resource: string
  action: string
  children: ReactNode
  fallback?: ReactNode
}

/**
 * Refine-compatible permission guard that bridges to AUDEBase's useACL system.
 * 
 * Usage:
 *   <CanAccessBridge resource="print_jobs" action="create">
 *     <Button type="primary">新建任务</Button>
 *   </CanAccessBridge>
 */
export function CanAccessBridge({ resource, action, children, fallback = null }: CanAccessBridgeProps): ReactNode {
  const acl = useACL()

  if (!acl) return fallback

  return acl.can(action, resource) ? children : fallback
}
