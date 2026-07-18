import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";

// ---------------------------------------------------------------------------
// Types (self-contained — zero runtime deps on other @audebase plugins)
// ---------------------------------------------------------------------------

/** Permission actions supported by AUDEBase RBAC */
export type PermissionAction =
  "create" | "read" | "update" | "delete" | "manage" | "export" | "import";

export interface BootstrapPermission {
  action: PermissionAction;
  resource: string;
  displayName: string;
}

export interface BootstrapRole {
  name: string;
  slug: string;
  description: string;
  isSystem: boolean;
}

export interface BootstrapMenuItem {
  key: string;
  label: string;
  icon: string;
  route?: string;
  parentKey?: string;
}

export interface BootstrapUser {
  username: string;
  email: string;
  passwordHash: string;
  mustChangePassword: boolean;
  displayName: string;
  roles: string[];
}

// ---------------------------------------------------------------------------
// Plugin install context — injected by PluginManager at load time
// ---------------------------------------------------------------------------

/** Logger interface matching what PluginHost injects (pino shape) */
export interface PluginLogger {
  info(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
}

/** Minimal DB context for plugin-core bootstrap — only the operations we need */
export interface PluginDbContext {
  /** Check whether any user record already exists */
  hasAnyUser(): Promise<boolean>;

  /** Insert a permission if not already present (by action+resource) */
  createPermission(perm: BootstrapPermission): Promise<void>;

  /** Insert a role if not already present */
  createRole(role: BootstrapRole): Promise<void>;

  /** Assign a permission to a role */
  assignPermissionToRole(
    roleSlug: string,
    action: PermissionAction,
    resource: string,
  ): Promise<void>;

  /** Insert a user with roles */
  createUser(user: BootstrapUser): Promise<void>;

  /** Insert a menu item */
  createMenuItem(item: BootstrapMenuItem): Promise<void>;
}

/** The shape injected as PluginHost / install context */
export interface PluginInstallContext {
  readonly db: PluginDbContext;
  readonly logger: PluginLogger;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BCRYPT_ROUNDS = 12;

const CORE_PERMISSIONS: BootstrapPermission[] = [
  { action: "manage", resource: "plugin", displayName: "Plugin Management" },
  { action: "read", resource: "plugin", displayName: "View Plugins" },
  { action: "manage", resource: "user", displayName: "User Management" },
  { action: "read", resource: "user", displayName: "View Users" },
];

const ADMIN_ROLE: BootstrapRole = {
  name: "Administrator",
  slug: "admin",
  description: "System administrator with full access",
  isSystem: true,
};

const MEMBER_ROLE: BootstrapRole = {
  name: "Member",
  slug: "member",
  description: "Default member with read-only access",
  isSystem: true,
};

const ALL_ACTIONS: PermissionAction[] = [
  "create",
  "read",
  "update",
  "delete",
  "manage",
  "export",
  "import",
];

const DEFAULT_MENUS: BootstrapMenuItem[] = [
  {
    key: "plugin-management",
    label: "Plugin Management",
    icon: "AppstoreOutlined",
    route: "/admin/plugins",
  },
  {
    key: "user-management",
    label: "User Management",
    icon: "TeamOutlined",
    route: "/admin/users",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generatePassword(): string {
  return randomBytes(16).toString("hex");
}

// ---------------------------------------------------------------------------
// install()
// ---------------------------------------------------------------------------

/**
 * Bootstrap install hook for plugin-core.
 *
 * Creates initial system data on first run:
 * 1. Core permissions (plugin:*, user:*)
 * 2. Admin role (all permissions)
 * 3. Member role (read-only)
 * 4. Admin user (random bcrypt-hashed password, must-change-on-login)
 * 5. Default menu items
 *
 * Idempotent — if an admin user already exists, all steps are skipped.
 */
export async function install(context: PluginInstallContext): Promise<void> {
  const { db, logger } = context;

  // Idempotency guard: skip if the system has already been bootstrapped.
  const alreadyBootstrapped = await db.hasAnyUser();
  if (alreadyBootstrapped) {
    logger.info({ phase: "bootstrap" }, "plugin-core already bootstrapped, skipping install");
    return;
  }

  logger.info({ phase: "bootstrap" }, "plugin-core install() started");

  // 1. Create core permissions
  logger.info({ phase: "bootstrap", step: "permissions" }, "creating core permissions");
  for (const perm of CORE_PERMISSIONS) {
    await db.createPermission(perm);
  }

  // 2. Create admin role
  logger.info({ phase: "bootstrap", step: "roles" }, "creating admin role");
  await db.createRole(ADMIN_ROLE);

  // 3. Create member role
  logger.info({ phase: "bootstrap", step: "roles" }, "creating member role");
  await db.createRole(MEMBER_ROLE);

  // 4. Assign all permissions to admin, read-only to member
  logger.info({ phase: "bootstrap", step: "role_permissions" }, "assigning permissions to roles");
  const permissionResources = [...new Set(CORE_PERMISSIONS.map((p) => p.resource))];
  for (const resource of permissionResources) {
    for (const action of ALL_ACTIONS) {
      await db.assignPermissionToRole("admin", action, resource);
    }
    await db.assignPermissionToRole("member", "read", resource);
  }

  // 5. Create admin user with random password
  logger.info({ phase: "bootstrap", step: "users" }, "creating admin user");
  const plainPassword = generatePassword();
  const passwordHash = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS);

  const adminUser: BootstrapUser = {
    username: "admin",
    email: "admin@audebase.local",
    passwordHash,
    mustChangePassword: true,
    displayName: "Administrator",
    roles: ["admin"],
  };
  await db.createUser(adminUser);

  // Log the generated password so the operator can use it on first login.
  // It is NOT persisted in plaintext — only the bcrypt hash goes to the DB.
  logger.info(
    { phase: "bootstrap", username: "admin" },
    `admin password generated (must change on first login): ${plainPassword}`,
  );

  // 6. Create default menus
  logger.info({ phase: "bootstrap", step: "menus" }, "creating default menus");
  for (const menu of DEFAULT_MENUS) {
    await db.createMenuItem(menu);
  }

  logger.info({ phase: "bootstrap" }, "plugin-core install() completed");
}
