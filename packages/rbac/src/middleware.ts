import type { FastifyRequest, FastifyReply } from "fastify";
import { ErrorCode, UserError } from "@audebase/shared-types";
import type { PermissionEngine } from "./engine";

/**
 * 认证后挂载到 request 上的用户信息
 */
export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  username: string;
  roles: string[];
}

/**
 * Fastify Request 类型扩展
 */
declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

/**
 * rbacGuard — 权限校验中间件工厂
 *
 * 使用示例：
 *   fastify.get('/api/users', { preHandler: rbacGuard(engine, 'read', 'user') }, handler)
 *   fastify.post('/api/users', { preHandler: rbacGuard(engine, 'create', 'user') }, handler)
 *
 * 流程：
 * 1. 确保 request 已通过认证中间件（request.user 已设置）
 * 2. 调用 PermissionEngine.can() 检查权限
 * 3. 失败 → 返回 403 FORBIDDEN
 *
 * @param engine — PermissionEngine 实例
 * @param action — 所需权限动作
 * @param resource — 资源名
 * @returns Fastify preHandler 函数
 */
export function rbacGuard(
  engine: PermissionEngine,
  action: string,
  resource: string,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    // 确保认证中间件已设置 request.user
    if (!request.user) {
      throw new UserError(ErrorCode.AUTH_TOKEN_INVALID, "缺少认证信息");
    }

    const hasPermission = await engine.can(request.user.userId, action, resource);

    if (!hasPermission) {
      throw new UserError(ErrorCode.FORBIDDEN, `无权限执行 ${action} 操作于 ${resource}`);
    }
  };
}
