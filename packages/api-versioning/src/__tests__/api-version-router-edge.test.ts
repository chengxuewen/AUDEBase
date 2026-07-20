/**
 * @audebase/api-versioning - Edge case and boundary tests (AAA pattern)
 *
 * Supplementary tests for ApiVersionRouter covering:
 * - Route key collision within same version
 * - Empty router behavior
 * - Non-/api/ prefix URLs
 * - URL with version but no trailing path
 * - Multiple path parameters
 * - Version info (active/deprecated status chain)
 * - getRoutes filtering edge cases
 * - Deprecation chain (mark → isDeprecated → resolve still works)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { ApiVersionRouter } from '../index.js'
import type { RouteHandler } from '../index.js'

const ok: RouteHandler = async () => ({ status: 'ok' })

describe('ApiVersionRouter — edge cases', () => {
  let router: ApiVersionRouter

  beforeEach(() => {
    router = new ApiVersionRouter()
  })

  // ─── Route key collision ────────────────────────────────

  describe('route key collision', () => {
    it('should overwrite an existing route with the same method+path in a version', () => {
      // Arrange
      router.registerVersion(1)
      const handler1: RouteHandler = async () => ({ v: 1 })
      const handler2: RouteHandler = async () => ({ v: 2 })
      router.registerRoute(1, 'GET', '/users', handler1)

      // Act
      router.registerRoute(1, 'GET', '/users', handler2)
      const resolved = router.resolveRoute('GET', '/api/v1/users')

      // Assert
      expect(resolved).not.toBeNull()
      expect(resolved!.handler).toBe(handler2)
    })

    it('should NOT collide when method differs but path is same', () => {
      // Arrange
      router.registerVersion(1)
      const getHandler: RouteHandler = async () => ({ method: 'GET' })
      const postHandler: RouteHandler = async () => ({ method: 'POST' })
      router.registerRoute(1, 'GET', '/users', getHandler)
      router.registerRoute(1, 'POST', '/users', postHandler)

      // Act
      const getResolved = router.resolveRoute('GET', '/api/v1/users')
      const postResolved = router.resolveRoute('POST', '/api/v1/users')

      // Assert
      expect(getResolved!.handler).toBe(getHandler)
      expect(postResolved!.handler).toBe(postHandler)
    })

    it('should normalize method case on collision (lowercase to uppercase)', () => {
      // Arrange
      router.registerVersion(1)
      const handler1: RouteHandler = async () => ({ first: true })
      const handler2: RouteHandler = async () => ({ second: true })
      router.registerRoute(1, 'get', '/items', handler1)

      // Act
      router.registerRoute(1, 'GET', '/items', handler2)
      const resolved = router.resolveRoute('GET', '/api/v1/items')

      // Assert
      expect(resolved!.handler).toBe(handler2)
    })
  })

  // ─── Empty / uninitialized router ───────────────────────

  describe('empty router', () => {
    it('should return 0 as default version when no versions registered', () => {
      // Arrange & Act
      const dv = router.getDefaultVersion()

      // Assert
      expect(dv).toBe(0)
    })

    it('should return empty array for getVersions when empty', () => {
      // Arrange & Act
      const versions = router.getVersions()

      // Assert
      expect(versions).toEqual([])
    })

    it('should return null when resolving without any versions', () => {
      // Arrange & Act
      const resolved = router.resolveRoute('GET', '/api/v1/users')

      // Assert
      expect(resolved).toBeNull()
    })

    it('should return empty array for getRoutes with no arguments', () => {
      // Arrange & Act
      const routes = router.getRoutes()

      // Assert
      expect(routes).toEqual([])
    })

    it('should return false for isDeprecated with no routes', () => {
      // Arrange & Act
      const deprecated = router.isDeprecated(1, 'GET', '/users')

      // Assert
      expect(deprecated).toBe(false)
    })
  })

  // ─── Non-/api/ prefix URLs ──────────────────────────────

  describe('non-/api/ prefix URLs', () => {
    it('should return null for URLs without /api/ prefix', () => {
      // Arrange
      router.registerVersion(1)
      router.registerRoute(1, 'GET', '/users', ok)

      // Act
      const resolved = router.resolveRoute('GET', '/other/v1/users')

      // Assert
      expect(resolved).toBeNull()
    })
  })

  // ─── URL with version but no trailing path ──────────────

  describe('URL with version but no trailing path', () => {
    it('should resolve /api/v1 to the / route if registered', () => {
      // Arrange
      router.registerVersion(1)
      router.registerRoute(1, 'GET', '/', ok)

      // Act
      const resolved = router.resolveRoute('GET', '/api/v1')

      // Assert
      expect(resolved).not.toBeNull()
      expect(resolved!.version).toBe(1)
      expect(resolved!.path).toBe('/')
    })

    it('should return null for /api/v1 with no / route registered', () => {
      // Arrange
      router.registerVersion(1)
      router.registerRoute(1, 'GET', '/users', ok)

      // Act
      const resolved = router.resolveRoute('GET', '/api/v1')

      // Assert
      expect(resolved).toBeNull()
    })
  })

  // ─── Multiple path parameters ────────────────────────────

  describe('multiple path parameters', () => {
    it('should match routes with multiple :param segments', () => {
      // Arrange
      router.registerVersion(1)
      router.registerRoute(1, 'GET', '/users/:userId/posts/:postId', ok)

      // Act
      const resolved = router.resolveRoute('GET', '/api/v1/users/42/posts/7')

      // Assert
      expect(resolved).not.toBeNull()
      expect(resolved!.path).toBe('/users/:userId/posts/:postId')
    })

    it('should NOT match if param segments count differs', () => {
      // Arrange
      router.registerVersion(1)
      router.registerRoute(1, 'GET', '/users/:userId/posts/:postId', ok)

      // Act
      const resolved = router.resolveRoute('GET', '/api/v1/users/42')

      // Assert
      expect(resolved).toBeNull()
    })

    it('should NOT match if segment count matches but static segments differ', () => {
      // Arrange
      router.registerVersion(1)
      router.registerRoute(1, 'GET', '/users/:userId/posts/:postId', ok)

      // Act
      const resolved = router.resolveRoute('GET', '/api/v1/orgs/42/teams/7')

      // Assert
      expect(resolved).toBeNull()
    })
  })

  // ─── Deprecation chain ──────────────────────────────────

  describe('deprecation chain', () => {
    it('should reflect deprecation status in resolved route', () => {
      // Arrange
      router.registerVersion(1)
      router.registerRoute(1, 'GET', '/old-api', ok)
      router.markDeprecated(1, 'GET', '/old-api')

      // Act
      const resolved = router.resolveRoute('GET', '/api/v1/old-api')

      // Assert
      expect(resolved).not.toBeNull()
      expect(resolved!.deprecated).toBe(true)
      expect(router.isDeprecated(1, 'GET', '/old-api')).toBe(true)
    })

    it('should include sunsetDate in resolved route when set', () => {
      // Arrange
      const sunset = new Date('2027-01-01')
      router.registerVersion(1)
      router.registerRoute(1, 'GET', '/temp', ok)
      router.markDeprecated(1, 'GET', '/temp', sunset)

      // Act
      const resolved = router.resolveRoute('GET', '/api/v1/temp')

      // Assert
      expect(resolved!.deprecated).toBe(true)
      expect(resolved!.sunsetDate).toEqual(sunset)
    })

    it('should still resolve a deprecated route', () => {
      // Arrange
      router.registerVersion(1)
      router.registerRoute(1, 'GET', '/legacy', ok)
      router.markDeprecated(1, 'GET', '/legacy')

      // Act
      const resolved = router.resolveRoute('GET', '/api/v1/legacy')

      // Assert
      expect(resolved).not.toBeNull()
    })

    it('should return false for isDeprecated on active route', () => {
      // Arrange
      router.registerVersion(1)
      router.registerRoute(1, 'GET', '/alive', ok)

      // Act & Assert
      expect(router.isDeprecated(1, 'GET', '/alive')).toBe(false)
    })
  })

  // ─── getRoutes filtering ────────────────────────────────

  describe('getRoutes filtering', () => {
    it('should return empty array for a version with no routes', () => {
      // Arrange
      router.registerVersion(1)

      // Act
      const routes = router.getRoutes(1)

      // Assert
      expect(routes).toEqual([])
    })

    it('should return only routes for the specified version', () => {
      // Arrange
      router.registerVersion(1)
      router.registerVersion(2)
      router.registerRoute(1, 'GET', '/a', ok)
      router.registerRoute(2, 'GET', '/b', ok)

      // Act
      const v1Routes = router.getRoutes(1)
      const v2Routes = router.getRoutes(2)

      // Assert
      expect(v1Routes).toHaveLength(1)
      expect(v1Routes[0]!.path).toBe('/a')
      expect(v2Routes).toHaveLength(1)
      expect(v2Routes[0]!.path).toBe('/b')
    })
  })

  // ─── Version gap: skipping a version ────────────────────

  describe('version gap', () => {
    it('should handle registering non-consecutive versions', () => {
      // Arrange & Act
      router.registerVersion(1)
      router.registerVersion(5)
      router.registerRoute(1, 'GET', '/old', ok)
      router.registerRoute(5, 'GET', '/new', ok)

      // Assert
      expect(router.getDefaultVersion()).toBe(5)
      expect(router.resolveRoute('GET', '/api/v1/old')).not.toBeNull()
      expect(router.resolveRoute('GET', '/api/v5/new')).not.toBeNull()
    })
  })
})
