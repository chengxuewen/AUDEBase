import { describe, test, expect } from "vitest";
import { ErrorCode, UserError } from "@audebase/shared-types";
import { rbacGuard } from "../middleware";
import type { PermissionEngine } from "../engine";

/**
 * 创建 mock 引擎
 */
function createMockEngine(canReturn: boolean): PermissionEngine {
  return {
    can: async () => canReturn,
    getUserPermissions: async () => [],
    invalidateCache: () => {},
    invalidateAllCache: () => {},
  } as unknown as PermissionEngine;
}

/**
 * 创建 mock Fastify request
 */
function createMockRequest(options: {
  hasUser: boolean;
  userId?: string;
}): Record<string, unknown> {
  if (options.hasUser) {
    return {
      user: {
        userId: options.userId ?? "user-1",
        tenantId: "tenant-1",
        username: "admin",
        roles: ["admin"],
      },
    };
  }
  return {};
}

describe("rbacGuard", () => {
  test("无 request.user → 抛出 AUTH_TOKEN_INVALID", async () => {
    // Arrange
    const engine = createMockEngine(true);
    const guard = rbacGuard(engine, "read", "user");
    const request = createMockRequest({ hasUser: false }) as never;
    const reply = {} as never;

    // Act & Assert
    await expect(guard(request, reply)).rejects.toThrow(UserError);
    await expect(guard(request, reply)).rejects.toMatchObject({
      code: ErrorCode.AUTH_TOKEN_INVALID,
    });
  });

  test("有权限 → 正常通过（不抛异常）", async () => {
    // Arrange
    const engine = createMockEngine(true);
    const guard = rbacGuard(engine, "read", "user");
    const request = createMockRequest({ hasUser: true }) as never;
    const reply = {} as never;

    // Act & Assert
    await expect(guard(request, reply)).resolves.toBeUndefined();
  });

  test("无权限 → 抛出 FORBIDDEN", async () => {
    // Arrange
    const engine = createMockEngine(false);
    const guard = rbacGuard(engine, "delete", "user");
    const request = createMockRequest({ hasUser: true }) as never;
    const reply = {} as never;

    // Act & Assert
    await expect(guard(request, reply)).rejects.toThrow(UserError);
    await expect(guard(request, reply)).rejects.toMatchObject({
      code: ErrorCode.FORBIDDEN,
    });
  });

  test("admin 有 manage 权限应通过", async () => {
    // Arrange
    const engine = createMockEngine(true);
    const guard = rbacGuard(engine, "manage", "plugin");
    const request = createMockRequest({
      hasUser: true,
      userId: "user-admin",
    }) as never;
    const reply = {} as never;

    // Act & Assert
    await expect(guard(request, reply)).resolves.toBeUndefined();
  });

  test("member 无 manage 权限应拒绝", async () => {
    // Arrange
    const engine = createMockEngine(false);
    const guard = rbacGuard(engine, "manage", "plugin");
    const request = createMockRequest({
      hasUser: true,
      userId: "user-member",
    }) as never;
    const reply = {} as never;

    // Act & Assert
    await expect(guard(request, reply)).rejects.toMatchObject({
      code: ErrorCode.FORBIDDEN,
    });
  });
});
