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

// Record Rules (D10)
export {
  parseDomainFilter,
  evaluateCondition,
  generateWhereClause,
  DomainFilterError,
} from "./record-rules";
export type {
  ComparisonOperator,
  LeafCondition,
  AndCondition,
  OrCondition,
  NotCondition,
  TypedCondition,
  DomainFilterTuple,
  WhereClauseResult,
  WhereClauseOptions,
} from "./record-rules";
