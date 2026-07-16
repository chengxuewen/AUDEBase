/**
 * @audebase/shared-types - 统一导出入口
 */

// 错误码 + 错误类
export { ErrorCode, UserError, SystemError, AssertionError } from './errors.js'

// API 响应信封
export type {
  ApiListResponse,
  PaginationMeta,
  ApiErrorResponse,
  PaginationParams,
  SortParam,
  FilterOperator,
  FilterCondition,
} from './api.js'

// 认证/授权类型
export type {
  JwtPayload,
  LoginRequest,
  LoginResponse,
  RefreshRequest,
  RefreshResponse,
  LogoutRequest,
  UserBrief,
} from './auth.js'

// 用户类型
export type { User, CreateUserRequest, UpdateUserRequest } from './user.js'

// 角色/权限类型
export type {
  Role,
  CreateRoleRequest,
  UpdateRoleRequest,
  RoleBrief,
  Permission,
  PermissionAction,
  PermissionBrief,
} from './role.js'

// 插件类型
export type {
  PluginStatus,
  PluginRuntimeMode,
  PluginPartition,
  PluginDescriptor,
  Plugin,
} from './plugin.js'

// 审计日志类型
export type { AuditActionCategory, AuditLogEntry } from './audit.js'

// i18n 类型
export type { LocaleMap, LocaleCode, TranslateFunction } from './i18n.js'

// 过滤/排序类型
export type { ListQueryParams } from './filter.js'

// Zod schema
export {
  loginSchema,
  tokenResponseSchema,
  paginatedUsersSchema,
  healthResponseSchema,
  errorResponseSchema,
  createUserSchema,
  updateUserSchema,
  createRoleSchema,
} from './schemas.js'

// Manifest 类型（从 Zod schema 推导）
export type { Manifest } from './manifest.js'

// PluginHost 接口
export type { PluginHost, PluginManifest, PluginLogger, PluginConfig } from './plugin-host.js'
