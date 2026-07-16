import Redis from 'ioredis-mock'
import { sql } from 'drizzle-orm'

interface TestAppOptions {
  withRedis?: boolean
  withBullMQ?: boolean
  queues?: string[]
  seeds?: {
    admin?: boolean
    tenant?: string
  }
}

interface TestApp {
  app: unknown // FastifyInstance - will be typed when core is implemented
  db: unknown // DrizzleDB - will be typed when core is implemented
  redis: { client: Redis; publisher: Redis; subscriber: Redis } | null
  queues: Record<string, unknown> | null
  withTransaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>
}

export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  // ponytail: placeholder - will be implemented when core package is built
  // This exists so tests can import it and fail (RED phase) rather than not compile
  throw new Error('createTestApp not yet implemented - Phase 1a Week 0')
}

export type { TestApp, TestAppOptions }
