import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { ErrorCode, UserError } from "@audebase/shared-types";
import type { Role, RoleBrief } from "@audebase/shared-types";

/**
 * 创建角色参数
 */
export interface CreateRoleParams {
  name: string;
  slug: string;
  tenantId: string | null;
  description?: string;
  permissionIds: string[];
}

/**
 * 创建角色并分配权限
 */
export async function createRole(
  db: NodePgDatabase,
  params: CreateRoleParams,
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    // 插入角色
    const roleResult = await tx.execute<{ id: string }>(sql`
      INSERT INTO roles (name, slug, tenant_id, description, is_system)
      VALUES (${params.name}, ${params.slug}, ${params.tenantId ?? null}, ${params.description ?? null}, false)
      RETURNING id
    `);

    if (roleResult.rows.length === 0) {
      throw new UserError(ErrorCode.GENERAL_INTERNAL_ERROR, "创建角色失败");
    }

    const roleId = roleResult.rows[0]!.id;

    // 分配权限
    if (params.permissionIds.length > 0) {
      const values = params.permissionIds.map((permId) => ({
        role_id: roleId,
        permission_id: permId,
      }));

      // 批量插入 role_permissions
      for (const { permission_id } of values) {
        await tx.execute(sql`
          INSERT INTO role_permissions (role_id, permission_id)
          VALUES (${roleId}, ${permission_id})
          ON CONFLICT (role_id, permission_id) DO NOTHING
        `);
      }
    }

    return { id: roleId };
  });
}

/**
 * 获取角色列表
 */
export async function listRoles(db: NodePgDatabase, tenantId: string | null): Promise<Role[]> {
  const result = await db.execute<{
    id: string;
    tenant_id: string | null;
    name: string;
    slug: string;
    description: string | null;
    is_system: boolean;
    created_at: string;
    updated_at: string;
  }>(sql`
    SELECT id, tenant_id, name, slug, description, is_system,
           created_at::text AS created_at, updated_at::text AS updated_at
    FROM roles
    WHERE tenant_id IS NOT DISTINCT FROM ${tenantId ?? null}
    ORDER BY is_system DESC, name ASC
  `);

  const roles: Role[] = await Promise.all(
    result.rows.map(async (r) => {
      // 查询每个角色的权限
      const permResult = await db.execute<{ action: string; resource: string }>(
        sql`
        SELECT DISTINCT p.action, p.resource
        FROM role_permissions rp
        JOIN permissions p ON p.id = rp.permission_id
        WHERE rp.role_id = ${r.id}
      `,
      );

      // 查询角色的用户数
      const countResult = await db.execute<{ count: number }>(sql`
        SELECT COUNT(*)::int AS count
        FROM user_roles
        WHERE role_id = ${r.id}
      `);

      return {
        id: r.id,
        tenant_id: r.tenant_id,
        name: r.name,
        slug: r.slug,
        description: r.description,
        is_system: r.is_system,
        permissions: permResult.rows.map((p) => ({
          action: p.action as Role["permissions"][number]["action"],
          resource: p.resource,
        })),
        user_count: countResult.rows[0]?.count ?? 0,
        created_at: r.created_at,
        updated_at: r.updated_at,
      };
    }),
  );

  return roles;
}

/**
 * 为用户分配角色
 */
export async function assignRole(
  db: NodePgDatabase,
  userId: string,
  roleId: string,
  tenantId: string,
): Promise<void> {
  // 幂等插入
  await db.execute(sql`
    INSERT INTO user_roles (user_id, role_id, tenant_id)
    VALUES (${userId}, ${roleId}, ${tenantId})
    ON CONFLICT (user_id, role_id) DO NOTHING
  `);
}

/**
 * 撤销用户角色
 *
 * 约束：不能撤销用户的最后一个角色。
 */
export async function revokeRole(
  db: NodePgDatabase,
  userId: string,
  roleId: string,
): Promise<void> {
  return db.transaction(async (tx) => {
    // 检查角色是否为系统角色
    const roleResult = await tx.execute<{ is_system: boolean; slug: string }>(sql`
      SELECT is_system, slug FROM roles WHERE id = ${roleId}
    `);

    if (roleResult.rows.length === 0) {
      throw new UserError(ErrorCode.RBAC_ROLE_NOT_FOUND, "角色不存在");
    }

    // 检查用户当前角色数
    const countResult = await tx.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count FROM user_roles WHERE user_id = ${userId}
    `);

    if (countResult.rows[0]!.count <= 1) {
      throw new UserError(ErrorCode.RBAC_PERMISSION_DENIED, "不能撤销用户的最后一个角色");
    }

    await tx.execute(sql`
      DELETE FROM user_roles
      WHERE user_id = ${userId} AND role_id = ${roleId}
    `);
  });
}

/**
 * 获取用户的角色列表
 */
export async function getUserRoles(db: NodePgDatabase, userId: string): Promise<RoleBrief[]> {
  const result = await db.execute<{ id: string; slug: string; name: string }>(sql`
    SELECT r.id, r.slug, r.name
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = ${userId}
    ORDER BY r.name
  `);

  return result.rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
  }));
}

/**
 * 获取所有权限项列表
 */
export async function getAllPermissions(
  db: NodePgDatabase,
): Promise<{ id: string; action: string; resource: string; display_name: string }[]> {
  const result = await db.execute<{
    id: string;
    action: string;
    resource: string;
    display_name: string;
  }>(sql`
    SELECT id, action, resource, display_name
    FROM permissions
    ORDER BY resource, action
  `);

  return result.rows;
}
