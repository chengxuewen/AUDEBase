import { eq } from "drizzle-orm";
import type { FastifyRequest, FastifyReply } from "fastify";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { ErrorCode, UserError } from "@audebase/shared-types";
import type { JwtPayload } from "@audebase/shared-types";
import { users } from "../db/schema/users";
import { verifyAccessToken } from "./tokens";

/**
 * 认证后挂载到 request 上的用户信息
 */
export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  username: string;
  roles: string[];
  tokenVersion: number;
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
 * 创建认证中间件
 *
 * 从 Authorization header 提取 Bearer token，
 * 验证 JWT，检查用户存在且激活，将用户信息挂载到 request.user。
 */
export function createAuthMiddleware(
  db: NodePgDatabase,
  jwtSecret: string,
): (request: FastifyRequest, _reply: FastifyReply) => Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    // 提取 Authorization header
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      throw new UserError(ErrorCode.AUTH_TOKEN_INVALID, "缺少认证信息");
    }

    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      throw new UserError(ErrorCode.AUTH_TOKEN_INVALID, "认证格式无效");
    }

    const token = parts[1];
    if (!token) {
      throw new UserError(ErrorCode.AUTH_TOKEN_INVALID, "认证信息缺失");
    }

    // 验证 JWT
    let payload: JwtPayload;
    try {
      payload = verifyAccessToken(token, jwtSecret);
    } catch {
      throw new UserError(ErrorCode.AUTH_TOKEN_EXPIRED, "Token 无效或已过期");
    }

    // 检查用户存在且激活
    const [foundUser] = await db
      .select({
        id: users.id,
        is_active: users.is_active,
        token_version: users.token_version,
      })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (!foundUser) {
      throw new UserError(ErrorCode.AUTH_TOKEN_INVALID, "用户不存在");
    }

    if (!foundUser.is_active) {
      throw new UserError(ErrorCode.FORBIDDEN, "帐号已被禁用");
    }

    // 挂载用户信息
    request.user = {
      userId: foundUser.id,
      tenantId: payload.tenant_id,
      username: payload.username,
      roles: payload.roles,
      tokenVersion: foundUser.token_version,
    };
  };
}
