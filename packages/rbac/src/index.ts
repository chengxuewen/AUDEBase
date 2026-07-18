// Engine
export { PermissionEngine } from "./engine";

// Role management
export {
  createRole,
  listRoles,
  assignRole,
  revokeRole,
  getUserRoles,
  getAllPermissions,
} from "./roles";
export type { CreateRoleParams } from "./roles";

// Middleware
export { rbacGuard } from "./middleware";
export type { AuthenticatedUser } from "./middleware";

// Seed data
export { seedDefaultPermissions, seedDefaultRoles, seedAdminUserRole } from "./seed";
