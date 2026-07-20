/**
 * @audebase/api-versioning - ApiVersionRouter
 *
 * D1.8: URL path versioning. Pure routing utility — Core wires it to Fastify.
 *
 * URL pattern: /api/v{major}/{resource}
 * No version in URL -> resolve to latest registered major version.
 */

import type { RouteHandler, ResolvedRoute, VersionedRoute } from './types.js'

/** Route key: `${METHOD}:${path}` for dedup within a version */
function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()}:${path}`
}

/** Parse a URL path into { major, resource } or null if no version segment */
function parseVersionFromUrl(fullPath: string): { major: number; resource: string } | null {
  // Expect /api/v{N}/... or /api/...
  // Strip leading /api/ prefix
  const apiPrefix = '/api/'
  if (!fullPath.startsWith(apiPrefix)) {
    return null
  }
  const rest = fullPath.slice(apiPrefix.length)

  // Try to match v{number}
  const match = rest.match(/^v(\d+)\/(.*)$/)
  if (match !== null) {
    const major = parseInt(match[1]!, 10)
    const resource = '/' + match[2]!
    return { major, resource }
  }

  // Match v{number} with no trailing path (e.g. /api/v1)
  const matchNoPath = rest.match(/^v(\d+)$/)
  if (matchNoPath !== null) {
    const major = parseInt(matchNoPath[1]!, 10)
    return { major, resource: '/' }
  }

  return null
}

/**
 * Check if a registered route path matches a requested path.
 * Supports simple `:param` segments (e.g. /users/:id matches /users/123).
 */
function pathMatches(routePath: string, requestPath: string): boolean {
  const routeSegments = routePath.split('/').filter((s) => s.length > 0)
  const requestSegments = requestPath.split('/').filter((s) => s.length > 0)

  if (routeSegments.length !== requestSegments.length) {
    return false
  }

  for (let i = 0; i < routeSegments.length; i++) {
    const routeSeg = routeSegments[i]!
    const requestSeg = requestSegments[i]!
    if (routeSeg.startsWith(':')) {
      // Param segment — matches any non-empty value
      continue
    }
    if (routeSeg !== requestSeg) {
      return false
    }
  }
  return true
}

export class ApiVersionRouter {
  /** Registered major versions -> VersionInfo */
  private readonly versions = new Map<number, { status: 'active' | 'deprecated'; sunsetDate?: string; migrationTarget?: string }>()

  /** Routes: version -> routeKey -> VersionedRoute */
  private readonly routes = new Map<number, Map<string, VersionedRoute>>()

  /**
   * Register an API major version. Idempotent — re-registering is a no-op.
   */
  registerVersion(major: number): void {
    if (major < 1) {
      throw new Error(`Invalid API version: ${major}. Must be a positive integer.`)
    }
    if (!this.versions.has(major)) {
      this.versions.set(major, { status: 'active' })
    }
  }

  /**
   * Register a route under a specific version.
   * @throws if the version has not been registered via registerVersion()
   */
  registerRoute(
    version: number,
    method: string,
    path: string,
    handler: RouteHandler,
  ): void {
    if (!this.versions.has(version)) {
      throw new Error(
        `Cannot register route: version ${version} is not registered. Call registerVersion(${version}) first.`,
      )
    }
    let versionRoutes = this.routes.get(version)
    if (versionRoutes === undefined) {
      versionRoutes = new Map()
      this.routes.set(version, versionRoutes)
    }
    const key = routeKey(method, path)
    versionRoutes.set(key, {
      major: version,
      method: method.toUpperCase(),
      path,
      handler,
      deprecated: false,
    })
  }

  /**
   * Resolve a URL to a registered route.
   * URL pattern: /api/v{major}/{resource} or /api/{resource} (uses default/latest).
   * Returns null if no match (version not found, path not found, method mismatch).
   */
  resolveRoute(method: string, fullPath: string): ResolvedRoute | null {
    const parsed = parseVersionFromUrl(fullPath)
    let major: number
    let resource: string

    if (parsed !== null) {
      major = parsed.major
      resource = parsed.resource
    } else {
      // No version in URL — use default (latest)
      const defaultVersion = this.getDefaultVersion()
      if (defaultVersion === 0) {
        return null
      }
      major = defaultVersion
      // Strip /api/ prefix for resource path
      const apiPrefix = '/api/'
      if (fullPath.startsWith(apiPrefix)) {
        resource = '/' + fullPath.slice(apiPrefix.length)
      } else {
        resource = fullPath
      }
    }

    // Check version exists
    if (!this.versions.has(major)) {
      return null
    }

    const versionRoutes = this.routes.get(major)
    if (versionRoutes === undefined) {
      return null
    }

    const upperMethod = method.toUpperCase()
    for (const route of versionRoutes.values()) {
      if (route.method === upperMethod && pathMatches(route.path, resource)) {
        return {
          version: route.major,
          handler: route.handler,
          path: route.path,
          deprecated: route.deprecated,
          ...(route.sunsetDate !== undefined ? { sunsetDate: route.sunsetDate } : {}),
        }
      }
    }

    return null
  }

  /** List all registered major versions, sorted ascending */
  getVersions(): number[] {
    return Array.from(this.versions.keys()).sort((a, b) => a - b)
  }

  /** List routes, optionally filtered by version */
  getRoutes(version?: number): VersionedRoute[] {
    if (version !== undefined) {
      const versionRoutes = this.routes.get(version)
      if (versionRoutes === undefined) {
        return []
      }
      return Array.from(versionRoutes.values())
    }
    const all: VersionedRoute[] = []
    for (const versionRoutes of this.routes.values()) {
      all.push(...versionRoutes.values())
    }
    return all
  }

  /** Mark a route as deprecated, optionally with a sunset date */
  markDeprecated(version: number, method: string, path: string, sunsetDate?: Date): void {
    const versionRoutes = this.routes.get(version)
    if (versionRoutes === undefined) {
      return
    }
    const key = routeKey(method, path)
    const existing = versionRoutes.get(key)
    if (existing === undefined) {
      return
    }
    const updated: VersionedRoute = {
      major: existing.major,
      method: existing.method,
      path: existing.path,
      handler: existing.handler,
      deprecated: true,
      ...(sunsetDate !== undefined ? { sunsetDate } : {}),
    }
    versionRoutes.set(key, updated)
  }

  /** Check if a route is marked as deprecated */
  isDeprecated(version: number, method: string, path: string): boolean {
    const versionRoutes = this.routes.get(version)
    if (versionRoutes === undefined) {
      return false
    }
    const route = versionRoutes.get(routeKey(method, path))
    if (route === undefined) {
      return false
    }
    return route.deprecated
  }

  /** Get the latest registered major version, or 0 if none registered */
  getDefaultVersion(): number {
    const versions = this.getVersions()
    if (versions.length === 0) {
      return 0
    }
    return versions[versions.length - 1]!
  }
}
