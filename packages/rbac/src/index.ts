/**
 * @audebase/rbac - Public API
 */

export { AuthService } from './auth-service.js'
export { RBACService } from './rbac-service.js'
export { aclMiddleware, requireAuth } from './middleware.js'
export {
  signToken,
  verifyToken,
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  assertJwtSecret,
} from './token.js'
export {
  parseDomainFilter,
  evaluateCondition,
  generateWhereClause,
  DomainFilterError,
} from './record-rules.js'
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
} from './record-rules.js'
export type {
  DatabaseProvider,
  UserRecord,
  RefreshTokenRecord,
  RoleRecord,
  TenantContext,
} from './types.js'
