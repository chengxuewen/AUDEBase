/**
 * Audit middleware - auto-records write operations (POST/PUT/PATCH/DELETE).
 *
 * Non-blocking: audit write failures never throw.
 * Sensitive fields are redacted from new_values.
 *
 * @audebase/audit
 */

import type { AuditLogInput } from './audit-input.js'

/** Interface for the audit service dependency (structural typing) */
interface AuditLogger {
  log(entry: AuditLogInput): Promise<void>
}

/** Minimal request shape needed by the middleware */
interface AuditRequest {
  method: string
  url: string
  body?: unknown
  user?: { id?: string; tenant_id?: string | null } | null
  headers: Record<string, string | string[] | undefined>
  ip?: string
}

/** Minimal reply shape */
interface AuditReply {
  statusCode: number
}

/** Options for createAuditMiddleware */
interface AuditMiddlewareOptions {
  auditService: AuditLogger
  sensitiveFields?: string[]
}

const DEFAULT_SENSITIVE_FIELDS = [
  'password',
  'password_hash',
  'token',
  'access_token',
  'refresh_token',
  'token_version',
  'secret',
  'api_key',
]

/** HTTP method -> audit action mapping */
function methodToAction(method: string): string | null {
  switch (method) {
    case 'POST':
      return 'create'
    case 'PUT':
    case 'PATCH':
      return 'update'
    case 'DELETE':
      return 'delete'
    default:
      return null
  }
}

/**
 * Extract resource_type from URL path.
 * `/api/users` -> `user`, `/api/users/uuid-1` -> `user`
 */
function extractResourceType(url: string): string {
  const segments = url.split('/').filter(Boolean)
  // Expect /api/{resource}[/{id}]
  if (segments.length >= 2 && segments[0] === 'api') {
    const plural = segments[1] ?? ''
    // Simple singularization: strip trailing 's'
    return plural.endsWith('s') ? plural.slice(0, -1) : plural
  }
  return segments[0] ?? 'unknown'
}

/**
 * Extract resource_id from URL path.
 * `/api/users/uuid-1` -> `uuid-1`
 */
function extractResourceId(url: string): string | null {
  const segments = url.split('/').filter(Boolean)
  if (segments.length >= 3 && segments[0] === 'api') {
    return segments[2] ?? null
  }
  return null
}

/**
 * Redact sensitive fields from a body object (immutable - returns new object).
 */
function sanitizeBody(
  body: Record<string, unknown>,
  sensitiveFields: string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(body)) {
    result[key] = sensitiveFields.includes(key) ? '[REDACTED]' : body[key]
  }
  return result
}

/**
 * Create an audit middleware function.
 *
 * Usage:
 *   const middleware = createAuditMiddleware({ auditService })
 *   fastify.addHook('onSend', middleware)
 *
 * Only records POST/PUT/PATCH/DELETE with 2xx response status.
 * Never throws - audit failures are silently swallowed.
 */
export function createAuditMiddleware(options: AuditMiddlewareOptions): {
  (request: AuditRequest, reply: AuditReply): Promise<void>
} {
  const { auditService } = options
  const sensitiveFields = options.sensitiveFields ?? DEFAULT_SENSITIVE_FIELDS

  return async (request: AuditRequest, reply: AuditReply): Promise<void> => {
    const action = methodToAction(request.method)
    if (action === null) return

    // Only audit successful operations (2xx)
    if (reply.statusCode < 200 || reply.statusCode >= 300) return

    const user = request.user ?? null
    const body =
      request.body && typeof request.body === 'object'
        ? sanitizeBody(request.body as Record<string, unknown>, sensitiveFields)
        : null

    const headerVal = (key: string): string | null => {
      const v = request.headers[key]
      return typeof v === 'string' ? v : null
    }

    const entry: AuditLogInput = {
      tenant_id: user?.tenant_id ?? null,
      actor_id: user?.id ?? null,
      action,
      resource_type: extractResourceType(request.url),
      resource_id: extractResourceId(request.url),
      old_values: null,
      new_values: body,
      ip: request.ip ?? null,
      user_agent: headerVal('user-agent'),
      request_id: headerVal('x-request-id'),
    }

    try {
      await auditService.log(entry)
    } catch {
      // Non-blocking: audit failure must not propagate
    }
  }
}
