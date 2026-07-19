import { describe, test, expect } from "vitest";
import { Writable } from "node:stream";
import { createLogger } from "../logger";

function createCaptureStream(): { stream: Writable; lines: () => unknown[] } {
  const captured: unknown[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      const text = chunk.toString().trim();
      if (text.length > 0) {
        for (const line of text.split("\n")) {
          try {
            captured.push(JSON.parse(line));
          } catch {
            captured.push(line);
          }
        }
      }
      callback();
    },
  });
  return { stream, lines: () => captured };
}

describe("createLogger", () => {
  test("默认 info 级别，debug 不可见", () => {
    const { stream, lines } = createCaptureStream();
    const logger = createLogger({ stream });

    logger.info({ key: "val" }, "test message");
    logger.debug("should not appear");

    const logs = lines();
    const infoLog = logs.find(
      (l: unknown) => (l as Record<string, unknown>)?.msg === "test message",
    ) as Record<string, unknown> | undefined;
    expect(infoLog).toBeDefined();
    expect(infoLog?.level).toBe(30);
    expect(infoLog?.key).toBe("val");

    const debugLog = logs.find(
      (l: unknown) => (l as Record<string, unknown>)?.msg === "should not appear",
    );
    expect(debugLog).toBeUndefined();
  });

  test("debug 级别可见 debug 消息", () => {
    const { stream, lines } = createCaptureStream();
    const logger = createLogger({ level: "debug", stream });

    logger.debug({}, "debug msg");
    logger.trace({}, "trace msg");

    const logs = lines();
    const debugLog = logs.find(
      (l: unknown) => (l as Record<string, unknown>)?.msg === "debug msg",
    ) as Record<string, unknown> | undefined;
    expect(debugLog).toBeDefined();
    expect(debugLog?.level).toBe(20);

    const traceLog = logs.find((l: unknown) => (l as Record<string, unknown>)?.msg === "trace msg");
    expect(traceLog).toBeUndefined();
  });

  test("trace 级别可见 trace 消息", () => {
    const { stream, lines } = createCaptureStream();
    const logger = createLogger({ level: "trace", stream });

    logger.trace({ key: "val" }, "trace msg");

    const logs = lines();
    const traceLog = logs.find(
      (l: unknown) => (l as Record<string, unknown>)?.msg === "trace msg",
    ) as Record<string, unknown> | undefined;
    expect(traceLog).toBeDefined();
    expect(traceLog?.level).toBe(10);
    expect(traceLog?.key).toBe("val");
  });

  test("子 logger 继承上下文绑定", () => {
    const { stream, lines } = createCaptureStream();
    const logger = createLogger({ level: "debug", stream });

    const child = logger.child({ plugin: "test-plugin" });
    child.info({ extra: "data" }, "child log");

    const logs = lines();
    const childLog = logs.find(
      (l: unknown) => (l as Record<string, unknown>)?.msg === "child log",
    ) as Record<string, unknown> | undefined;
    expect(childLog).toBeDefined();
    expect(childLog?.plugin).toBe("test-plugin");
    expect(childLog?.extra).toBe("data");
  });

  test("warn 和 error 级别输出正确", () => {
    const { stream, lines } = createCaptureStream();
    const logger = createLogger({ stream });

    logger.warn({ reason: "disk-full" }, "warning msg");
    logger.error({ err: new Error("test error") }, "error msg");

    const logs = lines();
    const warnLog = logs.find(
      (l: unknown) => (l as Record<string, unknown>)?.msg === "warning msg",
    ) as Record<string, unknown> | undefined;
    expect(warnLog).toBeDefined();
    expect(warnLog?.level).toBe(40);

    const errorLog = logs.find(
      (l: unknown) => (l as Record<string, unknown>)?.msg === "error msg",
    ) as Record<string, unknown> | undefined;
    expect(errorLog).toBeDefined();
    expect(errorLog?.level).toBe(50);
    expect(errorLog?.err).toBeDefined();
  });

  test("redaction 脱敏敏感字段", () => {
    const { stream, lines } = createCaptureStream();
    const logger = createLogger({
      level: "info",
      redact: ["secret", "password"],
      stream,
    });

    logger.info({ secret: "my-secret", password: "123456", name: "public" }, "with secrets");

    const logs = lines();
    const log = logs.find(
      (l: unknown) => (l as Record<string, unknown>)?.msg === "with secrets",
    ) as Record<string, unknown> | undefined;
    expect(log).toBeDefined();
    expect(log?.secret).toBe("[REDACTED]");
    expect(log?.password).toBe("[REDACTED]");
    expect(log?.name).toBe("public");
  });

  test("默认配置 logger 可正常输出", () => {
    const { stream, lines } = createCaptureStream();
    const logger = createLogger({ stream });

    logger.info("default works");

    const log = lines().find(
      (l: unknown) => (l as Record<string, unknown>)?.msg === "default works",
    );
    expect(log).toBeDefined();
  });

  test("error 级别过滤 info/warn", () => {
    const { stream, lines } = createCaptureStream();
    const logger = createLogger({ level: "error", stream });

    logger.info("should be filtered");
    logger.warn("also filtered");
    logger.error({ code: "E001" }, "error visible");
    logger.fatal({ code: "F001" }, "fatal visible");

    const logs = lines();
    expect(
      logs.find((l: unknown) => (l as Record<string, unknown>)?.msg === "should be filtered"),
    ).toBeUndefined();
    expect(
      logs.find((l: unknown) => (l as Record<string, unknown>)?.msg === "also filtered"),
    ).toBeUndefined();

    const errorLog = logs.find(
      (l: unknown) => (l as Record<string, unknown>)?.msg === "error visible",
    ) as Record<string, unknown> | undefined;
    expect(errorLog).toBeDefined();
    expect(errorLog?.level).toBe(50);

    const fatalLog = logs.find(
      (l: unknown) => (l as Record<string, unknown>)?.msg === "fatal visible",
    ) as Record<string, unknown> | undefined;
    expect(fatalLog).toBeDefined();
    expect(fatalLog?.level).toBe(60);
  });

  // 无 stream — 默认 pino 输出（非 pretty 路径）
  test("无 stream 时使用默认 pino 输出", () => {
    const logger = createLogger({ level: "info", name: "test" });
    expect(logger).toBeDefined();
    expect(logger.level).toBe("info");
    // 不应抛错
    logger.info("default pino");
  });

  test("pretty 模式启用 pino-pretty transport", () => {
    const logger = createLogger({ level: "debug", pretty: true });
    expect(logger).toBeDefined();
    expect(logger.level).toBe("debug");
    logger.info("pretty mode");
  });
});
