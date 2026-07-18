import { describe, test, expect } from "vitest";
import { hashPassword, verifyPassword } from "../auth/passwords";

describe("hashPassword", () => {
  test("生成非明文 bcrypt 哈希", async () => {
    // Arrange
    const password = "SecurePass1!";

    // Act
    const hash = await hashPassword(password);

    // Assert
    expect(hash).not.toBe(password);
    expect(hash).toContain("$2b$"); // bcrypt identifier
    expect(hash.length).toBeGreaterThan(50);
  });

  test("相同密码每次产生不同哈希（salt）", async () => {
    // Arrange
    const password = "SecurePass1!";

    // Act
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);

    // Assert
    expect(hash1).not.toBe(hash2);
  });
});

describe("verifyPassword", () => {
  test("正确密码验证成功", async () => {
    // Arrange
    const password = "SecurePass1!";
    const hash = await hashPassword(password);

    // Act
    const result = await verifyPassword(password, hash);

    // Assert
    expect(result).toBe(true);
  });

  test("错误密码验证失败", async () => {
    // Arrange
    const password = "SecurePass1!";
    const wrongPassword = "WrongPass1!";

    // Act
    const hash = await hashPassword(password);
    const isValid = await verifyPassword(wrongPassword, hash);

    // Assert
    expect(isValid).toBe(false);
  }, 10000);

  test("空密码验证失败", async () => {
    // Arrange
    const hash = await hashPassword("RealPass1!");

    // Act
    const result = await verifyPassword("", hash);

    // Assert
    expect(result).toBe(false);
  });
});
