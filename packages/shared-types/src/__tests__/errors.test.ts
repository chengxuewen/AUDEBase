import { describe, test, expect } from "vitest";
import { ErrorCode, UserError, SystemError, AssertionError } from "../errors";

describe("ErrorCode", () => {
  test("所有错误码字符串非空", () => {
    const codes = Object.values(ErrorCode);
    for (const code of codes) {
      expect(typeof code).toBe("string");
      expect(code.length).toBeGreaterThan(0);
    }
  });
});

describe("UserError", () => {
  test("创建带 details 的 UserError", () => {
    // Arrange & Act
    const err = new UserError(ErrorCode.VALIDATION_ERROR, "用户名长度应在 3-100 之间", {
      field: "username",
    });

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(UserError);
    expect(err.name).toBe("UserError");
    expect(err.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(err.message).toBe("用户名长度应在 3-100 之间");
    expect(err.details).toEqual({ field: "username" });
  });

  test("toJSON 返回正确格式", () => {
    // Arrange
    const err = new UserError(ErrorCode.NOT_FOUND, "资源不存在", { id: "123" });

    // Act
    const json = err.toJSON();

    // Assert
    expect(json).toEqual({
      code: ErrorCode.NOT_FOUND,
      message: "资源不存在",
      details: { id: "123" },
    });
  });

  test("toJSON 无 details 时 details 为 undefined", () => {
    // Arrange
    const err = new UserError(ErrorCode.CONFLICT, "数据冲突");

    // Act
    const json = err.toJSON();

    // Assert
    expect(json.code).toBe(ErrorCode.CONFLICT);
    expect(json.message).toBe("数据冲突");
    expect(json.details).toBeUndefined();
  });
});

describe("SystemError", () => {
  test("创建带 cause 的 SystemError", () => {
    // Arrange
    const cause = new Error("db timeout");

    // Act
    const err = new SystemError(ErrorCode.GENERAL_DB_UNAVAILABLE, "db timeout", cause);

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(SystemError);
    expect(err.name).toBe("SystemError");
    expect(err.code).toBe(ErrorCode.GENERAL_DB_UNAVAILABLE);
    expect(err.message).toBe("db timeout");
    expect(err.cause).toBe(cause);
  });

  test("toJSON 不暴露 cause 详情", () => {
    // Arrange
    const cause = new Error("sensitive internal detail");
    const err = new SystemError(ErrorCode.GENERAL_INTERNAL_ERROR, "服务器内部错误", cause);

    // Act
    const json = err.toJSON();

    // Assert
    expect(json).toEqual({
      code: ErrorCode.GENERAL_INTERNAL_ERROR,
      message: "服务器内部错误",
    });
    expect(json).not.toHaveProperty("cause");
  });

  test("无 cause 的 SystemError", () => {
    // Arrange & Act
    const err = new SystemError(ErrorCode.GENERAL_TIMEOUT, "请求超时");

    // Assert
    expect(err.code).toBe(ErrorCode.GENERAL_TIMEOUT);
    expect(err.cause).toBeUndefined();
  });
});

describe("AssertionError", () => {
  test("创建 AssertionError", () => {
    // Arrange & Act
    const err = new AssertionError("环境变量 AUDE_JWT_SECRET 未设置");

    // Assert
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AssertionError);
    expect(err.name).toBe("AssertionError");
    expect(err.message).toBe("环境变量 AUDE_JWT_SECRET 未设置");
  });
});
