import { relations } from "drizzle-orm/relations";
import { users } from "./users";
import { roles } from "./roles";
import { permissions } from "./permissions";
import { userRoles } from "./user_roles";
import { rolePermissions } from "./role_permissions";
import { modules } from "./modules";
import { collections } from "./collections";
import { auditLog } from "./audit_log";
import { migrationHistory } from "./migration_history";
import { refreshTokens } from "./refresh_tokens";

/**
 * Drizzle relations — 定义表间关联关系
 *
 * 用于 Drizzle ORM 的 nested query (findMany with with: { ... })
 */

// === users ===
export const usersRelations = relations(users, ({ many }) => ({
  userRoles: many(userRoles),
  refreshTokens: many(refreshTokens),
  auditLogs: many(auditLog, { relationName: "audit_actor" }),
}));

// === roles ===
export const rolesRelations = relations(roles, ({ many }) => ({
  rolePermissions: many(rolePermissions),
  userRoles: many(userRoles),
}));

// === permissions ===
export const permissionsRelations = relations(permissions, ({ many, one }) => ({
  rolePermissions: many(rolePermissions),
  module: one(modules, {
    fields: [permissions.module_id],
    references: [modules.id],
  }),
}));

// === user_roles ===
export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.user_id],
    references: [users.id],
  }),
  role: one(roles, {
    fields: [userRoles.role_id],
    references: [roles.id],
  }),
}));

// === role_permissions ===
export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, {
    fields: [rolePermissions.role_id],
    references: [roles.id],
  }),
  permission: one(permissions, {
    fields: [rolePermissions.permission_id],
    references: [permissions.id],
  }),
}));

// === modules ===
export const modulesRelations = relations(modules, ({ many }) => ({
  collections: many(collections),
  permissions: many(permissions),
  migrationHistory: many(migrationHistory),
}));

// === collections ===
export const collectionsRelations = relations(collections, ({ one }) => ({
  module: one(modules, {
    fields: [collections.module_id],
    references: [modules.id],
  }),
  extendedCollection: one(collections, {
    fields: [collections.extends_collection_id],
    references: [collections.id],
    relationName: "collection_extends",
  }),
}));

// === audit_log ===
export const auditLogRelations = relations(auditLog, ({ one }) => ({
  actor: one(users, {
    fields: [auditLog.actor_id],
    references: [users.id],
    relationName: "audit_actor",
  }),
}));

// === migration_history ===
export const migrationHistoryRelations = relations(migrationHistory, ({ one }) => ({
  module: one(modules, {
    fields: [migrationHistory.module_id],
    references: [modules.id],
  }),
}));

// === refresh_tokens ===
export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.user_id],
    references: [users.id],
  }),
}));
