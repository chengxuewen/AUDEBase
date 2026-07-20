/**
 * Local type definitions for @audebase/auth
 *
 * DatabaseProvider is defined locally because @audebase/core is not yet implemented.
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
  last_login_at?: Date | null
}

/** Refresh token record shape */
export interface RefreshTokenRecord {
  id: string
  user_id: string
  token_hash: string
  revoked_at: Date | null
  expires_at: Date
}

/** Login input */
export interface LoginInput {
  username: string
  password: string
  ip?: string
  userAgent?: string
}

/** Token result returned by login/refresh */
export interface TokenResult {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: 'Bearer'
}
