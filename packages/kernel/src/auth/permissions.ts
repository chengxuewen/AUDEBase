/**
 * RBAC Permission Constants
 *
 * Granular permission keys used with rbacGuard() and seed data.
 * Format: {resource}:{action}
 *
 * The "manage" action on a resource grants all CRUD operations.
 * These granular constants allow finer-grained access control.
 */
export const Permissions = {
  // === User Management ===
  USERS_READ: "users:read",
  USERS_CREATE: "users:create",
  USERS_UPDATE: "users:update",
  USERS_DELETE: "users:delete",

  // === Role Management ===
  ROLES_READ: "roles:read",
  ROLES_CREATE: "roles:create",
  ROLES_UPDATE: "roles:update",
  ROLES_DELETE: "roles:delete",

  // === Plugin Management ===
  PLUGINS_READ: "plugins:read",
  PLUGINS_INSTALL: "plugins:install",
  PLUGINS_UPDATE: "plugins:update",
  PLUGINS_UNINSTALL: "plugins:uninstall",

  // === Audit ===
  AUDIT_READ: "audit:read",

  // === Health ===
  HEALTH_READ: "health:read",
} as const;

/** Union type of all permission keys */
export type PermissionKey = (typeof Permissions)[keyof typeof Permissions];

/** Known resource names used in rbacGuard */
export const Resources = {
  USER: "user",
  ROLE: "role",
  PLUGIN: "plugin",
  AUDIT: "audit_log",
  HEALTH: "health",
} as const;

/** Union type of all resource names */
export type ResourceName = (typeof Resources)[keyof typeof Resources];
