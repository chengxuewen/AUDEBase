import { eq, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyBaseLogger } from "fastify";
import { ErrorCode, UserError } from "@audebase/shared-types";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { roles } from "../db/schema/roles";
import { createAuthMiddleware } from "../auth/middleware";
import { rbacGuard } from "../plugins/rbac";

/** Maximum page size for role listing */
const MAX_LIMIT = 100;
/** Default page size */
const DEFAULT_LIMIT = 20;

/** Public-facing role shape */
interface RoleResponse {
  id: string;
  tenant_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

/** Paginated response envelope */
interface PaginatedRoles {
  data: RoleResponse[];
  total: number;
  limit: number;
  offset: number;
}

/** Strip internal fields from a DB row */
function toRoleResponse(row: typeof roles.$inferSelect): RoleResponse {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    is_system: row.is_system ?? false,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

/**
 * 注册角色 CRUD 路由到 Fastify 实例
 *
 * - GET    /api/roles      — 分页列表
 * - GET    /api/roles/:id  — 单个角色
 * - POST   /api/roles      — 创建角色
 * - PATCH  /api/roles/:id  — 更新角色
 * - DELETE /api/roles/:id  — 删除角色（系统角色禁止）
 */
export function registerRoleRoutes(
  app: FastifyInstance,
  db: NodePgDatabase,
  jwtSecret: string,
  logger: FastifyBaseLogger,
): void {
  const requireAuth = createAuthMiddleware(db, jwtSecret);

  /**
   * GET /api/roles — 分页角色列表
   */
  app.get(
    "/api/roles",
    { preHandler: [requireAuth, rbacGuard("read", "role")] },
    async (request): Promise<PaginatedRoles> => {
      const query = request.query as Record<string, string>;
      const limit = Math.min(
        Math.max(1, parseInt(query.limit ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
        MAX_LIMIT,
      );
      const offset = Math.max(0, parseInt(query.offset ?? "0", 10) || 0);

      const [rows, totalResult] = await Promise.all([
        db.select().from(roles).limit(limit).offset(offset).orderBy(roles.created_at),
        db.select({ count: sql<number>`count(*)::int` }).from(roles),
      ]);

      return {
        data: rows.map(toRoleResponse),
        total: totalResult[0]?.count ?? 0,
        limit,
        offset,
      };
    },
  );

  /**
   * GET /api/roles/:id — 获取单个角色
   */
  app.get(
    "/api/roles/:id",
    { preHandler: [requireAuth, rbacGuard("read", "role")] },
    async (request): Promise<RoleResponse> => {
      const params = request.params as { id: string };
      const [foundRole] = await db.select().from(roles).where(eq(roles.id, params.id)).limit(1);

      if (!foundRole) {
        throw new UserError(ErrorCode.NOT_FOUND, "角色不存在");
      }

      return toRoleResponse(foundRole);
    },
  );

  /**
   * POST /api/roles — 创建角色
   */
  app.post(
    "/api/roles",
    { preHandler: [requireAuth, rbacGuard("create", "role")] },
    async (request, reply): Promise<RoleResponse> => {
      const body = request.body as Record<string, unknown>;

      if (!body || typeof body.name !== "string" || !body.name.trim()) {
        throw new UserError(ErrorCode.VALIDATION_ERROR, "角色名称为必填项");
      }
      if (!body.slug || typeof body.slug !== "string" || !body.slug.trim()) {
        throw new UserError(ErrorCode.VALIDATION_ERROR, "角色标识符(slug)为必填项");
      }

      const name = body.name.trim();
      const slug = body.slug.trim();
      const description =
        typeof body.description === "string" && body.description.trim()
          ? body.description.trim()
          : null;

      // ponytail: 检查重名 slug — 在唯一索引上发生冲突时由 DB 错误处理回退
      const [existingRole] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.slug, slug))
        .limit(1);

      if (existingRole) {
        throw new UserError(ErrorCode.CONFLICT, "角色标识符已存在");
      }

      const tenantId = request.user?.tenantId ?? null;

      const [createdRole] = await db
        .insert(roles)
        .values({
          tenant_id: tenantId,
          name,
          slug,
          description,
          is_system: false,
        })
        .returning();

      if (!createdRole) {
        throw new UserError(ErrorCode.GENERAL_INTERNAL_ERROR, "角色创建失败");
      }

      logger.info({ roleId: createdRole.id, name: createdRole.name }, "role created");

      return reply.status(201).send(toRoleResponse(createdRole));
    },
  );

  /**
   * PATCH /api/roles/:id — 更新角色
   */
  app.patch(
    "/api/roles/:id",
    { preHandler: [requireAuth, rbacGuard("update", "role")] },
    async (request): Promise<RoleResponse> => {
      const params = request.params as { id: string };
      const body = request.body as Record<string, unknown>;

      const [existingRole] = await db.select().from(roles).where(eq(roles.id, params.id)).limit(1);

      if (!existingRole) {
        throw new UserError(ErrorCode.NOT_FOUND, "角色不存在");
      }

      if (existingRole.is_system) {
        throw new UserError(ErrorCode.FORBIDDEN, "系统角色不可修改");
      }

      const updates: Record<string, unknown> = {};
      if (typeof body.name === "string") {
        updates.name = body.name.trim();
      }
      if (typeof body.description === "string" || body.description === null) {
        updates.description = body.description === "" ? null : body.description;
      }
      updates.updated_at = new Date();

      const [updatedRole] = await db
        .update(roles)
        .set(updates)
        .where(eq(roles.id, params.id))
        .returning();

      if (!updatedRole) {
        throw new UserError(ErrorCode.NOT_FOUND, "角色不存在");
      }

      logger.info({ roleId: updatedRole.id }, "role updated");

      return toRoleResponse(updatedRole);
    },
  );

  /**
   * DELETE /api/roles/:id — 删除角色（系统角色禁止）
   */
  app.delete(
    "/api/roles/:id",
    { preHandler: [requireAuth, rbacGuard("delete", "role")] },
    async (request): Promise<{ success: boolean }> => {
      const params = request.params as { id: string };

      const [existingRole] = await db.select().from(roles).where(eq(roles.id, params.id)).limit(1);

      if (!existingRole) {
        throw new UserError(ErrorCode.NOT_FOUND, "角色不存在");
      }

      if (existingRole.is_system) {
        throw new UserError(ErrorCode.FORBIDDEN, "系统角色不可删除");
      }

      await db.delete(roles).where(eq(roles.id, params.id));

      logger.info({ roleId: params.id }, "role deleted");

      return { success: true };
    },
  );
}
