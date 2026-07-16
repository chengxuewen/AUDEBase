/**
 * 角色/权限类型
 *
 * @audebase/shared-types
 */

export type PermissionAction =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'manage'

export interface Permission {
  id: string
  action: PermissionAction
  resource: string
  display_name: string
  module_id: string | null
}

export interface PermissionBrief {
  action: PermissionAction
  resource: string
}

export interface Role {
  id: string
  tenant_id: string | null // NULL = 系统角色
  name: string
  slug: string
  description: string | null
  is_system: boolean
  permissions: PermissionBrief[]
  user_count: number
  created_at: string
  updated_at: string
}

export interface RoleBrief {
  id: string
  slug: string
  name: string
}

export interface CreateRoleRequest {
  name: string
  slug: string
  description?: string
  permission_ids: string[]
}

export interface UpdateRoleRequest {
  name?: string
  description?: string
  permission_ids?: string[]
}
