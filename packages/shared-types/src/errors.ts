/**
 * 全局错误码枚举
 *
 * 命名规则: {模块}_{错误类型}
 * 前端使用此枚举统一 switch-case 处理所有 API 错误
 */
export enum ErrorCode {
  // === Auth (认证/授权) ===
  AUTH_INVALID_CREDENTIALS = "AUTH_INVALID_CREDENTIALS",
  AUTH_TOKEN_EXPIRED = "AUTH_TOKEN_EXPIRED",
  AUTH_TOKEN_INVALID = "AUTH_TOKEN_INVALID",
  AUTH_MUST_CHANGE_PASSWORD = "AUTH_MUST_CHANGE_PASSWORD",
  FORBIDDEN = "FORBIDDEN",

  // === Validation (校验) ===
  VALIDATION_ERROR = "VALIDATION_ERROR",
  CONFLICT = "CONFLICT",
  NOT_FOUND = "NOT_FOUND",

  // === Plugin (插件) ===
  PLUGIN_MIGRATION_FAILED = "PLUGIN_MIGRATION_FAILED",
  PLUGIN_NOT_FOUND = "PLUGIN_NOT_FOUND",
  PLUGIN_DEPENDENCY_MISSING = "PLUGIN_DEPENDENCY_MISSING",
  PLUGIN_ALREADY_INSTALLED = "PLUGIN_ALREADY_INSTALLED",
  PLUGIN_CIRCULAR_DEPENDENCY = "PLUGIN_CIRCULAR_DEPENDENCY",
  PLUGIN_LIFECYCLE_ERROR = "PLUGIN_LIFECYCLE_ERROR",
  PLUGIN_MANIFEST_INVALID = "PLUGIN_MANIFEST_INVALID",

  // === RBAC ===
  RBAC_ROLE_NOT_FOUND = "RBAC_ROLE_NOT_FOUND",
  RBAC_PERMISSION_DENIED = "RBAC_PERMISSION_DENIED",
  RBAC_CANNOT_DELETE_SYSTEM_ROLE = "RBAC_CANNOT_DELETE_SYSTEM_ROLE",

  // === Rate (速率限制) ===
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",

  // === General (通用错误) ===
  GENERAL_INTERNAL_ERROR = "GENERAL_INTERNAL_ERROR",
  GENERAL_DB_UNAVAILABLE = "GENERAL_DB_UNAVAILABLE",
  GENERAL_ASSERTION_FAILED = "GENERAL_ASSERTION_FAILED",
  GENERAL_TIMEOUT = "GENERAL_TIMEOUT",
}

/**
 * 用户可恢复错误 — 前端展示 code + message + details
 *
 * 使用: throw new UserError(ErrorCode.VALIDATION_ERROR, '用户名长度应在 3-100 之间', { field: 'username' })
 */
export class UserError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "UserError";
    this.code = code;
    this.details = details;
    // 确保 instanceof 跨模块边界正常工作
    Object.setPrototypeOf(this, UserError.prototype);
  }

  /** 返回序列化格式（前端可用） */
  toJSON(): { code: ErrorCode; message: string; details?: Record<string, unknown> } {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

/**
 * 系统内部错误 — 前端仅看到 INTERNAL_ERROR
 * 原始 cause 写入日志，不返回给前端
 *
 * 使用: throw new SystemError(ErrorCode.GENERAL_DB_UNAVAILABLE, 'db timeout', originalPgError)
 */
export class SystemError extends Error {
  public readonly code: ErrorCode;
  public override readonly cause: unknown;

  constructor(code: ErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "SystemError";
    this.code = code;
    this.cause = cause;
    Object.setPrototypeOf(this, SystemError.prototype);
  }

  /** 序列化格式 — 不暴露 cause 详情 */
  toJSON(): { code: ErrorCode; message: string } {
    return {
      code: this.code,
      message: this.message,
    };
  }
}

/**
 * 开发断言错误 — 仅开发环境抛出，生产静默降级
 */
export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssertionError";
    Object.setPrototypeOf(this, AssertionError.prototype);
  }
}
