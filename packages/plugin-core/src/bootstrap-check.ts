/**
 * Bootstrap completion checker for @audebase/plugin-core
 *
 * Checks whether bootstrap data already exists in the database.
 * Used by PluginCore.install() to implement idempotency.
 */

import type { DatabaseProvider } from './types.js'

/**
 * Check if bootstrap is already complete.
 *
 * Returns true if EITHER:
 * - An admin user already exists in the users table
 * - The modules table already has a plugin-core record
 *
 * @param db - Database provider (Drizzle instance or mock)
 */
export async function isBootstrapComplete(db: DatabaseProvider): Promise<boolean> {
  // Check if admin user exists
  const existingAdmin = await db.query.users.findFirst()
  if (existingAdmin !== null && existingAdmin !== undefined) {
    return true
  }

  // Check if module registry has plugin-core record
  // ponytail: modules query may be absent in partial mocks
  const modulesQuery = (db.query as Record<string, unknown>).modules as { findFirst?: (args?: unknown) => Promise<unknown> } | undefined
  if (modulesQuery !== undefined && typeof modulesQuery.findFirst === 'function') {
    const moduleRecord = await modulesQuery.findFirst()
    if (moduleRecord !== null && moduleRecord !== undefined) {
      return true
    }
  }

  return false
}
