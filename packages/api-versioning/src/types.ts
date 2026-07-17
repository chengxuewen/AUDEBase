/**
 * @audebase/api-versioning - Local types
 *
 * D1.8: URL path versioning (/api/v{major}/{resource})
 */

/** HTTP methods supported by the versioned router */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** Route handler signature — pure utility, no Fastify coupling */
export type RouteHandler = (req: unknown, reply: unknown) => Promise<unknown>

/** A route registered under a specific API major version */
export interface VersionedRoute {
  readonly major: number
  readonly method: string
  readonly path: string
  readonly handler: RouteHandler
  readonly deprecated: boolean
  readonly sunsetDate?: Date
}

/** Result of resolving a URL to a registered route */
export interface ResolvedRoute {
  readonly version: number
  readonly handler: RouteHandler
  readonly path: string
  readonly deprecated: boolean
  readonly sunsetDate?: Date
}

/** SemVer version info for a registered API version */
export interface VersionInfo {
  readonly version: string
  readonly status: 'active' | 'deprecated'
  readonly sunsetDate?: string
  readonly migrationTarget?: string
}
