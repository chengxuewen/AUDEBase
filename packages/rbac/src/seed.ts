import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

/**
 * 默认权限项定义
 */
interface DefaultPermission {
  action: string;
  resource: string;
  display_name: string;
}

const DEFAULT_PERMISSIONS: DefaultPermission[] = [
  // Super-permissions — grant all CRUD on a resource
  { action: "manage", resource: "plugin", display_name: "插件管理" },
  { action: "manage", resource: "user", display_name: "用户管理" },
  { action: "manage", resource: "role", display_name: "角色管理" },

  // Granular CRUD permissions for users
  { action: "users:read", resource: "user", display_name: "查看用户" },
  { action: "users:create", resource: "user", display_name: "创建用户" },
  { action: "users:update", resource: "user", display_name: "更新用户" },
  { action: "users:delete", resource: "user", display_name: "删除用户" },

  // Granular CRUD permissions for roles
  { action: "roles:read", resource: "role", display_name: "查看角色" },
  { action: "roles:create", resource: "role", display_name: "创建角色" },
  { action: "roles:update", resource: "role", display_name: "更新角色" },
  { action: "roles:delete", resource: "role", display_name: "删除角色" },

  // Granular permissions for plugins
  { action: "plugins:read", resource: "plugin", display_name: "查看插件" },
  { action: "plugins:install", resource: "plugin", display_name: "安装插件" },
  { action: "plugins:update", resource: "plugin", display_name: "更新插件" },
  { action: "plugins:uninstall", resource: "plugin", display_name: "卸载插件" },

  // Read-only permissions (legacy + granular)
  { action: "read", resource: "audit_log", display_name: "查看审计日志" },
  { action: "audit:read", resource: "audit_log", display_name: "查看审计日志" },
  { action: "read", resource: "health", display_name: "健康检查" },
  { action: "health:read", resource: "health", display_name: "健康检查" },
];

/**
 * 播种默认权限项
 *
 * 幂等操作：已存在的 (action, resource) 组合会被跳过。
 * 返回所有权限项的 action→resource→id 映射。
 */
export async function seedDefaultPermissions(
  db: NodePgDatabase,
): Promise<Map<string, Map<string, string>>> {
  const permMap = new Map<string, Map<string, string>>();

  for (const perm of DEFAULT_PERMISSIONS) {
    const result = await db.execute<{ id: string }>(sql`
      INSERT INTO permissions (action, resource, display_name)
      VALUES (${perm.action}, ${perm.resource}, ${perm.display_name})
      ON CONFLICT (action, resource) DO UPDATE
        SET display_name = EXCLUDED.display_name
      RETURNING id
    `);

    if (result.rows.length > 0) {
      const resourceMap = permMap.get(perm.resource) ?? new Map<string, string>();
      resourceMap.set(perm.action, result.rows[0]!.id);
      permMap.set(perm.resource, resourceMap);
    }
  }

  return permMap;
}

/**
 * Check whether a permission action grants read access.
 *
 * Matches action="read", "manage", or granular "*:read" patterns.
 */
function isReadAction(action: string): boolean {
  if (action === "read" || action === "manage") return true;
  return action.endsWith(":read");
}

/**
 * 播种默认角色
 *
 * 创建 admin（管理员）和 member（成员）两个系统角色。
 * 幂等操作。
 */
export async function seedDefaultRoles(
  db: NodePgDatabase,
): Promise<{ adminRoleId: string; memberRoleId: string }> {
  return db.transaction(async (tx) => {
    // 创建 admin 角色
    const adminResult = await tx.execute<{ id: string }>(sql`
      INSERT INTO roles (name, slug, is_system, tenant_id)
      VALUES ('管理员', 'admin', true, NULL)
      ON CONFLICT (slug, tenant_id) DO NOTHING
      RETURNING id
    `);

    let adminRoleId = adminResult.rows[0]?.id;
    if (!adminRoleId) {
      const lookupResult = await tx.execute<{ id: string }>(sql`
        SELECT id FROM roles WHERE slug = 'admin' AND tenant_id IS NULL
      `);
      adminRoleId = lookupResult.rows[0]?.id;
    }

    // 创建 member 角色
    const memberResult = await tx.execute<{ id: string }>(sql`
      INSERT INTO roles (name, slug, is_system, tenant_id)
      VALUES ('成员', 'member', true, NULL)
      ON CONFLICT (slug, tenant_id) DO NOTHING
      RETURNING id
    `);

    let memberRoleId = memberResult.rows[0]?.id;
    if (!memberRoleId) {
      const lookupResult = await tx.execute<{ id: string }>(sql`
        SELECT id FROM roles WHERE slug = 'member' AND tenant_id IS NULL
      `);
      memberRoleId = lookupResult.rows[0]?.id;
    }

    if (!adminRoleId || !memberRoleId) {
      throw new Error("seeding roles failed: could not create or find roles");
    }

    // 获取所有权限项
    const permsResult = await tx.execute<{ id: string; action: string }>(sql`
      SELECT id, action FROM permissions
    `);

    // admin 角色 → 所有权限
    for (const perm of permsResult.rows) {
      await tx.execute(sql`
        INSERT INTO role_permissions (role_id, permission_id)
        VALUES (${adminRoleId}, ${perm.id})
        ON CONFLICT (role_id, permission_id) DO NOTHING
      `);
    }

    // member 角色 → 仅 read 相关权限
    for (const perm of permsResult.rows) {
      if (isReadAction(perm.action)) {
        await tx.execute(sql`
          INSERT INTO role_permissions (role_id, permission_id)
          VALUES (${memberRoleId}, ${perm.id})
          ON CONFLICT (role_id, permission_id) DO NOTHING
        `);
      }
    }

    return { adminRoleId, memberRoleId };
  });
}

/**
 * 将用户关联到 admin 角色
 *
 * 用于 Bootstrap 流程中将首个 admin 用户关联到 admin 角色。
 */
export async function seedAdminUserRole(
  db: NodePgDatabase,
  userId: string,
  adminRoleId: string,
  tenantId: string,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO user_roles (user_id, role_id, tenant_id)
    VALUES (${userId}, ${adminRoleId}, ${tenantId})
    ON CONFLICT (user_id, role_id) DO NOTHING
  `);
}
