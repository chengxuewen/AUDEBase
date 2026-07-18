import { count, eq } from "drizzle-orm";
import type { FastifyRequest, FastifyReply, FastifyInstance } from "fastify";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { modules } from "../db/schema/modules";

/**
 * Tenant 扩展 — 挂载到 Fastify Request 对象
 */
declare module "fastify" {
  interface FastifyRequest {
    /** 当前请求的 tenant_id（由 tenant middleware 注入） */
    tenantId?: string;
  }
}

/** UUID regex for tenant_id validation */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 不需要租户上下文的路由前缀 */
const PUBLIC_PATHS = ["/health", "/health/ready"] as const;

/**
 * 从请求中提取 tenant_id
 *
 * 优先级：
 *   1. X-Tenant-Id header
 *   2. tenant_id query parameter
 *   3. 路径前缀 /t/{tenantId}/... (待 Phase 2 URL 路由启用)
 */
function extractTenantId(request: FastifyRequest): string | null {
  // 1. X-Tenant-Id header
  const headerValue = request.headers["x-tenant-id"];
  if (typeof headerValue === "string" && headerValue.length > 0) {
    return headerValue;
  }

  // 2. query parameter
  const queryValue = getQueryParam(request, "tenant_id");
  if (queryValue) {
    return queryValue;
  }

  return null;
}

/** ponytail: Fastify 5 inject test compat — query is a string for injected requests */
function getQueryParam(request: FastifyRequest, name: string): string | null {
  const query = request.query as Record<string, unknown>;
  const raw = query[name];
  if (typeof raw === "string" && raw.length > 0) {
    return raw;
  }
  return null;
}

/**
 * 判断请求路径是否为无需租户的公开端点
 */
function isPublicPath(request: FastifyRequest): boolean {
  const url = request.url;
  return PUBLIC_PATHS.some((path) => url.startsWith(path));
}

/**
 * 创建多租户中间件
 *
 * 在 onRequest 阶段提取并验证 tenant_id，
 * 挂载到 `request.tenantId` 供下游使用。
 *
 * 公开端点（/health, /health/ready）跳过租户检查。
 *
 * @param db — Drizzle ORM 数据库实例
 * @param logger — Fastify pino logger
 * @returns Fastify onRequest hook
 */
export function createTenantMiddleware(
  db: NodePgDatabase,
  logger: FastifyRequest["log"],
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    // 公开端点跳过
    if (isPublicPath(request)) {
      logger.debug({ url: request.url }, "tenant middleware skipped (public path)");
      return;
    }

    const tenantId = extractTenantId(request);

    if (!tenantId) {
      logger.warn({ url: request.url }, "tenant middleware: no tenant_id found");
      reply.status(400).send({
        error: {
          code: "TENANT_REQUIRED",
          message: "缺少租户标识。请在请求头中添加 X-Tenant-Id",
        },
      });
      return;
    }

    // 校验 UUID 格式
    if (!UUID_PATTERN.test(tenantId)) {
      logger.warn({ tenantId, url: request.url }, "tenant middleware: invalid tenant_id format");
      reply.status(400).send({
        error: {
          code: "TENANT_REQUIRED",
          message: "租户标识格式无效，需要 UUID",
        },
      });
      return;
    }

    // 检查租户是否存在（modules 表中有该 tenant_id 即视为租户已初始化）
    try {
      const [result] = await db
        .select({ cnt: count() })
        .from(modules)
        .where(eq(modules.tenant_id, tenantId));

      if (!result || result.cnt === 0) {
        logger.warn({ tenantId, url: request.url }, "tenant middleware: tenant not found");
        reply.status(404).send({
          error: {
            code: "TENANT_NOT_FOUND",
            message: `租户不存在: ${tenantId}`,
          },
        });
        return;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ tenantId, err: msg }, "tenant middleware: db check failed");
      reply.status(503).send({
        error: {
          code: "GENERAL_DB_UNAVAILABLE",
          message: "数据库查询失败，无法验证租户",
        },
      });
      return;
    }

    // 挂载 tenant_id
    request.tenantId = tenantId;
    logger.debug({ tenantId }, "tenant middleware: tenant_id attached");
  };
}

/**
 * 注册租户中间件
 *
 * ponytail: 简化版 — 直接注册 onRequest hook。
 * 如需更复杂的生命周期管理（如租户切换钩子），后续扩展。
 */
export function registerTenantMiddleware(app: FastifyInstance, db: NodePgDatabase): void {
  const middleware = createTenantMiddleware(db, app.log);
  app.addHook("onRequest", middleware);
  app.log.info("tenant middleware registered");
}
