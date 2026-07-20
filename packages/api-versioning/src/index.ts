/**
 * @audebase/api-versioning - Public API
 *
 * D1.8: URL path versioning for AUDEBase API routes.
 * Pure routing utility - Core wires it to Fastify.
 */

export { ApiVersionRouter } from './api-version-router.js'
export type {
  HttpMethod,
  RouteHandler,
  VersionedRoute,
  ResolvedRoute,
  VersionInfo,
} from './types.js'
