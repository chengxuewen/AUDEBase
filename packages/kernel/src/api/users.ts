import { eq, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyBaseLogger } from "fastify";
import { ErrorCode, UserError } from "@audebase/shared-types";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { users } from "../db/schema/users";
import { createAuthMiddleware } from "../auth/middleware";
import { rbacGuard } from "../plugins/rbac";
import { hashPassword } from "../auth/passwords";

/** Maximum page size for user listing */
const MAX_LIMIT = 100;
/** Default page size */
const DEFAULT_LIMIT = 20;

/** Public-facing user shape (no password_hash) */
interface UserResponse {
  id: string;
  tenant_id: string;
  username: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  locale: string;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Paginated response envelope */
interface PaginatedUsers {
  data: UserResponse[];
  total: number;
  limit: number;
  offset: number;
}

/** Strip password_hash from a DB row */
function toUserResponse(row: typeof users.$inferSelect): UserResponse {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    username: row.username,
    email: row.email,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    locale: row.locale ?? "zh-CN",
    is_active: row.is_active,
    must_change_password: row.must_change_password,
    last_login_at: row.last_login_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

/**
 * 注册用户 CRUD 路由到 Fastify 实例
 *
 * - GET    /api/users      — 分页列表
 * - GET    /api/users/:id  — 单个用户
 * - POST   /api/users      — 创建用户
 * - PATCH  /api/users/:id  — 更新用户
 * - DELETE /api/users/:id  — 软删除
 */
export function registerUserRoutes(
  app: FastifyInstance,
  db: NodePgDatabase,
  jwtSecret: string,
  logger: FastifyBaseLogger,
): void {
  const requireAuth = createAuthMiddleware(db, jwtSecret);

  /**
   * GET /api/users — 分页用户列表
   */
  app.get(
    "/api/users",
    { preHandler: [requireAuth, rbacGuard("read", "user")] },
    async (request): Promise<PaginatedUsers> => {
      const query = request.query as Record<string, string>;
      const limit = Math.min(
        Math.max(1, parseInt(query.limit ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
        MAX_LIMIT,
      );
      const offset = Math.max(0, parseInt(query.offset ?? "0", 10) || 0);

      const [rows, totalResult] = await Promise.all([
        db.select().from(users).limit(limit).offset(offset).orderBy(users.created_at),
        db.select({ count: sql<number>`count(*)::int` }).from(users),
      ]);

      return {
        data: rows.map(toUserResponse),
        total: totalResult[0]?.count ?? 0,
        limit,
        offset,
      };
    },
  );

  /**
   * GET /api/users/:id — 获取单个用户
   */
  app.get(
    "/api/users/:id",
    { preHandler: [requireAuth, rbacGuard("read", "user")] },
    async (request): Promise<UserResponse> => {
      const params = request.params as { id: string };
      const [foundUser] = await db.select().from(users).where(eq(users.id, params.id)).limit(1);

      if (!foundUser) {
        throw new UserError(ErrorCode.NOT_FOUND, "用户不存在");
      }

      return toUserResponse(foundUser);
    },
  );

  /**
   * POST /api/users — 创建用户
   */
  app.post(
    "/api/users",
    { preHandler: [requireAuth, rbacGuard("create", "user")] },
    async (request, reply): Promise<UserResponse> => {
      const body = request.body as Record<string, unknown>;

      if (!body || typeof body.username !== "string" || !body.username.trim()) {
        throw new UserError(ErrorCode.VALIDATION_ERROR, "用户名为必填项");
      }
      if (typeof body.password !== "string" || !body.password) {
        throw new UserError(ErrorCode.VALIDATION_ERROR, "密码为必填项");
      }

      // ponytail: 检查重名 — 在唯一索引上发生冲突时由 DB 错误处理回退
      const username = body.username.trim();
      const email = typeof body.email === "string" && body.email.trim() ? body.email.trim() : null;
      const displayName =
        typeof body.display_name === "string" && body.display_name.trim()
          ? body.display_name.trim()
          : null;

      const [existingUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (existingUser) {
        throw new UserError(ErrorCode.CONFLICT, "用户名已存在");
      }

      const passwordHash = await hashPassword(body.password);

      // ponytail: 使用 request.user 的 tenant_id 以确保多租户隔离
      const tenantId = request.user?.tenantId ?? "00000000-0000-0000-0000-000000000000";

      const [createdUser] = await db
        .insert(users)
        .values({
          tenant_id: tenantId,
          username,
          email,
          password_hash: passwordHash,
          display_name: displayName,
          locale: "zh-CN",
          is_active: true,
          must_change_password: true,
          created_by: request.user?.userId ?? null,
        })
        .returning();

      if (!createdUser) {
        throw new UserError(ErrorCode.GENERAL_INTERNAL_ERROR, "用户创建失败");
      }

      logger.info({ userId: createdUser.id, username: createdUser.username }, "user created");

      return reply.status(201).send(toUserResponse(createdUser));
    },
  );

  /**
   * PATCH /api/users/:id — 更新用户
   */
  app.patch(
    "/api/users/:id",
    { preHandler: [requireAuth, rbacGuard("update", "user")] },
    async (request): Promise<UserResponse> => {
      const params = request.params as { id: string };
      const body = request.body as Record<string, unknown>;

      const [existingUser] = await db.select().from(users).where(eq(users.id, params.id)).limit(1);

      if (!existingUser) {
        throw new UserError(ErrorCode.NOT_FOUND, "用户不存在");
      }

      const updates: Record<string, unknown> = {};
      if (typeof body.display_name === "string") {
        updates.display_name = body.display_name.trim();
      }
      if (typeof body.email === "string" || body.email === null) {
        updates.email = body.email === "" ? null : body.email;
      }
      if (typeof body.locale === "string") {
        updates.locale = body.locale;
      }
      if (typeof body.is_active === "boolean") {
        updates.is_active = body.is_active;
      }
      updates.updated_at = new Date();
      updates.updated_by = request.user?.userId ?? null;

      const [updatedUser] = await db
        .update(users)
        .set(updates)
        .where(eq(users.id, params.id))
        .returning();

      if (!updatedUser) {
        throw new UserError(ErrorCode.NOT_FOUND, "用户不存在");
      }

      logger.info({ userId: updatedUser.id }, "user updated");

      return toUserResponse(updatedUser);
    },
  );

  /**
   * DELETE /api/users/:id — 软删除（设置 is_active = false）
   */
  app.delete(
    "/api/users/:id",
    { preHandler: [requireAuth, rbacGuard("delete", "user")] },
    async (request): Promise<{ success: boolean }> => {
      const params = request.params as { id: string };

      const [existingUser] = await db
        .select({ id: users.id, is_active: users.is_active })
        .from(users)
        .where(eq(users.id, params.id))
        .limit(1);

      if (!existingUser) {
        throw new UserError(ErrorCode.NOT_FOUND, "用户不存在");
      }

      await db
        .update(users)
        .set({
          is_active: false,
          updated_at: new Date(),
          updated_by: request.user?.userId ?? null,
        })
        .where(eq(users.id, params.id));

      logger.info({ userId: params.id }, "user soft-deleted");

      return { success: true };
    },
  );
}
