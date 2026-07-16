import { describe, test, expect, vi } from 'vitest'
import { registerHealthRoutes } from '../health/routes.js'
import type { FastifyLike } from '../health/routes.js'
import type { HealthCheckService } from '../health/service.js'
import type { HealthStatus, ReadyResult } from '../health/service.js'

// --- Mock Fastify app ---

interface RouteEntry {
  readonly method: string
  readonly path: string
  readonly handler: (request: unknown, reply: MockReply) => Promise<unknown>
}

class MockReply {
  public statusCode: number = 200
  public body: unknown = undefined

  code(statusCode: number): MockReply {
    this.statusCode = statusCode
    return this
  }

  send(payload: unknown): void {
    this.body = payload
  }
}

class MockApp implements FastifyLike {
  public routes: RouteEntry[] = []

  get(
    path: string,
    handler: (request: unknown, reply: MockReply) => Promise<unknown>,
  ): void {
    this.routes = [...this.routes, { method: 'GET', path, handler }]
  }

  async callRoute(
    path: string,
  ): Promise<{ statusCode: number; body: unknown }> {
    const route = this.routes.find((r) => r.path === path)
    if (!route) {
      throw new Error(`No route registered for ${path}`)
    }
    const reply = new MockReply()
    await route.handler({}, reply)
    return { statusCode: reply.statusCode, body: reply.body }
  }
}

// --- Mock HealthCheckService ---

function makeMockService(
  checkResult: HealthStatus,
  readyResult: ReadyResult,
): HealthCheckService {
  return {
    check: vi.fn().mockResolvedValue(checkResult),
    checkReady: vi.fn().mockResolvedValue(readyResult),
    checkDatabase: vi.fn(),
    checkRedis: vi.fn(),
    getUptime: vi.fn(),
  } as unknown as HealthCheckService
}

// --- Tests ---

describe('registerHealthRoutes', () => {
  test('registers exactly 3 routes: /health, /api/health, /health/ready', () => {
    // Arrange
    const app = new MockApp()
    const service = makeMockService(
      { status: 'ok', db: true, uptime: 0, version: '0.1.0', timestamp: '2026-07-16T10:00:00Z' },
      { ready: true },
    )

    // Act
    registerHealthRoutes(app, service)

    // Assert
    expect(app.routes).toHaveLength(3)
    const paths = app.routes.map((r) => r.path)
    expect(paths).toContain('/health')
    expect(paths).toContain('/api/health')
    expect(paths).toContain('/health/ready')
  })

  test('GET /health returns 200 with check() result', async () => {
    // Arrange
    const app = new MockApp()
    const healthStatus: HealthStatus = {
      status: 'ok',
      db: true,
      uptime: 100,
      version: '0.1.0',
      timestamp: '2026-07-16T10:00:00Z',
    }
    const service = makeMockService(healthStatus, { ready: true })

    // Act
    registerHealthRoutes(app, service)
    const { statusCode, body } = await app.callRoute('/health')

    // Assert
    expect(statusCode).toBe(200)
    expect(body).toEqual(healthStatus)
  })

  test('GET /api/health returns 200 with same result as /health', async () => {
    // Arrange
    const app = new MockApp()
    const healthStatus: HealthStatus = {
      status: 'ok',
      db: true,
      redis: true,
      uptime: 50,
      version: '0.1.0',
      timestamp: '2026-07-16T10:00:00Z',
    }
    const service = makeMockService(healthStatus, { ready: true })

    // Act
    registerHealthRoutes(app, service)
    const { statusCode, body } = await app.callRoute('/api/health')

    // Assert
    expect(statusCode).toBe(200)
    expect(body).toEqual(healthStatus)
  })

  test('GET /health/ready returns 200 { status: ready } when DB is ready', async () => {
    // Arrange
    const app = new MockApp()
    const service = makeMockService(
      { status: 'ok', db: true, uptime: 0, version: '0.1.0', timestamp: '2026-07-16T10:00:00Z' },
      { ready: true },
    )

    // Act
    registerHealthRoutes(app, service)
    const { statusCode, body } = await app.callRoute('/health/ready')

    // Assert
    expect(statusCode).toBe(200)
    expect(body).toEqual({ status: 'ready' })
  })

  test('GET /health/ready returns 503 { status: not_ready, db: false } when DB is not ready', async () => {
    // Arrange
    const app = new MockApp()
    const service = makeMockService(
      { status: 'ok', db: false, uptime: 0, version: '0.1.0', timestamp: '2026-07-16T10:00:00Z' },
      { ready: false },
    )

    // Act
    registerHealthRoutes(app, service)
    const { statusCode, body } = await app.callRoute('/health/ready')

    // Assert
    expect(statusCode).toBe(503)
    expect(body).toEqual({ status: 'not_ready', db: false })
  })

  test('GET /health returns 200 even when DB is degraded (liveness concern is process, not deps)', async () => {
    // Arrange
    const app = new MockApp()
    const degradedStatus: HealthStatus = {
      status: 'ok',
      db: false,
      uptime: 3600,
      version: '0.1.0',
      timestamp: '2026-07-16T10:00:00Z',
    }
    const service = makeMockService(degradedStatus, { ready: false })

    // Act
    registerHealthRoutes(app, service)
    const { statusCode, body } = await app.callRoute('/health')

    // Assert
    expect(statusCode).toBe(200)
    expect(body).toEqual(degradedStatus)
  })
})
