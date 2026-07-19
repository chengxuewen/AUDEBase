import { z } from "zod";
import { ErrorCode, UserError } from "@audebase/shared-types";

/**
 * 内核配置 — 环境变量 Zod 校验
 *
 * 所有配置通过环境变量注入，启动时校验。
 */
export const kernelConfigSchema = z.object({
  /** PostgreSQL 连接字符串 */
  DATABASE_URL: z.string().url().startsWith("postgres", {
    message: "DATABASE_URL must be a valid postgres:// connection string",
  }),

  /** JWT 签名密钥 — ≥ 32 字符，拒绝默认值（CVE-2025-13877 教训） */
  AUDE_JWT_SECRET: z
    .string()
    .min(32, "AUDE_JWT_SECRET must be at least 32 characters")
    .refine((s) => s !== "change-me-in-production", {
      message: "AUDE_JWT_SECRET must not be the default value",
    }),

  /** 服务器监听端口 */
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  /** 服务器监听 host */
  HOST: z.string().default("0.0.0.0"),

  /** 日志级别 */
  AUDE_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  /** 开发模式: 彩色可读输出 */
  AUDE_LOG_PRETTY: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .default("false"),

  /** 慢查询阈值（毫秒） */
  AUDE_SLOW_QUERY_THRESHOLD: z.coerce.number().int().min(1).default(100),

  /** Redis 连接字符串（用于缓存、BullMQ、Pub/Sub） */
  REDIS_URL: z
    .string()
    .url()
    .startsWith("redis", {
      message: "REDIS_URL must be a valid redis:// connection string",
    })
    .default("redis://localhost:6379"),
});

export type KernelConfig = z.infer<typeof kernelConfigSchema>;

/**
 * 从 process.env 加载并校验配置
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): KernelConfig {
  const result = kernelConfigSchema.safeParse(env);
  if (!result.success) {
    const messages = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new UserError(
      ErrorCode.GENERAL_ASSERTION_FAILED,
      `Kernel configuration invalid:\n${messages}`,
    );
  }
  return result.data;
}
