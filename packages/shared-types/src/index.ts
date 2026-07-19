// === Errors ===
export { ErrorCode, UserError, SystemError, AssertionError } from "./errors";

// === API ===
export type {
  ApiListResponse,
  PaginationMeta,
  ApiErrorResponse,
  PaginationParams,
  SortParam,
  FilterOperator,
  FilterCondition,
} from "./api";
export { paginationMetaSchema, paginationParamsSchema } from "./api";

// === Auth ===
export type {
  JwtPayload,
  UserBrief,
  LoginRequest,
  LoginResponse,
  RefreshRequest,
  RefreshResponse,
  LogoutRequest,
} from "./auth";
export {
  loginSchema,
  tokenResponseSchema,
  refreshSchema,
  logoutSchema,
  userBriefSchema,
  loginResponseSchema,
} from "./auth";

// === User ===
export type { User, CreateUserRequest, UpdateUserRequest } from "./user";
export { createUserSchema, updateUserSchema, paginatedUsersSchema } from "./user";

// === Role ===
export type {
  PermissionAction,
  PermissionBrief,
  RoleBrief,
  Permission,
  Role,
  CreateRoleRequest,
  UpdateRoleRequest,
} from "./role";
export {
  permissionActionSchema,
  createRoleSchema,
  updateRoleSchema,
  paginatedRolesSchema,
  paginatedPermissionsSchema,
} from "./role";

// === Plugin ===
export type { PluginStatus, PluginRuntimeMode, PluginPartition, PluginDescriptor } from "./plugin";
export { pluginStatusSchema, pluginRuntimeModeSchema, paginatedPluginsSchema } from "./plugin";

// === Audit ===
export type { AuditActionCategory, AuditLogEntry } from "./audit";
export { auditActionCategorySchema, paginatedAuditLogsSchema } from "./audit";

// === i18n ===
export type { LocaleMap, LocaleCode, TranslateFunction } from "./i18n";
// === Versioning (D1.8) ===
export type { SemVer, VersionInfo } from "./plugin";
export { parseSemVer, semVerSchema } from "./plugin";

// === Filter ===
export type { ListQueryParams } from "./filter";
