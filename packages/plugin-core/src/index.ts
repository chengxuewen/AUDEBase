/**
 * @audebase/plugin-core - Public API
 *
 * Zero-dependency kernel plugin for AUDEBase bootstrap data initialization.
 */

export { default, default as PluginCore } from './plugin-core.js'
export { generateBootstrapData } from './bootstrap-data.js'
export type {
  BootstrapData,
  AdminUserData,
  RoleData,
  PermissionData,
  RolePermissionData,
  UserRoleData,
  SystemTenantData,
  MenuData,
} from './bootstrap-data.js'
export { isBootstrapComplete } from './bootstrap-check.js'
export { PluginCoreErrorCode } from './plugin-core.js'
export type { PluginCoreErrorCodeValue } from './plugin-core.js'
export type { DatabaseProvider } from './types.js'
