/**
 * 认证/授权类型
 *
 * @audebase/shared-types
 */

/**
 * JWT Access Token Payload
 */
export interface JwtPayload {
  sub: string // user.id
  tenant_id: string // 当前租户
  username: string
  roles: string[] // 角色 slug 列表
  iat: number // issued at
  exp: number // expiration
}

/**
 * 登录请求
 */
export interface LoginRequest {
  username: string
  password: string
}

/**
 * 用户摘要（登录响应中使用，不含敏感字段）
 */
export interface UserBrief {
  id: string
  tenant_id: string
  username: string
  display_name: string
  must_change_password: boolean
  roles: string[]
}

/**
 * 登录响应
 */
export interface LoginResponse {
  access_token: string
  refresh_token: string
  expires_in: number // 900 秒（15 分钟）
  token_type: 'Bearer'
  user: UserBrief
}

/**
 * 刷新 Token 请求
 */
export interface RefreshRequest {
  refresh_token: string
}

/**
 * 刷新 Token 响应
 */
export interface RefreshResponse {
  access_token: string
  refresh_token: string // 刷新令牌轮转
  expires_in: number
  token_type: 'Bearer'
}

/**
 * 登出请求
 */
export interface LogoutRequest {
  refresh_token: string
}
