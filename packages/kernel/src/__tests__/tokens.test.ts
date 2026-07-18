import { describe, test, expect } from "vitest";
import {
  createAccessToken,
  verifyAccessToken,
  createRefreshToken,
  hashRefreshToken,
  ACCESS_TOKEN_EXPIRY_SECONDS,
} from "../auth/tokens";

const TEST_SECRET = "a-very-secure-secret-that-is-at-least-32-chars";

describe("createAccessToken", () => {
  test("生成有效的 JWT — 可被验证和解码", () => {
    // Arrange
    const payload = {
      sub: "user-1",
      tenant_id: "tenant-1",
      username: "admin",
      roles: ["admin"],
    };

    // Act
    const token = createAccessToken(payload, TEST_SECRET);

    // Assert
    expect(token).toBeDefined();
    expect(typeof token).toBe("string");
    // Token should have 3 dot-separated parts (header.payload.signature)
    expect(token.split(".")).toHaveLength(3);
  });

  test("生成的 token 包含 sub 声明", () => {
    // Arrange
    const payload = {
      sub: "user-2",
      tenant_id: "tenant-1",
      username: "user",
      roles: ["member"],
    };

    // Act
    const token = createAccessToken(payload, TEST_SECRET);
    const decoded = verifyAccessToken(token, TEST_SECRET);

    // Assert
    expect(decoded.sub).toBe("user-2");
    expect(decoded.tenant_id).toBe("tenant-1");
    expect(decoded.username).toBe("user");
    expect(decoded.roles).toEqual(["member"]);
  });

  test("生成的 token 包含 iat 和 exp", () => {
    // Arrange
    const payload = {
      sub: "user-3",
      tenant_id: "tenant-1",
      username: "test",
      roles: [],
    };

    // Act
    const token = createAccessToken(payload, TEST_SECRET);
    const decoded = verifyAccessToken(token, TEST_SECRET);

    // Assert
    expect(decoded.iat).toBeGreaterThan(0);
    expect(decoded.exp).toBeGreaterThan(decoded.iat);
    expect(decoded.exp - decoded.iat).toBeLessThanOrEqual(ACCESS_TOKEN_EXPIRY_SECONDS);
  });
});

describe("verifyAccessToken", () => {
  test("有效 token 验证成功", () => {
    // Arrange
    const payload = {
      sub: "user-1",
      tenant_id: "tenant-1",
      username: "admin",
      roles: ["admin"],
    };
    const token = createAccessToken(payload, TEST_SECRET);

    // Act
    const decoded = verifyAccessToken(token, TEST_SECRET);

    // Assert
    expect(decoded.sub).toBe("user-1");
  });

  test("错误密钥验证失败", () => {
    // Arrange
    const payload = {
      sub: "user-1",
      tenant_id: "tenant-1",
      username: "admin",
      roles: ["admin"],
    };
    const token = createAccessToken(payload, TEST_SECRET);

    // Act & Assert
    expect(() => verifyAccessToken(token, "wrong-secret-that-is-at-least-32-chars!")).toThrow();
  });

  test("篡改过的 token 验证失败", () => {
    // Arrange
    const payload = {
      sub: "user-1",
      tenant_id: "tenant-1",
      username: "admin",
      roles: ["admin"],
    };
    const token = createAccessToken(payload, TEST_SECRET);
    // Tamper: change last character
    const tampered = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");

    // Act & Assert
    expect(() => verifyAccessToken(tampered, TEST_SECRET)).toThrow();
  });

  test("空字符串 token 验证失败", () => {
    // Act & Assert
    expect(() => verifyAccessToken("", TEST_SECRET)).toThrow();
  });
});

describe("createRefreshToken", () => {
  test("生成 96 字符 hex 字符串（48 bytes）", () => {
    // Act
    const token = createRefreshToken();

    // Assert
    expect(token).toHaveLength(96); // 48 bytes * 2 hex chars
    expect(/^[0-9a-f]+$/i.test(token)).toBe(true);
  });

  test("每次生成不同的 token", () => {
    // Act
    const token1 = createRefreshToken();
    const token2 = createRefreshToken();

    // Assert
    expect(token1).not.toBe(token2);
  });
});

describe("hashRefreshToken", () => {
  test("生成 64 字符 SHA-256 hex", () => {
    // Arrange
    const token = "test-refresh-token";

    // Act
    const hash = hashRefreshToken(token);

    // Assert
    expect(hash).toHaveLength(64); // SHA-256 = 256 bits = 64 hex chars
    expect(/^[0-9a-f]+$/i.test(hash)).toBe(true);
  });

  test("相同输入产生相同哈希（确定性）", () => {
    // Arrange
    const token = "same-token";

    // Act
    const hash1 = hashRefreshToken(token);
    const hash2 = hashRefreshToken(token);

    // Assert
    expect(hash1).toBe(hash2);
  });

  test("不同输入产生不同哈希", () => {
    // Act
    const hash1 = hashRefreshToken("token-a");
    const hash2 = hashRefreshToken("token-b");

    // Assert
    expect(hash1).not.toBe(hash2);
  });
});
