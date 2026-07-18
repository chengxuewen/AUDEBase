import { describe, test, expect, vi, beforeEach } from "vitest";
import { install } from "../install";
import type {
  PluginInstallContext,
  PluginDbContext,
  BootstrapPermission,
  BootstrapRole,
  BootstrapUser,
  BootstrapMenuItem,
  PermissionAction,
} from "../install";

// ---------------------------------------------------------------------------
// Mock DB with inspection helpers
// ---------------------------------------------------------------------------

interface MockDb extends PluginDbContext {
  _getCreatedPermissions(): BootstrapPermission[];
  _getCreatedRoles(): BootstrapRole[];
  _getRolePermissions(): Array<{ roleSlug: string; action: PermissionAction; resource: string }>;
  _getCreatedUsers(): BootstrapUser[];
  _getCreatedMenus(): BootstrapMenuItem[];
  _markBootstrapped(): void;
}

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function createMockDb(): MockDb {
  const createdPermissions: BootstrapPermission[] = [];
  const createdRoles: BootstrapRole[] = [];
  const rolePermissions: Array<{ roleSlug: string; action: PermissionAction; resource: string }> =
    [];
  const createdUsers: BootstrapUser[] = [];
  const createdMenus: BootstrapMenuItem[] = [];

  let hasAnyUser = false;

  const db: MockDb = {
    async hasAnyUser(): Promise<boolean> {
      return hasAnyUser;
    },

    async createPermission(perm: BootstrapPermission): Promise<void> {
      const exists = createdPermissions.some(
        (p) => p.action === perm.action && p.resource === perm.resource,
      );
      if (!exists) {
        createdPermissions.push({ ...perm });
      }
    },

    async createRole(role: BootstrapRole): Promise<void> {
      const exists = createdRoles.some((r) => r.slug === role.slug);
      if (!exists) {
        createdRoles.push({ ...role });
      }
    },

    async assignPermissionToRole(
      roleSlug: string,
      action: PermissionAction,
      resource: string,
    ): Promise<void> {
      const exists = rolePermissions.some(
        (rp) => rp.roleSlug === roleSlug && rp.action === action && rp.resource === resource,
      );
      if (!exists) {
        rolePermissions.push({ roleSlug, action, resource });
      }
    },

    async createUser(user: BootstrapUser): Promise<void> {
      const exists = createdUsers.some((u) => u.email === user.email);
      if (!exists) {
        createdUsers.push({ ...user, passwordHash: user.passwordHash });
      }
      hasAnyUser = true;
    },

    async createMenuItem(item: BootstrapMenuItem): Promise<void> {
      const exists = createdMenus.some((m) => m.key === item.key);
      if (!exists) {
        createdMenus.push({ ...item });
      }
    },

    // Inspection helpers (not part of PluginDbContext contract)
    _getCreatedPermissions: () => [...createdPermissions],
    _getCreatedRoles: () => [...createdRoles],
    _getRolePermissions: () => [...rolePermissions],
    _getCreatedUsers: () => [...createdUsers],
    _getCreatedMenus: () => [...createdMenus],
    _markBootstrapped: () => {
      hasAnyUser = true;
    },
  };

  return db;
}

interface TestContext {
  ctx: PluginInstallContext;
  db: MockDb;
}

function setup(): TestContext {
  const db = createMockDb();
  const logger = createMockLogger();
  return { ctx: { db, logger }, db };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("plugin-core install()", () => {
  let tc: TestContext;

  beforeEach(() => {
    tc = setup();
  });

  // --- First install ---

  describe("first install", () => {
    test("creates all core permissions", async () => {
      await install(tc.ctx);

      const perms = tc.db._getCreatedPermissions();
      expect(perms).toHaveLength(4);

      const actionResources = perms.map((p) => `${p.action}:${p.resource}`);
      expect(actionResources).toContain("manage:plugin");
      expect(actionResources).toContain("read:plugin");
      expect(actionResources).toContain("manage:user");
      expect(actionResources).toContain("read:user");
    });

    test("creates admin role", async () => {
      await install(tc.ctx);

      const roles = tc.db._getCreatedRoles();
      const admin = roles.find((r) => r.slug === "admin");
      expect(admin).toBeDefined();
      expect(admin!.name).toBe("Administrator");
      expect(admin!.isSystem).toBe(true);
    });

    test("creates member role", async () => {
      await install(tc.ctx);

      const roles = tc.db._getCreatedRoles();
      const member = roles.find((r) => r.slug === "member");
      expect(member).toBeDefined();
      expect(member!.name).toBe("Member");
      expect(member!.isSystem).toBe(true);
    });

    test("admin role has all 7 permission actions", async () => {
      await install(tc.ctx);

      const adminPermissions = tc.db._getRolePermissions().filter((rp) => rp.roleSlug === "admin");

      const adminActions = [...new Set(adminPermissions.map((rp) => rp.action))];
      expect(adminActions.sort()).toEqual(
        ["create", "read", "update", "delete", "manage", "export", "import"].sort(),
      );

      // Verify admin has actions on both plugin and user resources
      const adminPluginActions = adminPermissions
        .filter((rp) => rp.resource === "plugin")
        .map((rp) => rp.action);
      expect(adminPluginActions).toHaveLength(7);
      expect(adminPluginActions).toContain("manage");

      const adminUserActions = adminPermissions
        .filter((rp) => rp.resource === "user")
        .map((rp) => rp.action);
      expect(adminUserActions).toHaveLength(7);
      expect(adminUserActions).toContain("manage");
    });

    test("member role has only read", async () => {
      await install(tc.ctx);

      const memberPermissions = tc.db
        ._getRolePermissions()
        .filter((rp) => rp.roleSlug === "member");

      const memberActions = [...new Set(memberPermissions.map((rp) => rp.action))];
      expect(memberActions).toEqual(["read"]);

      // member should have read on both resources
      const resources = memberPermissions.map((rp) => rp.resource).sort();
      expect(resources).toEqual(["plugin", "user"]);
    });

    test("creates admin user with bcrypt hashed password", async () => {
      await install(tc.ctx);

      const users = tc.db._getCreatedUsers();
      expect(users).toHaveLength(1);

      const admin = users[0]!;
      expect(admin.username).toBe("admin");
      expect(admin.email).toBe("admin@audebase.local");
      expect(admin.displayName).toBe("Administrator");
      expect(admin.mustChangePassword).toBe(true);
      expect(admin.roles).toEqual(["admin"]);

      // Password hash must be bcrypt format ($2b$, $2a$, or $2y$)
      expect(admin.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/);
    });

    test("creates default menu items", async () => {
      await install(tc.ctx);

      const menus = tc.db._getCreatedMenus();
      expect(menus).toHaveLength(2);

      const pluginMenu = menus.find((m) => m.key === "plugin-management");
      expect(pluginMenu).toBeDefined();
      expect(pluginMenu!.label).toBe("Plugin Management");
      expect(pluginMenu!.icon).toBe("AppstoreOutlined");
      expect(pluginMenu!.route).toBe("/admin/plugins");

      const userMenu = menus.find((m) => m.key === "user-management");
      expect(userMenu).toBeDefined();
      expect(userMenu!.label).toBe("User Management");
      expect(userMenu!.icon).toBe("TeamOutlined");
      expect(userMenu!.route).toBe("/admin/users");
    });

    test("logs bootstrap progress", async () => {
      await install(tc.ctx);

      expect(tc.ctx.logger.info).toHaveBeenCalledWith(
        { phase: "bootstrap" },
        "plugin-core install() started",
      );
      expect(tc.ctx.logger.info).toHaveBeenCalledWith(
        { phase: "bootstrap" },
        "plugin-core install() completed",
      );
    });
  });

  // --- Idempotency ---

  describe("idempotency", () => {
    test("second install is a no-op when bootstrapped already", async () => {
      // First install
      await install(tc.ctx);

      const usersAfterFirst = tc.db._getCreatedUsers().length;
      const permsAfterFirst = tc.db._getCreatedPermissions().length;
      const rolesAfterFirst = tc.db._getCreatedRoles().length;
      const menusAfterFirst = tc.db._getCreatedMenus().length;

      expect(usersAfterFirst).toBe(1);

      // Reset call counts on logger
      vi.clearAllMocks();

      // Second install
      await install(tc.ctx);

      // No new data created
      expect(tc.db._getCreatedUsers()).toHaveLength(usersAfterFirst);
      expect(tc.db._getCreatedPermissions()).toHaveLength(permsAfterFirst);
      expect(tc.db._getCreatedRoles()).toHaveLength(rolesAfterFirst);
      expect(tc.db._getCreatedMenus()).toHaveLength(menusAfterFirst);

      // Should log "already bootstrapped"
      expect(tc.ctx.logger.info).toHaveBeenCalledWith(
        { phase: "bootstrap" },
        expect.stringContaining("already bootstrapped"),
      );
    });

    test("does not create duplicate permissions on second install", async () => {
      await install(tc.ctx);
      const permCount = tc.db._getCreatedPermissions().length;

      await install(tc.ctx);
      expect(tc.db._getCreatedPermissions()).toHaveLength(permCount);
    });

    test("does not create duplicate users on second install", async () => {
      await install(tc.ctx);
      expect(tc.db._getCreatedUsers()).toHaveLength(1);

      await install(tc.ctx);
      expect(tc.db._getCreatedUsers()).toHaveLength(1);
    });
  });

  // --- Admin password ---

  describe("admin password", () => {
    test("admin password is bcrypt hashed", async () => {
      await install(tc.ctx);

      const admin = tc.db._getCreatedUsers()[0]!;
      expect(admin.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/);
      expect(admin.passwordHash).toHaveLength(60);
    });

    test("admin must change password on first login", async () => {
      await install(tc.ctx);

      const admin = tc.db._getCreatedUsers()[0]!;
      expect(admin.mustChangePassword).toBe(true);
    });
  });

  // --- Menu structure ---

  describe("menu items", () => {
    test("default menu items have expected structure", async () => {
      await install(tc.ctx);

      const menus = tc.db._getCreatedMenus();
      for (const menu of menus) {
        expect(menu).toHaveProperty("key");
        expect(menu).toHaveProperty("label");
        expect(menu).toHaveProperty("icon");
        expect(menu).toHaveProperty("route");
        expect(typeof menu.key).toBe("string");
        expect(typeof menu.label).toBe("string");
        expect(typeof menu.icon).toBe("string");
      }

      const keys = menus.map((m) => m.key).sort();
      expect(keys).toEqual(["plugin-management", "user-management"]);
    });
  });
});
