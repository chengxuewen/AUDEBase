/**
 * ErrorCode 枚举 + 错误类层次
 *
 * @audebase/shared-types
 */

export enum ErrorCode {
  // === Auth (认证/授权) ===
  AUTH_INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID = 'AUTH_TOKEN_INVALID',
  AUTH_MUST_CHANGE_PASSWORD = 'AUTH_MUST_CHANGE_PASSWORD',
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  FORBIDDEN = 'FORBIDDEN',

  // === Validation（校验） ===
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  CONFLICT = 'CONFLICT',
  NOT_FOUND = 'NOT_FOUND',

  // === Plugin（插件） ===
  PLUGIN_MIGRATION_FAILED = 'PLUGIN_MIGRATION_FAILED',
  PLUGIN_NOT_FOUND = 'PLUGIN_NOT_FOUND',
  PLUGIN_DEPENDENCY_MISSING = 'PLUGIN_DEPENDENCY_MISSING',
  PLUGIN_ALREADY_INSTALLED = 'PLUGIN_ALREADY_INSTALLED',
  PLUGIN_CIRCULAR_DEPENDENCY = 'PLUGIN_CIRCULAR_DEPENDENCY',
  PLUGIN_LIFECYCLE_ERROR = 'PLUGIN_LIFECYCLE_ERROR',
  PLUGIN_MANIFEST_INVALID = 'PLUGIN_MANIFEST_INVALID',

  // === RBAC ===
  RBAC_ROLE_NOT_FOUND = 'RBAC_ROLE_NOT_FOUND',
  RBAC_PERMISSION_DENIED = 'RBAC_PERMISSION_DENIED',
  RBAC_CANNOT_DELETE_SYSTEM_ROLE = 'RBAC_CANNOT_DELETE_SYSTEM_ROLE',

  // === Rate（速率限制） ===
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // === General（通用错误）===
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DB_UNAVAILABLE = 'DB_UNAVAILABLE',
  REDIS_UNAVAILABLE = 'REDIS_UNAVAILABLE',
  GENERAL_ASSERTION_FAILED = 'GENERAL_ASSERTION_FAILED',
  GENERAL_TIMEOUT = 'GENERAL_TIMEOUT',
}

/**
 * 用户可恢复错误 - 前端展示 code + message + details
 */
export class UserError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'UserError'
    Object.setPrototypeOf(this, UserError.prototype)
  }

  toJSON(): { code: ErrorCode; message: string; details?: Record<string, unknown> } {
    const result: { code: ErrorCode; message: string; details?: Record<string, unknown> } = {
      code: this.code,
      message: this.message,
    }
    if (this.details !== undefined) {
      result.details = this.details
    }
    return result
  }
}

/**
 * 系统内部错误 - 前端仅看到 INTERNAL_ERROR
 */
export class SystemError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'SystemError'
    Object.setPrototypeOf(this, SystemError.prototype)
  }

  toJSON(): { code: ErrorCode; message: string } {
    return {
      code: this.code,
      message: this.message,
    }
  }
}

/**
 * 开发断言错误 - 仅开发环境抛出，生产静默降级
 */
export class AssertionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AssertionError'
    Object.setPrototypeOf(this, AssertionError.prototype)
  }
}
