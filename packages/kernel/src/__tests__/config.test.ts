import { describe, test, expect } from "vitest";
import { loadConfig } from "../config";

describe("loadConfig", () => {
  const baseEnv: Record<string, string> = {
    DATABASE_URL: "postgres://localhost:5432/audebase",
    AUDE_JWT_SECRET: "a-very-secure-secret-that-is-at-least-32-chars-long",
  };

  test("默认配置加载成功", () => {
    // Arrange
    const env = { ...baseEnv };

    // Act
    const config = loadConfig(env);

    // Assert
    expect(config.DATABASE_URL).toBe("postgres://localhost:5432/audebase");
    expect(config.AUDE_JWT_SECRET).toBe(baseEnv.AUDE_JWT_SECRET);
    expect(config.PORT).toBe(3000);
    expect(config.HOST).toBe("0.0.0.0");
    expect(config.AUDE_LOG_LEVEL).toBe("info");
    expect(config.AUDE_LOG_PRETTY).toBe(false);
    expect(config.AUDE_SLOW_QUERY_THRESHOLD).toBe(100);
  });

  test("环境变量缺失时抛出异常", () => {
    // Arrange
    const env: Record<string, string> = {};

    // Act & Assert
    expect(() => loadConfig(env)).toThrow("Kernel configuration invalid");
  });

  test("DATABASE_URL 非 postgres 协议时抛出异常", () => {
    // Arrange
    const env = {
      ...baseEnv,
      DATABASE_URL: "mysql://localhost:3306/db",
    };

    // Act & Assert
    expect(() => loadConfig(env)).toThrow("Kernel configuration invalid");
  });

  test("AUDE_JWT_SECRET 短于 32 字符时抛出异常", () => {
    // Arrange
    const env = {
      ...baseEnv,
      AUDE_JWT_SECRET: "short",
    };

    // Act & Assert
    expect(() => loadConfig(env)).toThrow("Kernel configuration invalid");
  });

  test("PORT 非数字时抛出异常", () => {
    // Arrange
    const env = {
      ...baseEnv,
      PORT: "not-a-number",
    };

    // Act & Assert
    expect(() => loadConfig(env)).toThrow("Kernel configuration invalid");
  });

  test("AUDE_LOG_LEVEL 正值覆盖默认值", () => {
    // Arrange
    const env = {
      ...baseEnv,
      AUDE_LOG_LEVEL: "debug",
    };

    // Act
    const config = loadConfig(env);

    // Assert
    expect(config.AUDE_LOG_LEVEL).toBe("debug");
  });

  test("AUDE_LOG_PRETTY=true 转换为 boolean true", () => {
    // Arrange
    const env = {
      ...baseEnv,
      AUDE_LOG_PRETTY: "true",
    };

    // Act
    const config = loadConfig(env);

    // Assert
    expect(config.AUDE_LOG_PRETTY).toBe(true);
  });

  test("AUDE_SLOW_QUERY_THRESHOLD 自定义值", () => {
    // Arrange
    const env = {
      ...baseEnv,
      AUDE_SLOW_QUERY_THRESHOLD: "200",
    };

    // Act
    const config = loadConfig(env);

    // Assert
    expect(config.AUDE_SLOW_QUERY_THRESHOLD).toBe(200);
  });
});
