import { describe, test, expect } from "vitest";
import {
  createRole,
  listRoles,
  assignRole,
  revokeRole,
  getUserRoles,
  getAllPermissions,
} from "../roles";
import { UserError } from "@audebase/shared-types";

/**
 * 创建 mock DB
 *
 * 使用自引用确保 execute 和 transaction 共享同一个 execute 函数引用。
 */
function createMockDb() {
  const db = {
    execute: async (_query?: unknown) => ({ rows: [] as never[] }),
    transaction: async <T>(
      fn: (tx: { execute: (q: unknown) => Promise<{ rows: never[] }> }) => Promise<T>,
    ): Promise<T> => fn({ execute: db.execute }),
  };
  return db;
}

describe("createRole", () => {
  test("创建角色并返回 id", async () => {
    // Arrange
    const db = createMockDb();
    let insertCallCount = 0;
    db.execute = async () => {
      insertCallCount++;
      return { rows: [{ id: "role-001" } as never] };
    };

    // Act
    const result = await createRole(db as never, {
      name: "编辑者",
      slug: "editor",
      tenantId: null,
      permissionIds: [],
    });

    // Assert
    expect(result.id).toBe("role-001");
    expect(insertCallCount).toBe(1);
  });

  test("创建角色时分配权限", async () => {
    // Arrange
    const db = createMockDb();
    const calls: unknown[] = [];
    db.execute = async (query: unknown) => {
      calls.push(query);
      return { rows: [{ id: "role-002" } as never] };
    };

    // Act
    const result = await createRole(db as never, {
      name: "查看者",
      slug: "viewer",
      tenantId: null,
      permissionIds: ["perm-1", "perm-2"],
    });

    // Assert
    expect(result.id).toBe("role-002");
    expect(calls).toHaveLength(3);
  });

  test("角色创建失败时抛出错误", async () => {
    // Arrange
    const db = createMockDb();
    db.execute = async () => ({ rows: [] as never[] });

    // Act & Assert
    await expect(
      createRole(db as never, {
        name: "测试",
        slug: "test",
        tenantId: null,
        permissionIds: [],
      }),
    ).rejects.toThrow(UserError);
  });
});

describe("listRoles", () => {
  test("返回角色列表（含权限和用户数）", async () => {
    // Arrange
    const db = createMockDb();
    const roleRows = [
      {
        id: "role-1",
        tenant_id: null,
        name: "管理员",
        slug: "admin",
        description: null,
        is_system: true,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ];
    let queryIdx = 0;
    db.execute = async () => {
      queryIdx++;
      if (queryIdx === 1) return { rows: roleRows as never[] };
      if (queryIdx === 2) return { rows: [{ action: "manage", resource: "plugin" } as never] };
      return { rows: [{ count: 1 } as never] };
    };

    // Act
    const roles = await listRoles(db as never, null);

    // Assert
    expect(roles).toHaveLength(1);
    expect(roles[0]!.name).toBe("管理员");
    expect(roles[0]!.slug).toBe("admin");
    expect(roles[0]!.is_system).toBe(true);
    expect(roles[0]!.permissions).toHaveLength(1);
    expect(roles[0]!.user_count).toBe(1);
  });
});

describe("assignRole", () => {
  test("为用户分配角色（幂等）", async () => {
    // Arrange
    const db = createMockDb();
    let called = false;
    db.execute = async () => {
      called = true;
      return { rows: [] as never[] };
    };

    // Act
    await assignRole(db as never, "user-1", "role-admin", "tenant-1");

    // Assert
    expect(called).toBe(true);
  });
});

describe("revokeRole", () => {
  test("成功撤销用户角色", async () => {
    // Arrange
    const db = createMockDb();
    let queryIdx = 0;
    db.execute = async () => {
      queryIdx++;
      if (queryIdx === 1) return { rows: [{ is_system: false, slug: "editor" } as never] };
      if (queryIdx === 2) return { rows: [{ count: 2 } as never] };
      return { rows: [] as never[] };
    };
    db.transaction = async <T>(
      fn: (tx: { execute: typeof db.execute }) => Promise<T>,
    ): Promise<T> => fn({ execute: db.execute });

    // Act — should not throw
    await revokeRole(db as never, "user-1", "role-editor");
  });

  test("最后一个角色不可撤销", async () => {
    // Arrange
    const db = createMockDb();
    let queryIdx = 0;
    db.execute = async () => {
      queryIdx++;
      if (queryIdx === 1) return { rows: [{ is_system: false, slug: "member" } as never] };
      if (queryIdx === 2) return { rows: [{ count: 1 } as never] };
      return { rows: [] as never[] };
    };
    db.transaction = async <T>(
      fn: (tx: { execute: typeof db.execute }) => Promise<T>,
    ): Promise<T> => fn({ execute: db.execute });

    // Act & Assert
    await expect(revokeRole(db as never, "user-1", "role-member")).rejects.toThrow(UserError);
  });
});

describe("getUserRoles", () => {
  test("返回用户的角色列表", async () => {
    // Arrange
    const db = createMockDb();
    db.execute = async () => ({
      rows: [
        { id: "role-1", slug: "admin", name: "管理员" },
        { id: "role-2", slug: "member", name: "成员" },
      ] as never[],
    });

    // Act
    const roles = await getUserRoles(db as never, "user-1");

    // Assert
    expect(roles).toHaveLength(2);
    expect(roles[0]!.slug).toBe("admin");
    expect(roles[1]!.slug).toBe("member");
  });
});

describe("getAllPermissions", () => {
  test("返回所有权限项", async () => {
    // Arrange
    const db = createMockDb();
    db.execute = async () => ({
      rows: [
        { id: "perm-1", action: "manage", resource: "plugin", display_name: "插件管理" },
        { id: "perm-2", action: "read", resource: "health", display_name: "健康检查" },
      ] as never[],
    });

    // Act
    const perms = await getAllPermissions(db as never);

    // Assert
    expect(perms).toHaveLength(2);
    expect(perms[0]!.resource).toBe("plugin");
  });
});
