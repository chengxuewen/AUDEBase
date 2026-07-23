/**
 * CoreApp - Fastify application entry point.
 *
 * Wires middleware, DB, Redis, services, and routes.
 *
 * @audebase/core
 */

import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify'
import cors from '@fastify/cors'
import { Redis } from 'ioredis'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'; const { hash } = bcrypt

// ponytail: D26 Phase 2 — EventBus 砍至 Phase 2 恢复
// ponytailext import { EventBus } from '@audebase/event-bus'
// ponytail: D26 Phase 2 — Cron 保留评估（Phase 1a 暂留）
import { CronManager } from '@audebase/cron'
// ponytail: D26 Phase 2 — FileUpload 砍至 Phase 2 恢复
// ponytailext import { FileUploadService } from '@audebase/file-upload'
// ponytailext import type { AttachmentRepository, AttachmentRecord, FileUpload, FileFilter, DownloadResult, ListResult } from '@audebase/file-upload'
// ponytail: D26 Phase 2 — Notification 砍至 Phase 2 恢复
// ponytailext import { NotificationManager } from '@audebase/notification'
// ponytail: D26 Phase 2 — ApiVersioning 砍至 Phase 2 恢复
// ponytailext import { ApiVersionRouter } from '@audebase/api-versioning'
// ponytail: D26 Phase 2 — DataExtends 砍至 Phase 2 恢复
// ponytailext import { CollectionRegistry } from '@audebase/data-extends'

import type { AppConfig } from './config.js'
import { createDatabase, type DrizzleDB } from './db/connection.js'
import { tenants, modules, users, roles, permissions, role_permissions, user_roles, refresh_tokens, audit_log } from './db/schema.js'
import { createLogger, type Logger } from './logger.js'
import { createRequestIdMiddleware } from './middleware/request-id.js'
import { HealthCheckService, registerHealthRoutes } from '@audebase/health-check'
import { AuthService } from '@audebase/auth'
import { AuditService, createAuditMiddleware } from '@audebase/audit'
import { requireAuth } from '@audebase/rbac'
import { RateLimiter, createRateLimitMiddleware } from '@audebase/rate-limit'
import { UserError, ErrorCode } from '@audebase/shared-types'
import { generateBootstrapData, isBootstrapComplete } from '@audebase/plugin-core'
import { resolveDependencyOrder } from '@audebase/plugin-framework'
import { registerLogRoutes } from './logs/routes.js'
import { checkLoginRateLimit, loginRateLimitBody } from './middleware/login-rate-limit.js'
import { registerGraphQLRoute } from './api/graphql.js'

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

/**
 * Auth DB adapter: bridges @audebase/auth's mock-oriented DatabaseProvider
 * to the real Drizzle DB. The auth service calls insert(values) and update(values)
 * with raw objects; this adapter routes them to the correct Drizzle table.
 *
 * Stateful: tracks the last fetched user/refresh_token so update() targets the right row,
 * mirroring how the mock DB worked (update always affected the last-queried record).
 */
function createAuthDbAdapter(db: DrizzleDB): Record<string, unknown> {
  let lastUserId: string | null = null
  let lastTokenId: string | null = null
  let lastTenantId: string | null = null

  const queryDb = db as unknown as {
    query: {
      users: { findFirst: (args?: unknown) => Promise<{ id: string; tenant_id: string | null } | undefined> }
      refresh_tokens: { findFirst: (args?: unknown) => Promise<{ id: string } | undefined> }
    }
  }

  return {
    query: {
      users: {
        // ponytail: pass args through; { sub } translates to where eq(id, sub)
        findFirst: async (args?: unknown) => {
          const filter = (args as Record<string, unknown> | undefined)?.sub as string | undefined
          const row = filter
            ? await queryDb.query.users.findFirst({ where: (u: { id: string }, { eq: e }: { eq: typeof eq }) => e(u.id, filter) } as never)
            : await queryDb.query.users.findFirst()
          if (row) {
            lastUserId = row.id
            lastTenantId = row.tenant_id
          }
          return row
        },
      },
      refresh_tokens: {
        findFirst: async (args?: unknown) => {
          const row = await queryDb.query.refresh_tokens.findFirst(args as never)
          if (row) lastTokenId = row.id
          return row
        },
      },
    },
    insert: (values: Record<string, unknown>) => {
      if ('token_hash' in values && 'user_id' in values) {
        const enriched = { ...values, tenant_id: lastTenantId ?? '' }
        return db.insert(refresh_tokens).values(enriched as never)
      }
      return Promise.resolve()
    },
    update: (values: Record<string, unknown>) => {
      if ('password_hash' in values || 'last_login_at' in values) {
        if (lastUserId) {
          return db.update(users).set(values as never).where(eq(users.id, lastUserId))
        }
      }
      if ('revoked_at' in values) {
        if (lastTokenId) {
          return db.update(refresh_tokens).set(values as never).where(eq(refresh_tokens.id, lastTokenId))
        }
      }
      return Promise.resolve()
    },
    delete: () => Promise.resolve(),
  }
}

// ponytail: D26 Phase 2 — FileUpload 砍至 Phase 2 恢复
// ponytailext /** Convert a Drizzle DB row to AttachmentRecord. */
// ponytailext function mapAttachmentRow(row: { ... }): AttachmentRecord { ... }

export class CoreApp {
  private readonly config: AppConfig
  readonly logger: Logger
  private _fastify: FastifyInstance | null = null
  private _db: DrizzleDB | null = null
  private _sql: ReturnType<typeof createDatabase>['sql'] | null = null
  private _redis: Redis | null = null
  private _authService: AuthService | null = null
  private _auditService: AuditService | null = null
  // ponytail: D26 Phase 2 — EventBus 砍至 Phase 2 恢复
  // private _eventBus: EventBus | null = null
  private _cronManager: CronManager | null = null
  // ponytail: D26 Phase 2 — FileUpload 砍至 Phase 2 恢复
  // private _fileUploadService: FileUploadService | null = null
  // ponytail: D26 Phase 2 — Notification 砍至 Phase 2 恢复
  // private _notificationManager: NotificationManager | null = null
  // ponytail: D26 Phase 2 — ApiVersioning 砍至 Phase 2 恢复
  // private _apiVersionRouter: ApiVersionRouter | null = null
  // ponytail: D26 Phase 2 — DataExtends 砍至 Phase 2 恢复
  // private _collectionRegistry: CollectionRegistry | null = null
  private _tenantCache: Map<string, string> = new Map()

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

  // ponytail: D26 Phase 2 — EventBus 砍至 Phase 2 恢复
  // get eventBus(): EventBus {
  //   if (!this._eventBus) {
  //     throw new Error('CoreApp not bootstrapped. Call bootstrap() first.')
  //   }
  //   return this._eventBus
  // }

  get cronManager(): CronManager {
    if (!this._cronManager) {
      throw new Error('CoreApp not bootstrapped. Call bootstrap() first.')
    }
    return this._cronManager
  }

  // ponytail: D26 Phase 2 — FileUpload 砍至 Phase 2 恢复
  // get fileUploadService(): FileUploadService {
  //   if (!this._fileUploadService) {
  //     throw new Error('CoreApp not bootstrapped. Call bootstrap() first.')
  //   }
  //   return this._fileUploadService
  // }

  // ponytail: D26 Phase 2 — Notification 砍至 Phase 2 恢复
  // get notificationManager(): NotificationManager {
  //   if (!this._notificationManager) {
  //     throw new Error('CoreApp not bootstrapped. Call bootstrap() first.')
  //   }
  //   return this._notificationManager
  // }

  // ponytail: D26 Phase 2 — ApiVersioning 砍至 Phase 2 恢复
  // get apiVersionRouter(): ApiVersionRouter {
  //   if (!this._apiVersionRouter) {
  //     throw new Error('CoreApp not bootstrapped. Call bootstrap() first.')
  //   }
  //   return this._apiVersionRouter
  // }

  // ponytail: D26 Phase 2 — DataExtends 砍至 Phase 2 恢复
  // get collectionRegistry(): CollectionRegistry {
  //   if (!this._collectionRegistry) {
  //     throw new Error('CoreApp not bootstrapped. Call bootstrap() first.')
  //   }
  //   return this._collectionRegistry
  // }

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
    const authDb = createAuthDbAdapter(db)
    this._authService = new AuthService(authDb as never, this.config.AUDE_JWT_SECRET)
    this._auditService = new AuditService(db as never)
    // RBACService wired on-demand in routes via requireAuth

    // ponytail: D26 Phase 2 — EventBus 砍至 Phase 2 恢复
    // this._eventBus = new EventBus({
    //   partition: 'SYSTEM',
    //   logger: { error: (msg: string, err?: unknown) => this.logger.error({ err }, msg) },
    // })

    this._cronManager = new CronManager({
      connection: this.config.REDIS_URL ?? 'redis://localhost:6379',
      logger: {
        info: (msg: string) => this.logger.info({}, msg),
        error: (msg: string, err?: unknown) => this.logger.error({ err }, msg),
        warn: (msg: string) => this.logger.warn({}, msg),
      },
    })

    // ponytail: D26 Phase 2 — Notification/ApiVersioning/DataExtends 砍至 Phase 2 恢复
    // this._notificationManager = new NotificationManager()
    // this._apiVersionRouter = new ApiVersionRouter()
    // this._apiVersionRouter.registerVersion(1)
    // this._collectionRegistry = new CollectionRegistry()

    // ponytail: D26 Phase 2 — FileUpload 砍至 Phase 2 恢复
    // const dbRepo: AttachmentRepository = { ... } — see D26 archive
    // await mkdir('/tmp/audebase-uploads', { recursive: true })
    // this._fileUploadService = new FileUploadService(dbRepo, {
    //   storageDir: '/tmp/audebase-uploads',
    // })

    // --- Fastify ---
    const app = Fastify({
      logger: false,
    })
    this._fastify = app

    // --- Seed/Bootstrap ---
    await this.runBootstrap(db)

    // --- Plugin loading (Phase 1a: register plugin-core only) ---
    await this.registerCorePlugin(db)

    // --- Load tenant cache for slug -> UUID resolution ---
    const tenantRows = await db.select({ id: tenants.id, slug: tenants.slug }).from(tenants)
    for (const t of tenantRows) {
      this._tenantCache.set(t.slug, t.id)
      this._tenantCache.set(t.id, t.id) // also accept raw UUID
    }

    // 1. CORS
    await app.register(cors, this.createCorsConfig())

    // 2. Request ID
    app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
      const requestIdMiddleware = createRequestIdMiddleware()
      await requestIdMiddleware(request as unknown as Parameters<typeof requestIdMiddleware>[0], reply as unknown as Parameters<typeof requestIdMiddleware>[1])
    })

    // 3. Rate limit
    const rateLimiter = new RateLimiter({ windowMs: 60_000, max: 100 })
    const rateLimitMiddleware = createRateLimitMiddleware(rateLimiter)
    app.addHook('onRequest', (request: FastifyRequest, reply: FastifyReply, done: () => void) => {
      rateLimitMiddleware(request, reply)
      done()
    })

    // 3b. Multi-tenant middleware (after rate-limit, before auth)
    app.addHook('onRequest', (request: FastifyRequest, _reply: FastifyReply, done: () => void) => {
      const tenantHeader = request.headers['x-tenant-id']
      const raw = typeof tenantHeader === 'string' && tenantHeader.length > 0 ? tenantHeader : null
      // Resolve slug -> UUID via cache; fall back to raw if not found (may be UUID)
      const tenantId = raw ? (this._tenantCache.get(raw) ?? raw) : null
      ;(request as unknown as { tenantId: string | null }).tenantId = tenantId
      done()
    })

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
    const healthService = new HealthCheckService(
      { execute: async (sqlStr: string) => sql.unsafe(sqlStr) },
      this._redis,
      Date.now(),
      '0.1.0',
    )
    registerHealthRoutes(app, healthService)

    // 6. API routes
    this.registerApiRoutes(app)

    this.logger.info({ port: this.config.PORT }, 'CoreApp bootstrapped')
  }

  /**
   * Run bootstrap seed if not already complete.
   * Inserts system tenant, admin user, roles, permissions, and mappings.
   */
  private async runBootstrap(db: DrizzleDB): Promise<void> {
    try {
      const complete = await isBootstrapComplete(db as never)
      if (complete) {
        this.logger.info({}, 'Bootstrap already complete, skipping')
        return
      }
    } catch {
      // Tables might not exist yet - skip bootstrap check and proceed
      this.logger.warn({}, 'Bootstrap check failed, proceeding with seed')
    }

    const data = generateBootstrapData()

    try {
      // Insert system tenant
      await db.insert(tenants).values({
        id: data.systemTenant.id,
        slug: data.systemTenant.slug,
        name: data.systemTenant.name,
        status: data.systemTenant.status,
      })

      // Insert admin user (must_change_password = false to allow login)
      await db.insert(users).values({
        id: data.adminUser.id,
        tenant_id: data.systemTenant.id,
        username: data.adminUser.username,
        password_hash: data.adminUser.passwordHash,
        token_version: data.adminUser.tokenVersion,
        is_active: data.adminUser.isActive,
        must_change_password: false,
      })

      // Insert roles
      for (const role of data.roles) {
        await db.insert(roles).values({
          id: role.id,
          tenant_id: data.systemTenant.id,
          name: role.name,
          slug: role.slug,
          description: role.description,
          is_system: role.isSystem,
        })
      }

      // Insert permissions
      for (const perm of data.permissions) {
        await db.insert(permissions).values({
          id: perm.id,
          tenant_id: data.systemTenant.id,
          action: perm.action,
          resource: perm.resource,
          display_name: perm.description,
        })
      }

      // Insert role-permission mappings
      for (const rp of data.rolePermissions) {
        await db.insert(role_permissions).values({
          role_id: rp.roleId,
          permission_id: rp.permissionId,
        })
      }

      // Insert user-role mapping (admin user -> admin role)
      for (const ur of data.userRoles) {
        await db.insert(user_roles).values({
          user_id: ur.userId,
          role_id: ur.roleId,
          tenant_id: data.systemTenant.id,
        })
      }

      this.logger.info({}, 'Bootstrap data inserted')
    } catch (err) {
      this.logger.error({ err }, 'Bootstrap data insertion failed')
    }
  }

  /**
   * Register plugin-core as a module record (Phase 1a simplified).
   * Full plugin discovery from filesystem is Phase 1b.
   */
  private async registerCorePlugin(db: DrizzleDB): Promise<void> {
    try {
      // Check if plugin-core already registered
      const queryDb = db as unknown as {
        query: { modules: { findFirst: (args?: unknown) => Promise<unknown> } }
      }
      const existing = await queryDb.query.modules.findFirst({
        where: eq(modules.name, '@audebase/plugin-core'),
      })
      if (existing) {
        this.logger.info({}, 'Plugin core already registered')
        return
      }

      await db.insert(modules).values({
        name: '@audebase/plugin-core',
        version: '1.0.0',
        display_name: '内核插件',
        state: 'enabled',
        category: 'system',
        description: 'AUDEBase 内核插件',
        author: 'AUDEBase',
        license: 'Apache-2.0',
        runtime_mode: 'inline',
        runtime_partition: 'SYSTEM',
        auto_install: true,
      })

      // Resolve dependency order (Phase 1a: only plugin-core, no deps)
      await resolveDependencyOrder([])

      this.logger.info({}, 'Plugin core registered')
    } catch (err) {
      this.logger.error({ err }, 'Plugin core registration failed')
    }
  }

  async start(): Promise<void> {
    if (!this._fastify) {
      await this.bootstrap()
    }
    const app = this._fastify!

    await app.listen({ port: this.config.PORT, host: '0.0.0.0' })
    this.logger.info({ port: this.config.PORT }, 'Server listening')
    await this._cronManager?.start()
  }

  async stop(): Promise<void> {
    this.logger.info({}, 'Shutting down')

    if (this._fastify) {
      await this._fastify.close()
      this._fastify = null
    }
    await this._cronManager?.stop()
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
    const allowedHeaders = ['Authorization', 'Content-Type', 'X-Request-ID', 'X-Tenant-Id']
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
      const loginLimit = checkLoginRateLimit(request.ip)
      if (!loginLimit.allowed) {
        return reply.code(429).header('Retry-After', String(loginLimit.retryAfter)).send(loginRateLimitBody())
      }
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

    // GET /api/auth/me — lightweight token validation, returns current user info
    app.get('/api/auth/me', {
      onRequest: [authHook],
    }, async (request, reply) => {
      const user = (request as unknown as { user?: { sub?: string; username?: string; tenant_id?: string; roles?: string[] } }).user
      if (!user) {
        return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } })
      }
      return reply.send({
        user: {
          id: user.sub,
          username: user.username,
          tenant_id: user.tenant_id,
          roles: user.roles ?? [],
        },
      })
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
        const results = await this._db!.select().from(audit_log).limit(pageSize).offset((page - 1) * pageSize)
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

    // --- RBAC routes ---
    app.post('/api/roles', {
      onRequest: [authHook],
    }, async (request, reply) => {
      const body = request.body as { name?: string; slug?: string; description?: string }
      if (!body?.name || !body?.slug) {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'name and slug required' },
        })
      }
      const tenantId = (request as unknown as { tenantId: string | null }).tenantId
      try {
        const db = this._db!
        const [created] = await db.insert(roles).values({
          name: body.name,
          slug: body.slug,
          description: body.description ?? null,
          tenant_id: tenantId,
        }).returning()
        return reply.code(201).send({ data: created })
      } catch (err) {
        return this.handleError(err, reply as ReplyLike)
      }
    })

    app.get('/api/roles', {
      onRequest: [authHook],
    }, async (request, reply) => {
      const query = request.query as { page?: string; pageSize?: string }
      const page = query.page ? parseInt(query.page, 10) : 1
      const pageSize = query.pageSize ? parseInt(query.pageSize, 10) : 20
      const tenantId = (request as unknown as { tenantId: string | null }).tenantId
      try {
        const queryDb = this._db as unknown as {
          query: { roles: { findMany: (args?: unknown) => Promise<unknown[]> } }
        }
        const result = await queryDb.query.roles.findMany({
          where: tenantId ? eq(roles.tenant_id, tenantId) : undefined,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        })
        return reply.send({ data: result, page, pageSize })
      } catch (err) {
        return this.handleError(err, reply as ReplyLike)
      }
    })

    app.post('/api/users/:id/roles', {
      onRequest: [authHook],
    }, async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = request.body as { role_id?: string }
      if (!body?.role_id) {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'role_id required' },
        })
      }
      const tenantId = (request as unknown as { tenantId: string | null }).tenantId
      try {
        const db = this._db!
        await db.insert(user_roles).values({
          user_id: id,
          role_id: body.role_id,
          tenant_id: tenantId ?? '',
        })
        return reply.code(201).send({ data: { user_id: id, role_id: body.role_id } })
      } catch (err) {
        return this.handleError(err, reply as ReplyLike)
      }
    })

    app.get('/api/users/:id/roles', {
      onRequest: [authHook],
    }, async (request, reply) => {
      const { id } = request.params as { id: string }
      try {
        const queryDb = this._db as unknown as {
          query: { user_roles: { findMany: (args?: unknown) => Promise<unknown[]> } }
        }
        const result = await queryDb.query.user_roles.findMany({
          where: eq(user_roles.user_id, id),
        })
        return reply.send({ data: result })
      } catch (err) {
        return this.handleError(err, reply as ReplyLike)
      }
    })

    // --- Tenants list ---
    app.get('/api/tenants', {
      onRequest: [authHook],
    }, async (_request, reply) => {
      try {
        const result = await (this._db as unknown as {
          query: { tenants: { findMany: (args?: unknown) => Promise<unknown[]> } }
        }).query.tenants.findMany()
        const tenantList = (result as Array<{ id: string; name: string }>).map((t) => ({ id: t.id, name: t.name }))
        return reply.send({ data: tenantList })
      } catch (err) {
        return this.handleError(err, reply as ReplyLike)
      }
    })

    // --- User CRUD ---
    app.post('/api/users', {
      onRequest: [authHook],
    }, async (request, reply) => {
      const body = request.body as {
        username?: string
        password?: string
        email?: string
        display_name?: string
      }
      if (!body?.username || !body?.password) {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'username and password required' },
        })
      }
      const tenantId = (request as unknown as { tenantId: string | null }).tenantId
      const userId = (request as unknown as { user?: { sub?: string } }).user?.sub ?? null
      try {
        const passwordHash = await hash(body.password, 12)
        const [created] = await this._db!.insert(users).values({
          tenant_id: tenantId ?? '',
          username: body.username,
          password_hash: passwordHash,
          email: body.email ?? null,
          display_name: body.display_name ?? null,
          created_by: userId,
          updated_by: userId,
        }).returning()
        const { password_hash: _ph, ...safe } = created as Record<string, unknown>
        return reply.code(201).send({ data: safe })
      } catch (err) {
        return this.handleError(err, reply as ReplyLike)
      }
    })

    app.put('/api/users/:id', {
      onRequest: [authHook],
    }, async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = request.body as {
        username?: string
        email?: string
        display_name?: string
        is_active?: boolean
      }
      const userId = (request as unknown as { user?: { sub?: string } }).user?.sub ?? null
      const updates: Record<string, unknown> = { updated_at: new Date(), updated_by: userId }
      if (body.username !== undefined) updates.username = body.username
      if (body.email !== undefined) updates.email = body.email
      if (body.display_name !== undefined) updates.display_name = body.display_name
      if (body.is_active !== undefined) updates.is_active = body.is_active
      try {
        const [updated] = await this._db!.update(users).set(updates as never).where(eq(users.id, id)).returning()
        if (!updated) {
          return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } })
        }
        const { password_hash: _ph, ...safe } = updated as Record<string, unknown>
        return reply.send({ data: safe })
      } catch (err) {
        return this.handleError(err, reply as ReplyLike)
      }
    })

    app.delete('/api/users/:id', {
      onRequest: [authHook],
    }, async (request, reply) => {
      const { id } = request.params as { id: string }
      const userId = (request as unknown as { user?: { sub?: string } }).user?.sub ?? null
      try {
        await this._db!.update(users).set({
          is_active: false,
          updated_at: new Date(),
          updated_by: userId,
        } as never).where(eq(users.id, id))
        return reply.code(204).send()
      } catch (err) {
        return this.handleError(err, reply as ReplyLike)
      }
    })

    // --- Role update/delete ---
    app.put('/api/roles/:id', {
      onRequest: [authHook],
    }, async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = request.body as { name?: string; description?: string }
      const updates: Record<string, unknown> = { updated_at: new Date() }
      if (body.name !== undefined) updates.name = body.name
      if (body.description !== undefined) updates.description = body.description
      try {
        const [updated] = await this._db!.update(roles).set(updates as never).where(eq(roles.id, id)).returning()
        if (!updated) {
          return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Role not found' } })
        }
        return reply.send({ data: updated })
      } catch (err) {
        return this.handleError(err, reply as ReplyLike)
      }
    })

    app.delete('/api/roles/:id', {
      onRequest: [authHook],
    }, async (request, reply) => {
      const { id } = request.params as { id: string }
      try {
        await this._db!.delete(roles).where(eq(roles.id, id))
        return reply.code(204).send()
      } catch (err) {
        return this.handleError(err, reply as ReplyLike)
      }
    })

    // --- Plugin enable/disable ---
    app.post('/api/plugins/:id/enable', {
      onRequest: [authHook],
    }, async (request, reply) => {
      const { id } = request.params as { id: string }
      try {
        const [updated] = await this._db!.update(modules).set({
          state: 'enabled',
          updated_at: new Date(),
        } as never).where(eq(modules.id, id)).returning()
        if (!updated) {
          return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Plugin not found' } })
        }
        return reply.send({ data: updated })
      } catch (err) {
        return this.handleError(err, reply as ReplyLike)
      }
    })

    app.post('/api/plugins/:id/disable', {
      onRequest: [authHook],
    }, async (request, reply) => {
      const { id } = request.params as { id: string }
      try {
        const [updated] = await this._db!.update(modules).set({
          state: 'disabled',
          updated_at: new Date(),
        } as never).where(eq(modules.id, id)).returning()
        if (!updated) {
          return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Plugin not found' } })
        }
        return reply.send({ data: updated })
      } catch (err) {
        return this.handleError(err, reply as ReplyLike)
      }
    })
    // --- Log routes ---
    registerLogRoutes(app, authHook)

    // --- GraphQL endpoint ---
    registerGraphQLRoute(app, this._db!, this.logger, { authHook })

    // ponytail: D26 Phase 2 — FileUpload routes 砍至 Phase 2 恢复
    // app.post('/api/files/upload', ...) { ... }
    // app.get('/api/files/:id', ...) { ... }
    // app.get('/api/files', ...) { ... }
    // app.delete('/api/files/:id', ...) { ... }
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
