/**
 * @audebase/api-versioning - ApiVersionRouter unit tests
 *
 * AAA pattern. Each test creates a fresh router instance.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { ApiVersionRouter } from '../index.js'
import type { RouteHandler } from '../index.js'

describe('ApiVersionRouter', () => {
  let router: ApiVersionRouter

  beforeEach(() => {
    router = new ApiVersionRouter()
  })

  // --- registerVersion ---

  describe('registerVersion', () => {
    it('registers a version that appears in getVersions', () => {
      // Arrange
      // Act
      router.registerVersion(1)

      // Assert
      expect(router.getVersions()).toEqual([1])
    })

    it('registers multiple versions in sorted order', () => {
      // Arrange
      // Act
      router.registerVersion(3)
      router.registerVersion(1)
      router.registerVersion(2)

      // Assert
      expect(router.getVersions()).toEqual([1, 2, 3])
    })

    it('is idempotent for duplicate version registration', () => {
      // Arrange
      router.registerVersion(1)

      // Act
      router.registerVersion(1)

      // Assert
      expect(router.getVersions()).toEqual([1])
    })

    it('throws for version less than 1', () => {
      // Arrange
      // Act + Assert
      expect(() => router.registerVersion(0)).toThrow()
      expect(() => router.registerVersion(-1)).toThrow()
    })
  })

  // --- registerRoute ---

  describe('registerRoute', () => {
    it('registers a route that appears in getRoutes', () => {
      // Arrange
      router.registerVersion(1)
      const handler: RouteHandler = async () => undefined

      // Act
      router.registerRoute(1, 'GET', '/users', handler)

      // Assert
      const routes = router.getRoutes()
      expect(routes).toHaveLength(1)
      expect(routes[0]!.major).toBe(1)
      expect(routes[0]!.method).toBe('GET')
      expect(routes[0]!.path).toBe('/users')
      expect(routes[0]!.handler).toBe(handler)
    })

    it('throws when registering route for unregistered version', () => {
      // Arrange
      const handler: RouteHandler = async () => undefined

      // Act + Assert
      expect(() => router.registerRoute(99, 'GET', '/users', handler)).toThrow(
        /version 99 is not registered/,
      )
    })

    it('supports multiple routes under the same version', () => {
      // Arrange
      router.registerVersion(1)
      const getHandler: RouteHandler = async () => 'get'
      const postHandler: RouteHandler = async () => 'post'

      // Act
      router.registerRoute(1, 'GET', '/users', getHandler)
      router.registerRoute(1, 'POST', '/users', postHandler)

      // Assert
      expect(router.getRoutes()).toHaveLength(2)
    })

    it('supports same path across different versions', () => {
      // Arrange
      router.registerVersion(1)
      router.registerVersion(2)
      const v1Handler: RouteHandler = async () => 'v1'
      const v2Handler: RouteHandler = async () => 'v2'

      // Act
      router.registerRoute(1, 'GET', '/users', v1Handler)
      router.registerRoute(2, 'GET', '/users', v2Handler)

      // Assert
      expect(router.getRoutes()).toHaveLength(2)
      const v1Routes = router.getRoutes(1)
      expect(v1Routes).toHaveLength(1)
      const v2Routes = router.getRoutes(2)
      expect(v2Routes).toHaveLength(1)
    })

    it('normalizes method to uppercase', () => {
      // Arrange
      router.registerVersion(1)
      const handler: RouteHandler = async () => undefined

      // Act
      router.registerRoute(1, 'get', '/users', handler)

      // Assert
      expect(router.getRoutes()[0]!.method).toBe('GET')
    })
  })

  // --- resolveRoute ---

  describe('resolveRoute', () => {
    it('resolves a route with explicit version in URL', () => {
      // Arrange
      router.registerVersion(1)
      const handler: RouteHandler = async () => 'v1-users'
      router.registerRoute(1, 'GET', '/users', handler)

      // Act
      const result = router.resolveRoute('GET', '/api/v1/users')

      // Assert
      expect(result).not.toBeNull()
      expect(result!.version).toBe(1)
      expect(result!.handler).toBe(handler)
      expect(result!.path).toBe('/users')
    })

    it('resolves v1 and v2 to different handlers', () => {
      // Arrange
      router.registerVersion(1)
      router.registerVersion(2)
      const v1Handler: RouteHandler = async () => 'v1'
      const v2Handler: RouteHandler = async () => 'v2'
      router.registerRoute(1, 'GET', '/users', v1Handler)
      router.registerRoute(2, 'GET', '/users', v2Handler)

      // Act
      const v1Result = router.resolveRoute('GET', '/api/v1/users')
      const v2Result = router.resolveRoute('GET', '/api/v2/users')

      // Assert
      expect(v1Result!.handler).toBe(v1Handler)
      expect(v2Result!.handler).toBe(v2Handler)
      expect(v1Result!.version).toBe(1)
      expect(v2Result!.version).toBe(2)
    })

    it('resolves route with path parameter :id', () => {
      // Arrange
      router.registerVersion(1)
      const handler: RouteHandler = async () => 'user-by-id'
      router.registerRoute(1, 'GET', '/users/:id', handler)

      // Act
      const result = router.resolveRoute('GET', '/api/v1/users/123')

      // Assert
      expect(result).not.toBeNull()
      expect(result!.version).toBe(1)
      expect(result!.handler).toBe(handler)
      expect(result!.path).toBe('/users/:id')
    })

    it('uses default (latest) version when no version in URL', () => {
      // Arrange
      router.registerVersion(1)
      router.registerVersion(2)
      const v2Handler: RouteHandler = async () => 'v2'
      router.registerRoute(2, 'GET', '/users', v2Handler)

      // Act
      const result = router.resolveRoute('GET', '/api/users')

      // Assert
      expect(result).not.toBeNull()
      expect(result!.version).toBe(2)
      expect(result!.handler).toBe(v2Handler)
    })

    it('returns null for non-existent version', () => {
      // Arrange
      router.registerVersion(1)
      const handler: RouteHandler = async () => undefined
      router.registerRoute(1, 'GET', '/users', handler)

      // Act
      const result = router.resolveRoute('GET', '/api/v99/users')

      // Assert
      expect(result).toBeNull()
    })

    it('returns null for non-existent path', () => {
      // Arrange
      router.registerVersion(1)
      const handler: RouteHandler = async () => undefined
      router.registerRoute(1, 'GET', '/users', handler)

      // Act
      const result = router.resolveRoute('GET', '/api/v1/nonexistent')

      // Assert
      expect(result).toBeNull()
    })

    it('returns null for wrong HTTP method', () => {
      // Arrange
      router.registerVersion(1)
      const handler: RouteHandler = async () => undefined
      router.registerRoute(1, 'GET', '/users', handler)

      // Act
      const result = router.resolveRoute('POST', '/api/v1/users')

      // Assert
      expect(result).toBeNull()
    })

    it('returns null when no versions registered', () => {
      // Arrange
      // Act
      const result = router.resolveRoute('GET', '/api/users')

      // Assert
      expect(result).toBeNull()
    })

    it('returns null for URL not starting with /api/', () => {
      // Arrange
      router.registerVersion(1)
      const handler: RouteHandler = async () => undefined
      router.registerRoute(1, 'GET', '/users', handler)

      // Act
      const result = router.resolveRoute('GET', '/v1/users')

      // Assert
      expect(result).toBeNull()
    })

    it('normalizes method to uppercase when resolving', () => {
      // Arrange
      router.registerVersion(1)
      const handler: RouteHandler = async () => 'ok'
      router.registerRoute(1, 'GET', '/users', handler)

      // Act
      const result = router.resolveRoute('get', '/api/v1/users')

      // Assert
      expect(result).not.toBeNull()
      expect(result!.handler).toBe(handler)
    })

    it('does not match path param when segment count differs', () => {
      // Arrange
      router.registerVersion(1)
      const handler: RouteHandler = async () => undefined
      router.registerRoute(1, 'GET', '/users/:id', handler)

      // Act
      const result = router.resolveRoute('GET', '/api/v1/users')

      // Assert
      expect(result).toBeNull()
    })

    it('handles multiple path params in one route', () => {
      // Arrange
      router.registerVersion(1)
      const handler: RouteHandler = async () => 'nested'
      router.registerRoute(1, 'GET', '/orgs/:orgId/users/:userId', handler)

      // Act
      const result = router.resolveRoute('GET', '/api/v1/orgs/5/users/42')

      // Assert
      expect(result).not.toBeNull()
      expect(result!.handler).toBe(handler)
    })
  })

  // --- getRoutes ---

  describe('getRoutes', () => {
    it('returns empty array when no routes registered', () => {
      // Arrange
      // Act
      const routes = router.getRoutes()

      // Assert
      expect(routes).toEqual([])
    })

    it('returns empty array for a version with no routes', () => {
      // Arrange
      router.registerVersion(1)

      // Act
      const routes = router.getRoutes(1)

      // Assert
      expect(routes).toEqual([])
    })

    it('returns empty array for an unregistered version filter', () => {
      // Arrange
      // Act
      const routes = router.getRoutes(999)

      // Assert
      expect(routes).toEqual([])
    })

    it('returns all routes across all versions when no filter', () => {
      // Arrange
      router.registerVersion(1)
      router.registerVersion(2)
      const h1: RouteHandler = async () => undefined
      const h2: RouteHandler = async () => undefined
      router.registerRoute(1, 'GET', '/users', h1)
      router.registerRoute(2, 'POST', '/items', h2)

      // Act
      const routes = router.getRoutes()

      // Assert
      expect(routes).toHaveLength(2)
    })
  })

  // --- deprecation ---

  describe('markDeprecated', () => {
    it('marks a route as deprecated', () => {
      // Arrange
      router.registerVersion(1)
      const handler: RouteHandler = async () => undefined
      router.registerRoute(1, 'GET', '/users', handler)

      // Act
      router.markDeprecated(1, 'GET', '/users')

      // Assert
      expect(router.isDeprecated(1, 'GET', '/users')).toBe(true)
    })

    it('stores sunset date correctly', () => {
      // Arrange
      router.registerVersion(1)
      const handler: RouteHandler = async () => undefined
      router.registerRoute(1, 'GET', '/users', handler)
      const sunset = new Date('2027-01-01T00:00:00Z')

      // Act
      router.markDeprecated(1, 'GET', '/users', sunset)

      // Assert
      const routes = router.getRoutes(1)
      expect(routes[0]!.deprecated).toBe(true)
      expect(routes[0]!.sunsetDate).toEqual(sunset)
    })

    it('deprecated routes still resolve successfully', () => {
      // Arrange
      router.registerVersion(1)
      const handler: RouteHandler = async () => 'ok'
      router.registerRoute(1, 'GET', '/users', handler)
      router.markDeprecated(1, 'GET', '/users')

      // Act
      const result = router.resolveRoute('GET', '/api/v1/users')

      // Assert
      expect(result).not.toBeNull()
      expect(result!.deprecated).toBe(true)
    })

    it('returns false for isDeprecated on non-deprecated route', () => {
      // Arrange
      router.registerVersion(1)
      const handler: RouteHandler = async () => undefined
      router.registerRoute(1, 'GET', '/users', handler)

      // Act + Assert
      expect(router.isDeprecated(1, 'GET', '/users')).toBe(false)
    })

    it('returns false for isDeprecated on non-existent route', () => {
      // Arrange
      router.registerVersion(1)

      // Act + Assert
      expect(router.isDeprecated(1, 'GET', '/nonexistent')).toBe(false)
    })

    it('returns false for isDeprecated on non-existent version', () => {
      // Arrange
      // Act + Assert
      expect(router.isDeprecated(99, 'GET', '/users')).toBe(false)
    })

    it('markDeprecated is a no-op for non-existent route', () => {
      // Arrange
      router.registerVersion(1)

      // Act
      router.markDeprecated(1, 'GET', '/nonexistent')

      // Assert - no throw
      expect(router.getRoutes()).toHaveLength(0)
    })

    it('markDeprecated is a no-op for non-existent version', () => {
      // Arrange
      // Act
      router.markDeprecated(99, 'GET', '/users')

      // Assert - no throw
      expect(router.getRoutes()).toHaveLength(0)
    })

    it('marks deprecated with method case-insensitively', () => {
      // Arrange
      router.registerVersion(1)
      const handler: RouteHandler = async () => undefined
      router.registerRoute(1, 'GET', '/users', handler)

      // Act
      router.markDeprecated(1, 'get', '/users')

      // Assert
      expect(router.isDeprecated(1, 'GET', '/users')).toBe(true)
    })

    it('includes deprecated flag and sunsetDate in resolved route', () => {
      // Arrange
      router.registerVersion(1)
      const handler: RouteHandler = async () => undefined
      router.registerRoute(1, 'GET', '/users', handler)
      const sunset = new Date('2027-06-01T00:00:00Z')
      router.markDeprecated(1, 'GET', '/users', sunset)

      // Act
      const result = router.resolveRoute('GET', '/api/v1/users')

      // Assert
      expect(result!.deprecated).toBe(true)
      expect(result!.sunsetDate).toEqual(sunset)
    })
  })

  // --- getDefaultVersion ---

  describe('getDefaultVersion', () => {
    it('returns 0 when no versions registered', () => {
      // Arrange
      // Act
      const result = router.getDefaultVersion()

      // Assert
      expect(result).toBe(0)
    })

    it('returns the only registered version', () => {
      // Arrange
      router.registerVersion(1)

      // Act
      const result = router.getDefaultVersion()

      // Assert
      expect(result).toBe(1)
    })

    it('returns the latest registered major version', () => {
      // Arrange
      router.registerVersion(1)
      router.registerVersion(2)
      router.registerVersion(3)

      // Act
      const result = router.getDefaultVersion()

      // Assert
      expect(result).toBe(3)
    })
  })

  // --- getVersions ---

  describe('getVersions', () => {
    it('returns empty array when no versions registered', () => {
      // Arrange
      // Act
      const result = router.getVersions()

      // Assert
      expect(result).toEqual([])
    })
  })

  // --- multiple versions coexistence ---

  describe('multiple version coexistence', () => {
    it('allows v1 deprecated while v2 active for same path', () => {
      // Arrange
      router.registerVersion(1)
      router.registerVersion(2)
      const v1Handler: RouteHandler = async () => 'v1'
      const v2Handler: RouteHandler = async () => 'v2'
      router.registerRoute(1, 'GET', '/users', v1Handler)
      router.registerRoute(2, 'GET', '/users', v2Handler)
      router.markDeprecated(1, 'GET', '/users')

      // Act
      const v1Result = router.resolveRoute('GET', '/api/v1/users')
      const v2Result = router.resolveRoute('GET', '/api/v2/users')

      // Assert
      expect(v1Result!.deprecated).toBe(true)
      expect(v2Result!.deprecated).toBe(false)
    })

    it('supports different routes across versions', () => {
      // Arrange
      router.registerVersion(1)
      router.registerVersion(2)
      const v1Handler: RouteHandler = async () => 'v1'
      const v2Handler: RouteHandler = async () => 'v2'
      router.registerRoute(1, 'GET', '/users', v1Handler)
      // v2 uses different path
      router.registerRoute(2, 'GET', '/accounts', v2Handler)

      // Act + Assert
      expect(router.resolveRoute('GET', '/api/v1/users')!.handler).toBe(v1Handler)
      expect(router.resolveRoute('GET', '/api/v1/accounts')).toBeNull()
      expect(router.resolveRoute('GET', '/api/v2/users')).toBeNull()
      expect(router.resolveRoute('GET', '/api/v2/accounts')!.handler).toBe(v2Handler)
    })
  })
})
