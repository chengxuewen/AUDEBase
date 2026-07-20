/**
 * 用户类型
 *
 * @audebase/shared-types
 */

import { RoleBrief } from './role.js'

export interface User {
  id: string
  tenant_id: string
  username: string
  email: string | null
  display_name: string | null
  avatar_url: string | null
  locale: string // 默认 'zh-CN'
  is_active: boolean
  must_change_password: boolean
  last_login_at: string | null // ISO 8601
  roles: RoleBrief[]
  created_at: string
  updated_at: string
}

export interface CreateUserRequest {
  username: string
  email?: string
  password: string
  display_name?: string
  role_ids: string[]
}

export interface UpdateUserRequest {
  display_name?: string
  email?: string
  is_active?: boolean
  locale?: string
  role_ids?: string[]
  password?: string
}
