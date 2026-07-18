import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { AuditService, auditCapture } from "@audebase/audit";
import type { AuditDatabase } from "@audebase/audit";

// Module-level service reference, set during plugin registration
let service: AuditService | null = null;

declare module "fastify" {
  interface FastifyInstance {
    audit: AuditService;
  }
}

/** Plugin registration options */
export interface AuditPluginOptions {
  db: AuditDatabase;
}

/**
 * auditPlugin — Fastify 审计日志插件
 *
 * 注册 onResponse hook，自动捕获 POST/PUT/PATCH/DELETE 2xx 请求的审计事件。
 * 审计写入是非阻塞的（fire-and-forget），API 响应不受审计日志影响。
 *
 * 排除 /api/health, /api/audit-logs
 */
function auditPlugin(fastify: FastifyInstance, options: AuditPluginOptions): void {
  service = new AuditService(options.db);

  fastify.decorate("audit", service);

  // Register non-blocking audit hook on every response
  fastify.addHook(
    "onResponse",
    auditCapture(service.log.bind(service), {
      excludePaths: ["/api/health", "/api/audit-logs"],
    }),
  );
}

export default fp(auditPlugin, {
  name: "audebase-audit",
  fastify: "5.x",
});
