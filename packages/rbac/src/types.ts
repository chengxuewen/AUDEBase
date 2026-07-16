/**
 * Local type definitions for @audebase/rbac
 *
 * DatabaseProvider is defined locally because @audebase/core is not yet implemented.
 * Once core provides the real DatabaseProvider, this can be swapped.
 */

/** Permissive DB interface matching Drizzle's query API shape used in tests */
export interface DatabaseProvider {
  query: {
    users: {
      findFirst: (args?: unknown) => Promise<unknown>
    }
    refresh_tokens: {
      findFirst: (args?: unknown) => Promise<unknown>
    }
    role_permissions: {
      findMany: (args?: unknown) => Promise<unknown[]>
    }
    user_roles: {
      findMany: (args?: unknown) => Promise<unknown[]>
    }
    roles: {
      findFirst: (args?: unknown) => Promise<unknown>
    }
  }
  insert: (args: unknown) => Promise<unknown>
  update: (args: unknown) => Promise<unknown>
  delete: (args: unknown) => Promise<unknown>
}

/** User record shape returned by DB queries in auth context */
export interface UserRecord {
  id: string
  username: string
  password_hash: string
  token_version: number
  is_active: boolean
  must_change_password: boolean
  tenant_id: string | null
}

/** Refresh token record shape */
export interface RefreshTokenRecord {
  id: string
  user_id: string
  token_hash: string
  revoked_at: Date | null
  expires_at: Date
}

/** Role record shape */
export interface RoleRecord {
  id: string
  name: string
  slug: string
  is_system: boolean
  tenant_id: string | null
}

/** Role-permission join result */
export interface RolePermissionJoin {
  permission: {
    action: string
    resource: string
  }
}

/** User-role join result */
export interface UserRoleJoin {
  role_id: string
}

/** Tenant context for injectTenantFilter */
export interface TenantContext {
  tenant_id: string | null
  user_id: string
}
