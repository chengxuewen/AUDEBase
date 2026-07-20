/**
 * Bootstrap data generator for @audebase/plugin-core
 *
 * Generates all expected bootstrap data (admin user, roles, permissions, etc.)
 * without touching the database. Used by PluginCore.install() and getBootstrapData().
 */

import { randomUUID } from 'node:crypto'
import { hashSync } from 'bcryptjs'

// === Types ===

export interface AdminUserData {
  id: string
  username: string
  passwordHash: string
  mustChangePassword: boolean
  isActive: boolean
  tokenVersion: number
  tenantId: null
}

export interface RoleData {
  id: string
  name: string
  slug: string
  description: string
  isSystem: boolean
  tenantId: null
}

export interface PermissionData {
  id: string
  action: string
  resource: string
  description: string
  tenantId: null
}

export interface RolePermissionData {
  roleId: string
  permissionId: string
}

export interface UserRoleData {
  userId: string
  roleId: string
}

export interface SystemTenantData {
  id: string
  slug: string
  name: string
  status: string
}

export interface MenuData {
  id: string
  key: string
  name: string
  icon: string | null
  parentKey: string | null
  route: string | null
}

export interface BootstrapData {
  systemTenant: SystemTenantData
  adminUser: AdminUserData
  roles: RoleData[]
  /** Alias for roles - SDD property name */
  defaultRoles: RoleData[]
  permissions: PermissionData[]
  /** Alias for permissions - SDD property name */
  corePermissions: PermissionData[]
  rolePermissions: RolePermissionData[]
  userRoles: UserRoleData[]
  menus: MenuData[]
}

// === Constants ===

const DEFAULT_ADMIN_PASSWORD = 'Admin@123'

/** Core permissions: 5+ items covering plugin/user/role/audit/health management */
const CORE_PERMISSIONS: ReadonlyArray<{
  action: string
  resource: string
  description: string
}> = [
  { action: 'manage', resource: 'plugin', description: '插件管理（安装/卸载/启用/禁用）' },
  { action: 'manage', resource: 'user', description: '用户管理（创建/编辑/删除）' },
  { action: 'manage', resource: 'role', description: '角色管理（创建/编辑/删除）' },
  { action: 'read', resource: 'audit_log', description: '审计日志查看' },
  { action: 'read', resource: 'health', description: '健康检查查看' },
]

const DEFAULT_MENUS: ReadonlyArray<{
  key: string
  name: string
  icon: string | null
  parentKey: string | null
  route: string | null
}> = [
  { key: 'admin', name: '管理', icon: 'setting', parentKey: null, route: null },
  { key: 'admin.plugins', name: '插件管理', icon: 'appstore', parentKey: 'admin', route: '/admin/plugins' },
  { key: 'admin.users', name: '用户管理', icon: 'team', parentKey: 'admin', route: '/admin/users' },
  { key: 'admin.roles', name: '角色管理', icon: 'safety', parentKey: 'admin', route: '/admin/roles' },
]

// === Generator ===

/**
 * Generate bootstrap data with unique UUIDs.
 * Each call produces fresh UUIDs - safe to call multiple times.
 */
export function generateBootstrapData(): BootstrapData {
  const adminRoleId = randomUUID()
  const memberRoleId = randomUUID()

  const roles: RoleData[] = [
    {
      id: adminRoleId,
      name: '管理员',
      slug: 'admin',
      description: '系统管理员，拥有全部权限',
      isSystem: true,
      tenantId: null,
    },
    {
      id: memberRoleId,
      name: '成员',
      slug: 'member',
      description: '普通成员，拥有基础读取权限',
      isSystem: true,
      tenantId: null,
    },
  ]

  const permissions: PermissionData[] = CORE_PERMISSIONS.map((p) => ({
    id: randomUUID(),
    action: p.action,
    resource: p.resource,
    description: p.description,
    tenantId: null,
  }))

  // admin gets ALL permissions
  const adminRolePermissions: RolePermissionData[] = permissions.map((p) => ({
    roleId: adminRoleId,
    permissionId: p.id,
  }))

  // member gets read:health only
  const healthPerm = permissions.find((p) => p.action === 'read' && p.resource === 'health')
  const memberRolePermissions: RolePermissionData[] = healthPerm
    ? [{ roleId: memberRoleId, permissionId: healthPerm.id }]
    : []

  const rolePermissions: RolePermissionData[] = [...adminRolePermissions, ...memberRolePermissions]

  const adminUserId = randomUUID()

  const adminUser: AdminUserData = {
    id: adminUserId,
    username: 'admin',
    passwordHash: hashSync(DEFAULT_ADMIN_PASSWORD, 10),
    mustChangePassword: true,
    isActive: true,
    tokenVersion: 0,
    tenantId: null,
  }

  const userRoles: UserRoleData[] = [
    { userId: adminUserId, roleId: adminRoleId },
  ]

  const systemTenant: SystemTenantData = {
    id: randomUUID(),
    slug: 'system',
    name: '系统',
    status: 'active',
  }

  const menus: MenuData[] = DEFAULT_MENUS.map((m) => ({
    id: randomUUID(),
    key: m.key,
    name: m.name,
    icon: m.icon,
    parentKey: m.parentKey,
    route: m.route,
  }))

  return {
    systemTenant,
    adminUser,
    roles,
    defaultRoles: roles,
    permissions,
    corePermissions: permissions,
    rolePermissions,
    userRoles,
    menus,
  }
}
