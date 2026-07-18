import { describe, test, expect, beforeEach } from "vitest";
import { PermissionEngine } from "../engine";

/**
 * 创建 mock DB 用于引擎测试
 */
function createMockDb(permissionRows: unknown[] = []) {
  return {
    execute: async () => ({ rows: permissionRows }),
  };
}

describe("PermissionEngine", () => {
  let engine: PermissionEngine;

  beforeEach(() => {
    engine = new PermissionEngine(createMockDb() as never);
  });

  describe("can", () => {
    test("有匹配权限时返回 true", async () => {
      // Arrange
      const db = createMockDb([{ "?column?": 1 }]);
      engine = new PermissionEngine(db as never);

      // Act
      const result = await engine.can("user-1", "read", "user");

      // Assert
      expect(result).toBe(true);
    });

    test("无匹配权限时返回 false", async () => {
      // Arrange
      const db = createMockDb([]);
      engine = new PermissionEngine(db as never);

      // Act
      const result = await engine.can("user-2", "delete", "plugin");

      // Assert
      expect(result).toBe(false);
    });

    test("manage action 授予所有权限", async () => {
      // Arrange
      const db = createMockDb([{ "?column?": 1 }]);
      engine = new PermissionEngine(db as never);

      // Act
      const result = await engine.can("user-admin", "delete", "plugin");

      // Assert
      expect(result).toBe(true);
    });
  });

  describe("getUserPermissions", () => {
    test("返回用户所有权限项", async () => {
      // Arrange
      const db = createMockDb([
        { action: "read", resource: "user" },
        { action: "read", resource: "health" },
        { action: "manage", resource: "plugin" },
      ]);
      engine = new PermissionEngine(db as never);

      // Act
      const perms = await engine.getUserPermissions("user-1");

      // Assert
      expect(perms).toHaveLength(3);
      expect(perms[0]).toEqual({ action: "read", resource: "user" });
    });

    test("无角色的用户返回空数组", async () => {
      // Arrange
      const db = createMockDb([]);
      engine = new PermissionEngine(db as never);

      // Act
      const perms = await engine.getUserPermissions("user-nobody");

      // Assert
      expect(perms).toEqual([]);
    });

    test("第二次调用使用缓存", async () => {
      // Arrange
      let callCount = 0;
      const db = {
        execute: async () => {
          callCount++;
          return {
            rows: [{ action: "read", resource: "user" }],
          };
        },
      };
      engine = new PermissionEngine(db as never);

      // Act
      await engine.getUserPermissions("user-1");
      await engine.getUserPermissions("user-1");

      // Assert — 缓存命中，只调用一次 DB
      expect(callCount).toBe(1);
    });
  });

  describe("invalidateCache", () => {
    test("清除指定用户的缓存", async () => {
      // Arrange
      let callCount = 0;
      const db = {
        execute: async () => {
          callCount++;
          return {
            rows: [{ action: "read", resource: "user" }],
          };
        },
      };
      engine = new PermissionEngine(db as never);

      // Act
      await engine.getUserPermissions("user-1");
      engine.invalidateCache("user-1");
      await engine.getUserPermissions("user-1");

      // Assert — 缓存被清除，DB 再次被调用
      expect(callCount).toBe(2);
    });
  });

  describe("invalidateAllCache", () => {
    test("清除所有用户缓存", async () => {
      // Arrange
      let callCount = 0;
      const db = {
        execute: async () => {
          callCount++;
          return {
            rows: [{ action: "read", resource: "user" }],
          };
        },
      };
      engine = new PermissionEngine(db as never);

      await engine.getUserPermissions("user-1");
      await engine.getUserPermissions("user-2");

      // Act
      engine.invalidateAllCache();
      await engine.getUserPermissions("user-1");
      await engine.getUserPermissions("user-2");

      // Assert — 所有缓存被清除
      expect(callCount).toBe(4);
    });
  });
});
