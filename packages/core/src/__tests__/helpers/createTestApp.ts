import { fastify, type FastifyInstance } from 'fastify'
import Redis from 'ioredis-mock'
import { registerHealthRoutes } from '../../health/routes.js'

interface TestAppOptions {
  withRedis?: boolean
  withBullMQ?: boolean
  queues?: string[]
  seeds?: {
    admin?: boolean
    tenant?: string
  }
  dbUrl?: string
}

interface DbLike {
  execute: (sql: string) => Promise<unknown>
}

interface TestApp {
  app: FastifyInstance
  db: unknown
  redis: { client: Redis; publisher: Redis; subscriber: Redis } | null
  queues: Record<string, unknown> | null
  withTransaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>
  cleanup: () => Promise<void>
}

function createMockDb(dbUrl?: string): DbLike {
  if (dbUrl && dbUrl.includes('invalid')) {
    return {
      async execute(): Promise<never> {
        throw new Error('Connection refused')
      },
    }
  }
  return {
    async execute(): Promise<void> {},
  }
}

export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const app = fastify({ logger: false })
  const db = createMockDb(options.dbUrl)

  let redis: { client: Redis; publisher: Redis; subscriber: Redis } | null = null
  if (options.withRedis === true) {
    redis = {
      client: new Redis(),
      publisher: new Redis(),
      subscriber: new Redis(),
    }
  }

  registerHealthRoutes(app, db, redis?.client ?? null)

  const withTransaction = async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
    return fn(db)
  }

  const cleanup = async (): Promise<void> => {
    await app.close()
  }

  return {
    app,
    db,
    redis,
    queues: null,
    withTransaction,
    cleanup,
  }
}

export type { TestApp, TestAppOptions }
