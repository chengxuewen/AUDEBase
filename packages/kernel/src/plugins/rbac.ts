import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { PermissionEngine } from "@audebase/rbac";
import { ErrorCode, UserError } from "@audebase/shared-types";

// Module-level engine reference, set during plugin registration
let engine: PermissionEngine | null = null;

/**
 * Get the current engine instance (for testing / introspection).
 *
 * @internal
 */
export function getEngine(): PermissionEngine | null {
  return engine;
}

declare module "fastify" {
  interface FastifyInstance {
    permission: PermissionEngine;
  }
  interface FastifyRequest {
    rbac: null;
  }
}

/** Plugin registration options */
export interface RbacPluginOptions {
  db: NodePgDatabase;
}

/**
 * rbacGuard — 权限校验 preHandler 工厂
 *
 * 与认证中间件配合使用:
 *   fastify.get('/api/users', {
 *     preHandler: [authMiddleware, rbacGuard('read', 'user')]
 *   }, handler)
 *
 * 流程:
 * 1. request.user 已由认证中间件设置
 * 2. 调用 PermissionEngine.can(userId, action, resource)
 * 3. 失败 → 403 FORBIDDEN
 */
export function rbacGuard(
  action: string,
  resource: string,
): (request: FastifyRequest, _reply: FastifyReply) => Promise<void> {
  return async function rbacPreHandler(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    if (!engine) {
      throw new UserError(ErrorCode.GENERAL_INTERNAL_ERROR, "RBAC 引擎未初始化");
    }

    if (!request.user) {
      throw new UserError(ErrorCode.AUTH_TOKEN_INVALID, "缺少认证信息");
    }

    const hasPermission = await engine.can(request.user.userId, action, resource);

    if (!hasPermission) {
      throw new UserError(ErrorCode.FORBIDDEN, "无权限");
    }
  };
}

/**
 * rbacPlugin — Fastify RBAC 插件
 *
 * 注册后:
 * - fastify.permission → PermissionEngine 实例
 * - request.rbac → null（占位，供未来扩展）
 */
function rbacPlugin(fastify: FastifyInstance, options: RbacPluginOptions): void {
  engine = new PermissionEngine(options.db);

  fastify.decorate("permission", engine);
  fastify.decorateRequest("rbac", null);
}

export default fp(rbacPlugin, {
  name: "audebase-rbac",
  fastify: "5.x",
});
