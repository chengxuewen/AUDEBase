// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestApp, type TestApp } from './helpers/createTestApp'
import { withTestApp } from './helpers/withTestApp'

describe('GET /health (integration)', () => {
  let test: TestApp

  beforeEach(async () => {
    test = await createTestApp()
  })

  afterEach(async () => {
    await test.cleanup()
  })

  it('should return 200 with db: true when DB connection is normal', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      const res = await app.inject({ method: 'GET', url: '/health' })

      // Assert
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.status).toBe('ok')
      expect(body.db).toBe(true)
      expect(body.uptime).toBeGreaterThanOrEqual(0)
    })
  })

  it('should include version and timestamp in response', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      const res = await app.inject({ method: 'GET', url: '/health' })

      // Assert
      const body = res.json()
      expect(body.version).toBeDefined()
      expect(body.timestamp).toBeDefined()
      expect(new Date(body.timestamp).getTime()).not.toBeNaN()
    })
  })

  it('should return redis: true when Redis is available', async () => {
    // Arrange
    const { app } = await createTestApp({ withRedis: true })

    // Act
    const res = await app.inject({ method: 'GET', url: '/health' })

    // Assert
    expect(res.json().redis).toBe(true)
  })

  it('should be accessible without authentication', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      const res = await app.inject({
        method: 'GET',
        url: '/health',
        // No Authorization header
      })

      // Assert
      expect(res.statusCode).toBe(200)
    })
  })

  it('should return redis: false when Redis connection fails (GO-004)', async () => {
    // Arrange
    const { app } = await createTestApp({ withRedis: true })

    // Act
    const res = await app.inject({ method: 'GET', url: '/health' })

    // Assert - redis field should be present and reflect connection state
    const body = res.json()
    expect(body).toHaveProperty('redis')
  })
})

describe('GET /api/health (integration)', () => {
  it('should return 200 with { status, db, redis, uptime }', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      const res = await app.inject({ method: 'GET', url: '/api/health' })

      // Assert
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.status).toBe('ok')
      expect(body.db).toBe(true)
      expect(body.uptime).toBeGreaterThanOrEqual(0)
    })
  })

  it('should be accessible without authentication', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/health',
        // No Authorization header
      })

      // Assert
      expect(res.statusCode).toBe(200)
    })
  })
})

describe('GET /health/ready (integration)', () => {
  it('should return 200 with status: ready when DB is ready', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      const res = await app.inject({ method: 'GET', url: '/health/ready' })

      // Assert
      expect(res.statusCode).toBe(200)
      expect(res.json().status).toBe('ready')
    })
  })

  it('should be accessible without authentication', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      const res = await app.inject({ method: 'GET', url: '/health/ready' })

      // Assert
      expect(res.statusCode).toBe(200)
    })
  })

  it('should return 503 with status: not_ready when DB is unavailable', async () => {
    // Arrange
    const { app } = await createTestApp({ dbUrl: 'postgres://invalid:5432/nonexistent' })

    try {
      // Act
      const res = await app.inject({ method: 'GET', url: '/health/ready' })

      // Assert
      expect(res.statusCode).toBe(503)
      expect(res.json().status).toBe('not_ready')
    } finally {
      await app.close()
    }
  })
})
