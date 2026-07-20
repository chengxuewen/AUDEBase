/**
 * 日志级别 — 对应 pino 的 log level
 */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

/**
 * createLogger 配置
 */
export interface LoggerConfig {
  /** 日志级别，默认 "info" */
  level?: LogLevel;
  /** 是否启用 pretty print（开发环境），默认 false */
  pretty?: boolean;
  /** 应用名称，注入到每条日志 */
  name?: string;
  /** pino redact 路径，用于脱敏 */
  redact?: string[];
  /** 自定义 writable stream（测试用），传此参数时忽略 pretty */
  stream?: NodeJS.WritableStream;
}

/**
 * HTTP 请求日志条目
 */
export interface RequestLogEntry {
  /** HTTP 方法 */
  method: string;
  /** 请求 URL */
  url: string;
  /** 响应状态码 */
  statusCode: number;
  /** 响应时间 (ms) */
  responseTime: number;
  /** 请求 ID */
  requestId: string;
  /** 用户 ID（若已认证） */
  userId?: string;
  /** 租户 ID（若多租户上下文中） */
  tenantId?: string;
}

/**
 * 默认脱敏路径 — 屏蔽敏感 header 和请求体中的 password 字段
 */
export const DEFAULT_REDACT_PATHS: string[] = [
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["x-api-key"]',
  "req.body.password",
  "req.body.passwordConfirmation",
  "req.body.currentPassword",
  "req.body.newPassword",
  "req.body.secret",
  "req.body.token",
];
