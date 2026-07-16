/**
 * CoreApp - Fastify application entry point.
 *
 * Wires middleware, DB, Redis, services, and routes.
 *
 * @audebase/core
 */

import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import { Redis } from 'ioredis'

import type { AppConfig } from './config.js'
import { createDatabase, type DrizzleDB } from './db/connection.js'
import { createLogger, type Logger } from './logger.js'
import { createRequestIdMiddleware } from './middleware/request-id.js'
import { registerHealthRoutes } from './health/routes.js'
import { AuthService } from '@audebase/auth'
import { AuditService, createAuditMiddleware } from '@audebase/audit'
import { requireAuth } from '@audebase/rbac'
import { RateLimiter, createRateLimitMiddleware } from '@audebase/rate-limit'
import { UserError, ErrorCode } from '@audebase/shared-types'

const HTTP_STATUS: Record<string, number> = {
  [ErrorCode.AUTH_INVALID_CREDENTIALS]: 401,
  [ErrorCode.AUTH_TOKEN_EXPIRED]: 401,
  [ErrorCode.AUTH_TOKEN_INVALID]: 401,
  [ErrorCode.AUTH_REQUIRED]: 401,
  [ErrorCode.AUTH_USER_INACTIVE]: 403,
  [ErrorCode.AUTH_MUST_CHANGE_PASSWORD]: 403,
  [ErrorCode.AUTH_TOKEN_VERSION_MISMATCH]: 401,
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.RBAC_ROLE_NOT_FOUND]: 404,
  [ErrorCode.RBAC_PERMISSION_DENIED]: 403,
  [ErrorCode.RBAC_CANNOT_DELETE_SYSTEM_ROLE]: 409,
  [ErrorCode.RATE_LIMIT_EXCEEDED]: 429,
}

interface ReplyLike {
  code: (status: number) => { send: (body: unknown) => void }
  send: (body: unknown) => void
}

export class CoreApp {
  private readonly config: AppConfig
  readonly logger: Logger
  private _fastify: FastifyInstance | null = null
  private _db: DrizzleDB | null = null
  private _sql: ReturnType<typeof createDatabase>['sql'] | null = null
  private _redis: Redis | null = null
  private _authService: AuthService | null = null
  private _auditService: AuditService | null = null

  constructor(config: AppConfig) {
    this.config = config
    this.logger = createLogger({
      level: config.AUDE_LOG_LEVEL,
      stream: process.stdout,
    })
  }

  get fastify(): FastifyInstance {
    if (!this._fastify) {
      throw new Error('CoreApp not bootstrapped. Call bootstrap() first.')
    }
    return this._fastify
  }

  async bootstrap(): Promise<void> {
    if (this._fastify) return

    // --- DB + Redis ---
    const { db, sql } = createDatabase(this.config)
    this._db = db
    this._sql = sql

    if (this.config.REDIS_URL) {
      this._redis = new Redis(this.config.REDIS_URL, {
        maxRetriesPerRequest: 3,
      })
    }

    // --- Services ---
    this._authService = new AuthService(db as never, this.config.AUDE_JWT_SECRET)
    this._auditService = new AuditService(db as never)
    // RBACService wired on-demand in routes via requireAuth

    // --- Fastify ---
    const app = Fastify({
      logger: false,
    })
    this._fastify = app

    // 1. CORS
    await app.register(cors, this.createCorsConfig())

    // 2. Request ID
    app.addHook('onRequest', createRequestIdMiddleware() as never)

    // 3. Rate limit
    const rateLimiter = new RateLimiter({ windowMs: 60_000, max: 100 })
    const rateLimitMiddleware = createRateLimitMiddleware(rateLimiter)
    app.addHook('onRequest', rateLimitMiddleware as never)

    // 4. Global error handler
    app.setErrorHandler((err, request, reply) => {
      const requestId = (request as unknown as { requestId?: string }).requestId ?? 'unknown'

      if (err instanceof UserError) {
        this.logger.warn({ err: err.message, requestId }, 'User error')
        const status = HTTP_STATUS[err.code] ?? 400
        reply.code(status).send({
          error: { code: err.code, message: err.message },
        })
        return
      }

      this.logger.error({ err, requestId }, 'Unhandled error')
      reply.code(500).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: this.config.NODE_ENV === 'production'
            ? 'Internal server error'
            : err instanceof Error ? err.message : 'Unknown error',
        },
      })
    })

    // 5. Health routes (no auth)
    const dbLike = {
      execute: async (sqlStr: string): Promise<unknown> => {
        return sql.unsafe(sqlStr)
      },
    }
    registerHealthRoutes(app, dbLike, this._redis)

    // 6. API routes
    this.registerApiRoutes(app)

    this.logger.info({ port: this.config.PORT }, 'CoreApp bootstrapped')
  }

  async start(): Promise<void> {
    if (!this._fastify) {
      await this.bootstrap()
    }
    const app = this._fastify!

    await app.listen({ port: this.config.PORT, host: '0.0.0.0' })
    this.logger.info({ port: this.config.PORT }, 'Server listening')
  }

  async stop(): Promise<void> {
    this.logger.info({}, 'Shutting down')

    if (this._fastify) {
      await this._fastify.close()
      this._fastify = null
    }
    if (this._redis) {
      this._redis.quit()
      this._redis = null
    }
    if (this._sql) {
      await this._sql.end()
      this._sql = null
    }

    this.logger.info({}, 'Shutdown complete')
  }

  private createCorsConfig(): {
    origin: string | string[] | boolean | RegExp
    methods: string[]
    allowedHeaders: string[]
    exposedHeaders: string[]
    credentials: boolean
  } {
    const methods = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']
    const allowedHeaders = ['Authorization', 'Content-Type', 'X-Request-ID']
    const exposedHeaders = [
      'X-Request-ID',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
    ]

    if (this.config.NODE_ENV === 'development') {
      return {
        origin: /^http:\/\/localhost:\d+$/,
        methods,
        allowedHeaders,
        exposedHeaders,
        credentials: false,
      }
    }

    if (this.config.AUDE_CORS_ORIGINS) {
      const origins = this.config.AUDE_CORS_ORIGINS.split(',').map((s) => s.trim())
      return {
        origin: origins,
        methods,
        allowedHeaders,
        exposedHeaders,
        credentials: false,
      }
    }

    return {
      origin: false,
      methods,
      allowedHeaders,
      exposedHeaders,
      credentials: false,
    }
  }

  private registerApiRoutes(app: FastifyInstance): void {
    const authService = this._authService!
    const auditService = this._auditService!

    // Auth middleware wrapper for protected routes
    const authHook = async (request: unknown, reply: unknown): Promise<void> => {
      await requireAuth(
        request as Parameters<typeof requireAuth>[0],
        reply as Parameters<typeof requireAuth>[1],
        authService,
      )
    }

    // Audit middleware (onSend for write ops)
    const auditMiddleware = createAuditMiddleware({ auditService })
    app.addHook('onSend', auditMiddleware as never)

    // --- Auth routes (no auth required) ---
    app.post('/api/auth/login', async (request, reply) => {
      const body = request.body as { username?: string; password?: string }
      if (!body?.username || !body?.password) {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'username and password required' },
        })
      }
      try {
        const input: { username: string; password: string; ip: string; userAgent?: string } = {
          username: body.username,
          password: body.password,
          ip: request.ip,
        }
        const ua = request.headers['user-agent']
        if (typeof ua === 'string') {
          input.userAgent = ua
        }
        const result = await authService.login(input)
        return reply.send(result)
      } catch (err) {
        return this.handleError(err, reply as ReplyLike)
      }
    })

    app.post('/api/auth/refresh', async (request, reply) => {
      const body = request.body as { refresh_token?: string }
      if (!body?.refresh_token) {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'refresh_token required' },
        })
      }
      try {
        const result = await authService.refresh({
          refresh_token: body.refresh_token,
        })
        return reply.send(result)
      } catch (err) {
        return this.handleError(err, reply as ReplyLike)
      }
    })

    app.post('/api/auth/logout', async (request, reply) => {
      const body = request.body as { refresh_token?: string }
      if (!body?.refresh_token) {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'refresh_token required' },
        })
      }
      try {
        await authService.logout({ refresh_token: body.refresh_token })
        return reply.code(204).send()
      } catch (err) {
        return this.handleError(err, reply as ReplyLike)
      }
    })

    // --- Protected routes (require auth) ---
    app.post('/api/auth/change-password', {
      onRequest: [authHook],
    }, async (request, reply) => {
      const body = request.body as {
        old_password?: string
        new_password?: string
      }
      const user = (request as unknown as { user?: { sub?: string } }).user
      if (!user?.sub || !body?.new_password) {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'new_password required' },
        })
      }
      try {
        await authService.changePassword(
          user.sub,
          body.old_password ?? null,
          body.new_password,
        )
        return reply.code(204).send()
      } catch (err) {
        return this.handleError(err, reply as ReplyLike)
      }
    })

    app.get('/api/users', {
      onRequest: [authHook],
    }, async (request, reply) => {
      const query = request.query as { page?: string; pageSize?: string }
      const page = query.page ? parseInt(query.page, 10) : 1
      const pageSize = query.pageSize ? parseInt(query.pageSize, 10) : 20

      try {
        const users = await (this._db as unknown as {
          query: { users: { findMany: (args?: unknown) => Promise<unknown[]> } }
        }).query.users.findMany({
          limit: pageSize,
          offset: (page - 1) * pageSize,
        })
        return reply.send({ data: users, page, pageSize })
      } catch (err) {
        return this.handleError(err, reply as ReplyLike)
      }
    })

    // --- Audit log query ---
    app.get('/api/audit-log', {
      onRequest: [authHook],
    }, async (request, reply) => {
      const query = request.query as {
        resource_type?: string
        resource_id?: string
        action?: string
        actor_id?: string
        page?: string
        pageSize?: string
      }
      const page = query.page ? parseInt(query.page, 10) : 1
      const pageSize = query.pageSize ? parseInt(query.pageSize, 10) : 20

      try {
        const filter: Record<string, string> = {}
        if (query.resource_type) filter.resource_type = query.resource_type
        if (query.resource_id) filter.resource_id = query.resource_id
        if (query.action) filter.action = query.action
        if (query.actor_id) filter.actor_id = query.actor_id

        const params = {
          tenant_id: null as string | null,
          page,
          pageSize,
        } as Record<string, unknown>
        if (Object.keys(filter).length > 0) {
          params.filter = filter
        }

        const results = await auditService.query(params as never)
        return reply.send({ data: results, page, pageSize })
      } catch (err) {
        return this.handleError(err, reply as ReplyLike)
      }
    })

    // --- Plugin list ---
    app.get('/api/plugins', {
      onRequest: [authHook],
    }, async (_request, reply) => {
      try {
        const plugins = await (this._db as unknown as {
          query: { modules: { findMany: (args?: unknown) => Promise<unknown[]> } }
        }).query.modules.findMany()
        return reply.send({ data: plugins })
      } catch (err) {
        return this.handleError(err, reply as ReplyLike)
      }
    })
  }

  private handleError(err: unknown, reply: ReplyLike): void {
    if (err instanceof UserError) {
      const status = HTTP_STATUS[err.code] ?? 400
      reply.code(status).send({
        error: { code: err.code, message: err.message },
      })
      return
    }
    const message = err instanceof Error ? err.message : 'Unknown error'
    this.logger.error({ err }, 'Route error')
    reply.code(500).send({
      error: { code: 'INTERNAL_ERROR', message },
    })
  }
}
