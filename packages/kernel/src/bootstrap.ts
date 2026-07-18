import { eq, and, count } from "drizzle-orm";
import { users, roles, permissions, userRoles, rolePermissions, modules } from "./db/schema";
import type { DatabaseProvider } from "./db";
import type { FastifyBaseLogger } from "fastify";
import type {
  PluginDbContext,
  BootstrapPermission,
  BootstrapRole,
  BootstrapMenuItem,
  BootstrapUser,
  PermissionAction,
} from "@audebase/plugin-core";
import { install } from "@audebase/plugin-core";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** System-level tenant ID used for bootstrap users and roles */
export const SYSTEM_TENANT_ID = "00000000-0000-0000-0000-000000000000";

// ---------------------------------------------------------------------------
// PluginDbContext adapter
// ---------------------------------------------------------------------------

/**
 * Create a PluginDbContext backed by the real Drizzle database.
 *
 * Exported so tests can construct a mock-free context when needed.
 */
export function createPluginDbContext(dbProvider: DatabaseProvider): PluginDbContext {
  const { db } = dbProvider;

  return {
    async hasAnyUser(): Promise<boolean> {
      const result = await db.select({ count: count() }).from(users);
      return (result[0]?.count ?? 0) > 0;
    },

    async createPermission(perm: BootstrapPermission): Promise<void> {
      await db
        .insert(permissions)
        .values({
          action: perm.action,
          resource: perm.resource,
          display_name: perm.displayName,
        })
        .onConflictDoNothing();
    },

    async createRole(role: BootstrapRole): Promise<void> {
      await db
        .insert(roles)
        .values({
          name: role.name,
          slug: role.slug,
          description: role.description,
          is_system: role.isSystem,
        })
        .onConflictDoNothing();
    },

    async assignPermissionToRole(
      roleSlug: string,
      action: PermissionAction,
      resource: string,
    ): Promise<void> {
      // Look up the role and permission IDs
      const [roleRow] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.slug, roleSlug))
        .limit(1);

      const [permRow] = await db
        .select({ id: permissions.id })
        .from(permissions)
        .where(and(eq(permissions.action, action), eq(permissions.resource, resource)))
        .limit(1);

      if (!roleRow || !permRow) {
        return; // skip silently — install() may assign permissions to not-yet-created roles
      }

      await db
        .insert(rolePermissions)
        .values({
          role_id: roleRow.id,
          permission_id: permRow.id,
        })
        .onConflictDoNothing();
    },

    async createUser(user: BootstrapUser): Promise<void> {
      const [inserted] = await db
        .insert(users)
        .values({
          tenant_id: SYSTEM_TENANT_ID,
          username: user.username,
          email: user.email,
          password_hash: user.passwordHash,
          must_change_password: user.mustChangePassword,
          display_name: user.displayName,
        })
        .returning({ id: users.id });

      if (!inserted) return;

      for (const roleSlug of user.roles) {
        const [roleRow] = await db
          .select({ id: roles.id })
          .from(roles)
          .where(eq(roles.slug, roleSlug))
          .limit(1);

        if (!roleRow) continue;

        await db.insert(userRoles).values({
          user_id: inserted.id,
          role_id: roleRow.id,
          tenant_id: SYSTEM_TENANT_ID,
        });
      }
    },

    async createMenuItem(item: BootstrapMenuItem): Promise<void> {
      await db
        .insert(modules)
        .values({
          name: item.key,
          version: "0.1.0",
          display_name: item.label,
          state: "installed",
          auto_install: true,
          runtime_mode: "inline",
          runtime_partition: "SYSTEM",
        })
        .onConflictDoNothing();
    },
  };
}

// ---------------------------------------------------------------------------
// bootstrapKernel
// ---------------------------------------------------------------------------

/**
 * Bootstrap the kernel by running plugin-core's install hook.
 *
 * Creates initial system data (permissions, roles, admin user, menus) on first
 * run.  Idempotent — subsequent calls are no-ops because `install()` checks
 * `hasAnyUser()` before proceeding.
 */
export async function bootstrapKernel(
  dbProvider: DatabaseProvider,
  logger: FastifyBaseLogger,
): Promise<void> {
  const db = createPluginDbContext(dbProvider);

  logger.info({ phase: "bootstrap" }, "kernel bootstrap started");

  await install({ db, logger });

  logger.info({ phase: "bootstrap" }, "kernel bootstrap complete");
}
