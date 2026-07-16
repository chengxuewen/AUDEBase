/**
 * Fastify middleware: requireAuth + aclMiddleware
 *
 * @audebase/rbac
 */

import { ErrorCode, UserError } from '@audebase/shared-types'
import type { PermissionAction } from '@audebase/shared-types'

/** AuthService-like interface for middleware DI */
interface AuthVerifier {
  verifyAccessToken(token: string): Promise<unknown>
}

/** RBACService-like interface for middleware DI */
interface PermissionChecker {
  can(userId: string, action: PermissionAction, resource: string): Promise<boolean>
}

/** Minimal request shape */
interface MiddlewareRequest {
  headers: { authorization?: string }
  routeConfig?: { acl?: { action: PermissionAction; resource: string } }
  user?: { sub?: string; tenant_id?: string | null; username?: string; roles?: string[] }
}

/** Minimal reply shape */
interface MiddlewareReply {
  code(status: number): MiddlewareReply
  send(body: unknown): void
}

/** Next function */
type NextFunction = () => void

/**
 * requireAuth - Extract Bearer token, verify, inject req.user.
 * @throws 401 via reply if no token or invalid token
 */
export async function requireAuth(
  request: MiddlewareRequest,
  reply: MiddlewareReply,
  authService: AuthVerifier,
): Promise<void> {
  const authHeader = request.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.code(401).send({
      error: { code: ErrorCode.AUTH_REQUIRED, message: 'Authentication required' },
    })
    return
  }

  const token = authHeader.slice(7)
  try {
    const payload = await authService.verifyAccessToken(token)
    request.user = payload as { sub: string; tenant_id: string | null; username: string; roles: string[] }
  } catch {
    reply.code(401).send({
      error: { code: ErrorCode.AUTH_TOKEN_INVALID, message: 'Invalid token' },
    })
  }
}

/**
 * aclMiddleware - Check ACL based on routeConfig.acl.
 * Requires request to have already passed requireAuth (or have user set).
 *
 * Call with: aclMiddleware(request, reply, authService, rbacService, next?)
 */
export async function aclMiddleware(
  request: MiddlewareRequest,
  reply: MiddlewareReply,
  authService: AuthVerifier,
  rbacService: PermissionChecker,
  next?: NextFunction,
): Promise<void> {
  // Check auth first
  const authHeader = request.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.code(401).send({
      error: { code: ErrorCode.AUTH_REQUIRED, message: 'Authentication required' },
    })
    return
  }

  const token = authHeader.slice(7)

  // Verify token (unless user is already set from requireAuth)
  let userId: string
  if (request.user?.sub) {
    userId = request.user.sub
  } else {
    try {
      const payload = (await authService.verifyAccessToken(token)) as {
        sub: string
        tenant_id: string | null
        username: string
      }
      request.user = payload
      userId = payload.sub
    } catch (err) {
      // Handle both UserError instances and plain objects with code property (mock rejection)
      const errObj = err as { code?: string; message?: string }
      const code =
        (err instanceof UserError && err.code === ErrorCode.AUTH_TOKEN_EXPIRED) ||
        errObj?.code === ErrorCode.AUTH_TOKEN_EXPIRED
          ? ErrorCode.AUTH_TOKEN_EXPIRED
          : ErrorCode.AUTH_TOKEN_INVALID
      reply.code(401).send({
        error: { code, message: err instanceof Error ? err.message : 'Token error' },
      })
      return
    }
  }

  // Check ACL
  const acl = request.routeConfig?.acl
  if (!acl) {
    // No ACL configured = public route
    if (next) next()
    return
  }

  const hasPermission = await rbacService.can(userId, acl.action, acl.resource)
  if (!hasPermission) {
    reply.code(403).send({
      error: { code: ErrorCode.FORBIDDEN, message: 'Permission denied' },
    })
    return
  }

  if (next) next()
}
