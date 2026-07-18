import { eq, and, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyBaseLogger } from "fastify";
import { ErrorCode, UserError } from "@audebase/shared-types";
import type {
  LoginRequest,
  LoginResponse,
  RefreshRequest,
  RefreshResponse,
} from "@audebase/shared-types";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { users } from "../db/schema/users";
import { refreshTokens } from "../db/schema/refresh_tokens";
import { verifyPassword } from "./passwords";
import {
  createAccessToken,
  createRefreshToken,
  hashRefreshToken,
  ACCESS_TOKEN_EXPIRY_SECONDS,
} from "./tokens";

/** Refresh token 过期时间（7 天） */
const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 注册认证路由到 Fastify 实例
 *
 * - POST /api/auth/login
 * - POST /api/auth/refresh
 * - POST /api/auth/logout
 */
export function registerAuthRoutes(
  app: FastifyInstance,
  db: NodePgDatabase,
  jwtSecret: string,
  logger: FastifyBaseLogger,
): void {
  /**
   * POST /api/auth/login
   */
  app.post("/api/auth/login", async (request): Promise<LoginResponse> => {
    const body = request.body as LoginRequest;

    if (!body || typeof body.username !== "string" || typeof body.password !== "string") {
      throw new UserError(ErrorCode.VALIDATION_ERROR, "用户名和密码为必填项");
    }

    const [foundUser] = await db
      .select()
      .from(users)
      .where(eq(users.username, body.username))
      .limit(1);

    if (!foundUser) {
      throw new UserError(ErrorCode.AUTH_INVALID_CREDENTIALS, "用户名或密码错误");
    }

    const isValid = await verifyPassword(body.password, foundUser.password_hash);
    if (!isValid) {
      throw new UserError(ErrorCode.AUTH_INVALID_CREDENTIALS, "用户名或密码错误");
    }

    if (!foundUser.is_active) {
      throw new UserError(ErrorCode.FORBIDDEN, "帐号已被禁用");
    }

    // ponytail: 角色查询延迟到 RBAC 模块完成后集成
    const userRoles: string[] = [];

    const accessToken = createAccessToken(
      {
        sub: foundUser.id,
        tenant_id: foundUser.tenant_id,
        username: foundUser.username,
        roles: userRoles,
      },
      jwtSecret,
    );

    const rawRefreshToken = createRefreshToken();
    const tokenHash = hashRefreshToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);

    await db.insert(refreshTokens).values({
      user_id: foundUser.id,
      tenant_id: foundUser.tenant_id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

    logger.info({ userId: foundUser.id, username: foundUser.username }, "user login");

    return {
      access_token: accessToken,
      refresh_token: rawRefreshToken,
      expires_in: ACCESS_TOKEN_EXPIRY_SECONDS,
      token_type: "Bearer",
      user: {
        id: foundUser.id,
        tenant_id: foundUser.tenant_id,
        username: foundUser.username,
        display_name: foundUser.display_name ?? foundUser.username,
        must_change_password: foundUser.must_change_password,
        roles: userRoles,
      },
    };
  });

  /**
   * POST /api/auth/refresh
   */
  app.post("/api/auth/refresh", async (request): Promise<RefreshResponse> => {
    const body = request.body as RefreshRequest;

    if (!body || typeof body.refresh_token !== "string") {
      throw new UserError(ErrorCode.VALIDATION_ERROR, "refresh_token 为必填项");
    }

    const tokenHash = hashRefreshToken(body.refresh_token);

    const [foundToken] = await db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.token_hash, tokenHash),
          sql`${refreshTokens.revoked_at} IS NULL`,
          sql`${refreshTokens.expires_at} > NOW()`,
        ),
      )
      .limit(1);

    if (!foundToken) {
      throw new UserError(ErrorCode.AUTH_TOKEN_INVALID, "refresh_token 无效或已过期");
    }

    const [foundUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, foundToken.user_id))
      .limit(1);

    if (!foundUser || !foundUser.is_active) {
      throw new UserError(ErrorCode.FORBIDDEN, "帐号已被禁用");
    }

    // 撤销旧 refresh token
    await db
      .update(refreshTokens)
      .set({ revoked_at: new Date() })
      .where(eq(refreshTokens.id, foundToken.id));

    const userRoles: string[] = [];

    const accessToken = createAccessToken(
      {
        sub: foundUser.id,
        tenant_id: foundUser.tenant_id,
        username: foundUser.username,
        roles: userRoles,
      },
      jwtSecret,
    );

    const newRefreshToken = createRefreshToken();
    const newTokenHash = hashRefreshToken(newRefreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);

    await db.insert(refreshTokens).values({
      user_id: foundUser.id,
      tenant_id: foundUser.tenant_id,
      token_hash: newTokenHash,
      expires_at: expiresAt,
    });

    return {
      access_token: accessToken,
      refresh_token: newRefreshToken,
      expires_in: ACCESS_TOKEN_EXPIRY_SECONDS,
      token_type: "Bearer",
    };
  });

  /**
   * POST /api/auth/logout
   */
  app.post("/api/auth/logout", async (request): Promise<{ success: boolean }> => {
    const body = request.body as { refresh_token?: string };

    if (!body || typeof body.refresh_token !== "string") {
      throw new UserError(ErrorCode.VALIDATION_ERROR, "refresh_token 为必填项");
    }

    const tokenHash = hashRefreshToken(body.refresh_token);

    await db
      .update(refreshTokens)
      .set({ revoked_at: new Date() })
      .where(
        and(eq(refreshTokens.token_hash, tokenHash), sql`${refreshTokens.revoked_at} IS NULL`),
      );

    logger.info({}, "user logout");

    return { success: true };
  });
}
