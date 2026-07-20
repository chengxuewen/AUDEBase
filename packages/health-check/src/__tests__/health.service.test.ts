import { describe, test, expect, vi, beforeEach } from 'vitest'
import { HealthCheckService } from '../health/service.js'
import type { DatabaseProvider, RedisClient } from '../types.js'

// --- Mock factories ---

function makeMockDb(impl?: () => Promise<unknown>): DatabaseProvider {
  return {
    execute: vi.fn(impl ?? (() => Promise.resolve(undefined))),
  }
}

function makeMockRedis(impl?: () => Promise<string>): RedisClient {
  return {
    ping: vi.fn(impl ?? (() => Promise.resolve('PONG'))),
  }
}

// --- Tests ---

describe('HealthCheckService', () => {
  let fixedStartTime: number

  beforeEach(() => {
    // Freeze time so uptime is deterministic
    fixedStartTime = Date.now()
    vi.useFakeTimers()
    vi.setSystemTime(new Date(fixedStartTime))
  })

  test('checkDatabase() returns true when DB execute resolves', async () => {
    // Arrange
    const mockDb = makeMockDb(() => Promise.resolve(undefined))

    // Act
    const service = new HealthCheckService(mockDb, null, fixedStartTime)
    const result = await service.checkDatabase()

    // Assert
    expect(result).toBe(true)
  })

  test('checkDatabase() returns false when DB execute rejects', async () => {
    // Arrange
    const mockDb = makeMockDb(() => Promise.reject(new Error('connection refused')))

    // Act
    const service = new HealthCheckService(mockDb, null, fixedStartTime)
    const result = await service.checkDatabase()

    // Assert
    expect(result).toBe(false)
  })

  test('checkRedis() returns true when Redis ping resolves', async () => {
    // Arrange
    const mockDb = makeMockDb()
    const mockRedis = makeMockRedis(() => Promise.resolve('PONG'))

    // Act
    const service = new HealthCheckService(mockDb, mockRedis, fixedStartTime)
    const result = await service.checkRedis()

    // Assert
    expect(result).toBe(true)
  })

  test('checkRedis() returns false when Redis ping rejects', async () => {
    // Arrange
    const mockDb = makeMockDb()
    const mockRedis = makeMockRedis(() => Promise.reject(new Error('ECONNREFUSED')))

    // Act
    const service = new HealthCheckService(mockDb, mockRedis, fixedStartTime)
    const result = await service.checkRedis()

    // Assert
    expect(result).toBe(false)
  })

  test('checkRedis() returns undefined when Redis is null', async () => {
    // Arrange
    const mockDb = makeMockDb()

    // Act
    const service = new HealthCheckService(mockDb, null, fixedStartTime)
    const result = await service.checkRedis()

    // Assert
    expect(result).toBeUndefined()
  })

  test('getUptime() returns non-negative integer', () => {
    // Arrange
    const mockDb = makeMockDb()
    const service = new HealthCheckService(mockDb, null, fixedStartTime)

    // Act - advance 5 seconds
    vi.setSystemTime(new Date(fixedStartTime + 5_000))
    const uptime = service.getUptime()

    // Assert
    expect(uptime).toBe(5)
    expect(Number.isInteger(uptime)).toBe(true)
  })

  test('getUptime() returns 0 immediately after construction', () => {
    // Arrange
    const mockDb = makeMockDb()
    const service = new HealthCheckService(mockDb, null, fixedStartTime)

    // Act
    const uptime = service.getUptime()

    // Assert
    expect(uptime).toBe(0)
  })

  test('check() returns status ok and db true when DB is healthy', async () => {
    // Arrange
    const mockDb = makeMockDb(() => Promise.resolve(undefined))

    // Act
    const service = new HealthCheckService(mockDb, null, fixedStartTime)
    const result = await service.check()

    // Assert
    expect(result.status).toBe('ok')
    expect(result.db).toBe(true)
  })

  test('check() returns db false when DB is unhealthy', async () => {
    // Arrange
    const mockDb = makeMockDb(() => Promise.reject(new Error('timeout')))

    // Act
    const service = new HealthCheckService(mockDb, null, fixedStartTime)
    const result = await service.check()

    // Assert
    expect(result.status).toBe('ok')
    expect(result.db).toBe(false)
  })

  test('check() includes redis true when Redis is healthy', async () => {
    // Arrange
    const mockDb = makeMockDb()
    const mockRedis = makeMockRedis(() => Promise.resolve('PONG'))

    // Act
    const service = new HealthCheckService(mockDb, mockRedis, fixedStartTime)
    const result = await service.check()

    // Assert
    expect(result.redis).toBe(true)
  })

  test('check() includes redis false when Redis is unhealthy', async () => {
    // Arrange
    const mockDb = makeMockDb()
    const mockRedis = makeMockRedis(() => Promise.reject(new Error('down')))

    // Act
    const service = new HealthCheckService(mockDb, mockRedis, fixedStartTime)
    const result = await service.check()

    // Assert
    expect(result.redis).toBe(false)
  })

  test('check() omits redis field when Redis is null', async () => {
    // Arrange
    const mockDb = makeMockDb()

    // Act
    const service = new HealthCheckService(mockDb, null, fixedStartTime)
    const result = await service.check()

    // Assert
    expect(result.redis).toBeUndefined()
  })

  test('check() includes uptime, version, and timestamp', async () => {
    // Arrange
    const mockDb = makeMockDb()
    vi.setSystemTime(new Date(fixedStartTime + 10_000))

    // Act
    const service = new HealthCheckService(mockDb, null, fixedStartTime, '1.2.3')
    const result = await service.check()

    // Assert
    expect(result.uptime).toBe(10)
    expect(result.version).toBe('1.2.3')
    expect(result.timestamp).toBeDefined()
    expect(new Date(result.timestamp).getTime()).not.toBeNaN()
  })

  test('checkReady() returns ready true when DB is healthy', async () => {
    // Arrange
    const mockDb = makeMockDb(() => Promise.resolve(undefined))

    // Act
    const service = new HealthCheckService(mockDb, null, fixedStartTime)
    const result = await service.checkReady()

    // Assert
    expect(result.ready).toBe(true)
  })

  test('checkReady() returns ready false when DB is unhealthy', async () => {
    // Arrange
    const mockDb = makeMockDb(() => Promise.reject(new Error('down')))

    // Act
    const service = new HealthCheckService(mockDb, null, fixedStartTime)
    const result = await service.checkReady()

    // Assert
    expect(result.ready).toBe(false)
  })

  test('checkDatabase() times out after 3 seconds', async () => {
    // Arrange - DB that never resolves
    const mockDb = makeMockDb(
      () => new Promise<unknown>(() => { /* never resolves */ }),
    )

    // Act
    const service = new HealthCheckService(mockDb, null, fixedStartTime)
    const checkPromise = service.checkDatabase()

    // Advance past timeout
    vi.advanceTimersByTime(3_000)
    const result = await checkPromise

    // Assert
    expect(result).toBe(false)
  })

  test('checkRedis() times out after 3 seconds', async () => {
    // Arrange - Redis that never resolves
    const mockDb = makeMockDb()
    const mockRedis = makeMockRedis(
      () => new Promise<string>(() => { /* never resolves */ }),
    )

    // Act
    const service = new HealthCheckService(mockDb, mockRedis, fixedStartTime)
    const checkPromise = service.checkRedis()

    // Advance past timeout
    vi.advanceTimersByTime(3_000)
    const result = await checkPromise

    // Assert
    expect(result).toBe(false)
  })
})
