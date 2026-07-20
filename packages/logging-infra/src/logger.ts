import { pino, type Logger } from "pino";
import type { LoggerConfig } from "./types";
import { DEFAULT_REDACT_PATHS } from "./types";

/**
 * 创建结构化 pino Logger 实例。
 *
 * @param config — 日志配置
 * @returns pino Logger
 */
export function createLogger(config: LoggerConfig = {}): Logger {
  const { level = "info", pretty = false, name, redact = DEFAULT_REDACT_PATHS, stream } = config;

  // 测试模式：使用自定义 stream，忽略 pretty
  if (stream) {
    return pino(
      {
        level,
        name,
        redact: {
          paths: redact,
          censor: "[REDACTED]",
        },
      },
      stream,
    );
  }

  return pino({
    level,
    name,
    redact: {
      paths: redact,
      censor: "[REDACTED]",
    },
    ...(pretty
      ? {
          transport: {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "SYS:standard" },
          },
        }
      : {}),
  });
}
