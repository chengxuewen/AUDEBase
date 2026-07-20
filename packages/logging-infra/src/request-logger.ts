import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import type { RequestLogEntry } from "./types";
import { createLogger } from "./logger";

/**
 * 请求日志 Fastify 插件。
 *
 * 注入 X-Request-ID 头，记录每个 HTTP 请求的方法、URL、状态码、响应时间。
 * 自动脱敏敏感 header（Authorization, Cookie 等）。
 *
 * 用法: `await createRequestLogger(app, logger)` 或 `await app.register(createRequestLogger)`
 *
 * @param server — Fastify 实例
 * @param _optsOrLogger — 可选的外部 pino logger；传 Logger 实例时直接使用，否则内部创建
 */
export function createRequestLogger(
  server: FastifyInstance,
  _optsOrLogger?: Record<string, unknown> | Logger,
): void {
  // 判断第二个参数是 Logger 实例还是 Fastify options object
  const logger: Logger =
    _optsOrLogger && typeof (_optsOrLogger as Logger).level === "string"
      ? (_optsOrLogger as Logger)
      : createLogger({ name: "http" });

  // onRequest: 注入 X-Request-ID
  server.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = (request.headers["x-request-id"] as string | undefined) ?? randomUUID();

    reply.header("X-Request-ID", requestId);
    // 将 requestId 挂到 request 上供后续 handler 使用
    (request as unknown as Record<string, unknown>).requestId = requestId;
  });

  // onResponse: 记录请求日志
  server.addHook("onResponse", async (request: FastifyRequest, reply: FastifyReply) => {
    const reqExt = request as unknown as Record<string, unknown>;

    const entry: RequestLogEntry = {
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: Math.round(reply.elapsedTime),
      requestId: (reqExt.requestId as string | undefined) ?? request.id,
    };

    // 从认证后挂载的 user 对象提取 userId
    const user = reqExt.user as { id?: string } | undefined;
    if (user?.id) {
      entry.userId = user.id;
    }

    // 从请求上下文提取 tenantId（认证中间件注入）
    if (typeof reqExt.tenantId === "string") {
      entry.tenantId = reqExt.tenantId;
    }

    logger.info(entry, "request completed");
  });
}
