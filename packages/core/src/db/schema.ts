/**
 * Drizzle ORM schema for all 11 AUDEBase tables.
 *
 * @audebase/core
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  primaryKey,
} from 'drizzle-orm/pg-core'

// 0. tenants
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 200 }).notNull(),
  domain: varchar('domain', { length: 500 }),
  config: jsonb('config').default({}),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// 1. modules
export const modules = pgTable('modules', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id'),
  name: varchar('name', { length: 200 }).notNull().unique(),
  version: varchar('version', { length: 50 }).notNull(),
  display_name: varchar('display_name', { length: 255 }).notNull(),
  state: varchar('state', { length: 20 }).notNull().default('discovered'),
  category: varchar('category', { length: 100 }),
  description: text('description'),
  author: varchar('author', { length: 255 }),
  license: varchar('license', { length: 100 }),
  dependencies: jsonb('dependencies').default([]),
  runtime_mode: varchar('runtime_mode', { length: 20 }).notNull().default('inline'),
  runtime_partition: varchar('runtime_partition', { length: 50 }).notNull().default('SYSTEM'),
  auto_install: boolean('auto_install').default(false),
  manifest_path: varchar('manifest_path', { length: 500 }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// 2. collections
export const collections = pgTable('collections', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id'),
  module_id: uuid('module_id')
    .notNull()
    .references(() => modules.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  table_name: varchar('table_name', { length: 200 }).notNull().unique(),
  display_name: varchar('display_name', { length: 255 }).notNull(),
  description: text('description'),
  extends_collection_id: uuid('extends_collection_id'),
  is_system: boolean('is_system').default(false),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// 3. users
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull(),
  username: varchar('username', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }),
  password_hash: varchar('password_hash', { length: 255 }).notNull(),
  token_version: integer('token_version').notNull().default(1),
  is_active: boolean('is_active').notNull().default(true),
  must_change_password: boolean('must_change_password').notNull().default(false),
  display_name: varchar('display_name', { length: 255 }),
  avatar_url: varchar('avatar_url', { length: 500 }),
  locale: varchar('locale', { length: 10 }).default('zh-CN'),
  last_login_at: timestamp('last_login_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  created_by: uuid('created_by'),
  updated_by: uuid('updated_by'),
})

// 4. roles
export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id'),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  description: varchar('description', { length: 500 }),
  is_system: boolean('is_system').default(false),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// 5. permissions
export const permissions = pgTable('permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id'),
  action: varchar('action', { length: 100 }).notNull(),
  resource: varchar('resource', { length: 200 }).notNull(),
  display_name: varchar('display_name', { length: 255 }).notNull(),
  module_id: uuid('module_id'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// 6. user_roles
export const user_roles = pgTable(
  'user_roles',
  {
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role_id: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    tenant_id: uuid('tenant_id').notNull(),
    assigned_at: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
    assigned_by: uuid('assigned_by'),
  },
  (table) => [primaryKey({ columns: [table.user_id, table.role_id] })],
)

// 7. role_permissions
export const role_permissions = pgTable(
  'role_permissions',
  {
    role_id: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permission_id: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
    tenant_id: uuid('tenant_id'),
    assigned_at: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.role_id, table.permission_id] })],
)

// 8. refresh_tokens
export const refresh_tokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tenant_id: uuid('tenant_id').notNull(),
  token_hash: varchar('token_hash', { length: 255 }).notNull().unique(),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  revoked_at: timestamp('revoked_at', { withTimezone: true }),
  user_agent: varchar('user_agent', { length: 500 }),
  ip: varchar('ip', { length: 50 }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// 9. audit_log
export const audit_log = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull(),
  actor_id: uuid('actor_id'),
  action: varchar('action', { length: 100 }).notNull(),
  resource_type: varchar('resource_type', { length: 200 }).notNull(),
  resource_id: uuid('resource_id'),
  old_values: jsonb('old_values'),
  new_values: jsonb('new_values'),
  ip: varchar('ip', { length: 50 }),
  user_agent: varchar('user_agent', { length: 500 }),
  request_id: varchar('request_id', { length: 100 }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// 10. migration_history
export const migration_history = pgTable('migration_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  module_id: uuid('module_id')
    .notNull()
    .references(() => modules.id, { onDelete: 'cascade' }),
  version: varchar('version', { length: 50 }).notNull(),
  phase: varchar('phase', { length: 20 }).notNull(),
  filename: varchar('filename', { length: 500 }),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  error_message: text('error_message'),
  execution_time_ms: integer('execution_time_ms'),
  executed_at: timestamp('executed_at', { withTimezone: true }).notNull().defaultNow(),
})

// 11. attachments
export const attachments = pgTable('attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull(),
  filename: varchar('filename', { length: 500 }).notNull(),
  content_type: varchar('content_type', { length: 255 }).notNull(),
  size: integer('size').notNull(),
  sha256: varchar('sha256', { length: 64 }).notNull(),
  storage_backend: varchar('storage_backend', { length: 20 }).notNull().default('local'),
  storage_path: varchar('storage_path', { length: 1000 }).notNull(),
  uploaded_by: uuid('uploaded_by'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deleted_at: timestamp('deleted_at', { withTimezone: true }),
})

export const schema = {
  tenants,
  modules,
  collections,
  users,
  roles,
  permissions,
  user_roles,
  role_permissions,
  refresh_tokens,
  audit_log,
  migration_history,
  attachments,
}
