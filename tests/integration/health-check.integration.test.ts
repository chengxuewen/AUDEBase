/**
 * Phase 1a Integration Test: Core Health Check
 *
 * Verifies cross-package interaction:
 * - core (HealthService) -> shared-types (healthResponseSchema)
 * - core health routes registration
 */

import { describe, it, expect } from 'vitest'
import { HealthService } from '@audebase/core'
import { healthResponseSchema } from '@audebase/shared-types'

describe('Core Health Check Integration', () => {
  it('should return health check result matching shared-types schema', async () => {
    // Arrange
    const mockDb = { execute: async () => [{ '1': 1 }] }
    const mockRedis = { ping: async () => 'PONG' }
    const service = new HealthService(mockDb, mockRedis)

    // Act
    const result = await service.check()

    // Assert
    expect(result.status).toBe('ok')
    expect(result.db).toBe(true)
    expect(result.redis).toBe(true)
    expect(result.uptime).toBeGreaterThanOrEqual(0)

    // Assert - validates against shared-types Zod schema
    const parsed = healthResponseSchema.safeParse(result)
    expect(parsed.success).toBe(true)
  })

  it('should report degraded when DB fails', async () => {
    // Arrange
    const mockDb = { execute: async () => { throw new Error('Connection refused') } }
    const mockRedis = { ping: async () => 'PONG' }
    const service = new HealthService(mockDb, mockRedis)

    // Act
    const result = await service.check()

    // Assert
    expect(result.status).toBe('degraded')
    expect(result.db).toBe(false)
    expect(result.redis).toBe(true)
  })

  it('should work without Redis (redis undefined in result)', async () => {
    // Arrange
    const mockDb = { execute: async () => undefined }
    const service = new HealthService(mockDb, null)

    // Act
    const result = await service.check()

    // Assert
    expect(result.status).toBe('ok')
    expect(result.db).toBe(true)
    expect(result.redis).toBeUndefined()
  })
})
