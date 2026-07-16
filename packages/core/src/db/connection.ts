/**
 * Database connection factory using postgres.js + Drizzle ORM.
 *
 * @audebase/core
 */

import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema.js'
import type { AppConfig } from '../config.js'

export type DrizzleDB = ReturnType<typeof drizzle>

export interface DatabaseProvider {
  query: {
    users: { findFirst: (args?: unknown) => Promise<unknown> }
    roles: { findFirst: (args?: unknown) => Promise<unknown> }
    tenants: { findFirst: (args?: unknown) => Promise<unknown> }
    modules: { findFirst: (args?: unknown) => Promise<unknown> }
    permissions: { findFirst: (args?: unknown) => Promise<unknown> }
    refresh_tokens: { findFirst: (args?: unknown) => Promise<unknown> }
    role_permissions: { findMany: (args?: unknown) => Promise<unknown[]> }
    user_roles: { findMany: (args?: unknown) => Promise<unknown[]> }
    audit_log: { findMany: (args?: unknown) => Promise<unknown[]> }
    migration_history: { findMany: (args?: unknown) => Promise<unknown[]> }
  }
  insert: (table: unknown) => { values: (entry: unknown) => Promise<unknown> }
  update: (table: unknown) => {
    set: (entry: unknown) => { where: (cond: unknown) => Promise<unknown> }
  }
  delete: (table: unknown) => { where: (cond: unknown) => Promise<unknown> }
  execute: (sql: unknown, params?: unknown[]) => Promise<unknown>
}

export function createDatabase(config: AppConfig): {
  db: DrizzleDB
  sql: ReturnType<typeof postgres>
} {
  const sql = postgres(config.DATABASE_URL, {
    max: config.AUDE_DB_POOL_MAX,
  })

  const db = drizzle(sql, { schema })

  return { db, sql }
}
