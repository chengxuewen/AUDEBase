import { randomUUID } from "node:crypto";
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import fastifyRateLimit from "@fastify/rate-limit";
import { ErrorCode, UserError } from "@audebase/shared-types";
import { loadConfig, type KernelConfig } from "./config";
import { createDatabaseProvider, type DatabaseProvider } from "./db";
import { startupPipeline } from "./startup";
import { registerHealthRoutes } from "./health/routes";
import rbacPlugin from "./plugins/rbac";
import i18nPlugin from "./plugins/i18n";

/**
 * 内核应用实例
 */
export interface KernelApp {
  readonly server: FastifyInstance;
  readonly db: DatabaseProvider;
  readonly config: KernelConfig;
  readonly logger: FastifyBaseLogger;
}

interface KernelOptions {
  /** 覆盖配置（用于测试） */
  config?: Partial<KernelConfig>;
  /** mock DB provider（用于测试） */
  dbProvider?: DatabaseProvider;
  /** 跳过插件注册（用于单元测试隔离） */
  skipPlugins?: boolean;
}

/**
 * 创建 AUDEBase 内核应用
 *
 * 返回已注册所有路由和中间件的 Fastify 实例，
 * 调用方负责调用 .listen() 启动服务器。
 */
export async function createKernelApp(options: KernelOptions = {}): Promise<KernelApp> {
  // 1. 加载并校验配置
  const config = loadConfig(
    options.config
      ? {
          ...process.env,
          ...Object.fromEntries(Object.entries(options.config).map(([k, v]) => [k, String(v)])),
        }
      : process.env,
  );

  // 2. 校验 JWT 密钥
  validateJwtSecret(config.AUDE_JWT_SECRET);

  // 3. 创建 Fastify 实例（内置 pino logger）
  const server = Fastify({
    logger: {
      level: config.AUDE_LOG_LEVEL,
      ...(config.AUDE_LOG_PRETTY
        ? {
            transport: {
              target: "pino-pretty",
              options: { colorize: true, translateTime: "SYS:standard" },
            },
          }
        : {}),
    },
    genReqId: (): string => randomUUID(),
  });

  const logger = server.log;

  // 4. 创建数据库 Provider
  const db =
    options.dbProvider ??
    createDatabaseProvider({
      connectionString: config.DATABASE_URL,
      logger,
    });

  // 4.5 启动管道：清单验证 → 迁移 → 插件框架加载 → plugin-core 引导
  const startupResult = await startupPipeline(db, logger, {
    skipPlugins: options.skipPlugins,
  });
  logger.info({ startupResult }, "startup pipeline complete");

  // 5. 注入 X-Request-ID 到响应头
  server.addHook("onRequest", async (request, reply) => {
    reply.header("X-Request-ID", request.id);
  });

  // 6. 速率限制
  await server.register(fastifyRateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  // 7. 注册健康检查路由（无认证）
  registerHealthRoutes(server, () => db.checkHealth(), {
    startTime: Date.now(),
    version: "0.1.0",
  });

  // 7.5 注册 RBAC 权限插件（测试可跳过）
  if (!options.skipPlugins) {
    try {
      await server.register(rbacPlugin, { db: db.db });
    } catch (err: unknown) {
      logger.error({ err }, "rbac plugin registration failed");
    }
  }

  // 7.6 注册 i18n 国际化插件（测试可跳过）
  if (!options.skipPlugins) {
    try {
      await server.register(i18nPlugin, { config: { defaultLocale: "zh" } });
    } catch (err: unknown) {
      logger.error({ err }, "i18n plugin registration failed");
    }
  }

  // 8. 优雅关闭
  const shutdown = async (): Promise<void> => {
    logger.info("shutting down kernel");
    await server.close();
    await db.close();
  };

  process.on("SIGTERM", () => {
    void shutdown();
  });
  process.on("SIGINT", () => {
    void shutdown();
  });

  // 9. 全局错误中间件
  server.setErrorHandler((rawError: unknown, _request, reply) => {
    const error = rawError as Record<string, unknown> & { statusCode?: number };

    // @fastify/rate-limit 错误（statusCode=429 的 FastifyError）
    if (typeof error.statusCode === "number" && error.statusCode === 429) {
      return reply.status(429).send({
        error: {
          code: ErrorCode.RATE_LIMIT_EXCEEDED,
          message: "请求过于频繁，请稍后再试",
        },
      });
    }

    if (rawError instanceof UserError) {
      return reply.status(mapErrorToHttp(rawError.code)).send({
        error: rawError.toJSON(),
      });
    }

    // 系统错误不暴露详情
    logger.error({ err: rawError }, "unhandled error");
    return reply.status(500).send({
      error: {
        code: ErrorCode.GENERAL_INTERNAL_ERROR,
        message: "服务器内部错误",
      },
    });
  });
  return { server, db, config, logger };
}

/**
 * 验证 JWT 密钥
 *
 * 启动时 assert AUDE_JWT_SECRET ≥ 32 字符，拒绝默认值。
 * 防御 CVE-2025-13877（NocoBase 默认 JWT 密钥导致任意用户冒充）。
 */
function validateJwtSecret(secret: string): void {
  if (secret.length < 32) {
    throw new UserError(
      ErrorCode.GENERAL_ASSERTION_FAILED,
      "AUDE_JWT_SECRET must be at least 32 characters",
    );
  }
}

/**
 * 创建并启动内核应用（生产入口）
 */
export async function startKernel(options: KernelOptions = {}): Promise<KernelApp> {
  const app = await createKernelApp(options);
  await app.server.listen({
    port: app.config.PORT,
    host: app.config.HOST,
  });
  return app;
}

/** ErrorCode → HTTP status code 映射 */
function mapErrorToHttp(code: ErrorCode): number {
  const map: Record<string, number> = {
    [ErrorCode.AUTH_INVALID_CREDENTIALS]: 401,
    [ErrorCode.AUTH_TOKEN_EXPIRED]: 401,
    [ErrorCode.AUTH_TOKEN_INVALID]: 401,
    [ErrorCode.AUTH_MUST_CHANGE_PASSWORD]: 403,
    [ErrorCode.FORBIDDEN]: 403,
    [ErrorCode.VALIDATION_ERROR]: 400,
    [ErrorCode.CONFLICT]: 409,
    [ErrorCode.NOT_FOUND]: 404,
    [ErrorCode.RATE_LIMIT_EXCEEDED]: 429,
    [ErrorCode.GENERAL_INTERNAL_ERROR]: 500,
    [ErrorCode.GENERAL_DB_UNAVAILABLE]: 503,
    [ErrorCode.GENERAL_ASSERTION_FAILED]: 500,
    [ErrorCode.GENERAL_TIMEOUT]: 504,
  };
  return map[code] ?? 500;
}
