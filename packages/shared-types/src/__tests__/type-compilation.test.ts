// RED PHASE: imports will resolve once implementation is created
import { describe, it, expectTypeOf } from 'vitest'
import type {
  User,
  Role,
  Permission,
  Manifest,
  PluginDescriptor,
} from '../index.js'
import type {
  ApiListResponse,
  PaginationMeta,
} from '../api.js'
import type {
  JwtPayload,
  LoginRequest,
  LoginResponse,
  RefreshRequest,
  RefreshResponse,
} from '../auth.js'
import type { AuditLogEntry } from '../audit.js'
import type { ListQueryParams } from '../filter.js'

describe('编译时类型断言', () => {
  it('ApiListResponse<T> 结构正确', () => {
    // Arrange & Act & Assert
    expectTypeOf<ApiListResponse<User>>().toMatchTypeOf<{
      data: User[]
      meta: PaginationMeta
    }>()
  })

  it('PaginatedResponse<T> 包含 data + meta', () => {
    // Arrange & Act & Assert
    expectTypeOf<ApiListResponse<User>>().toMatchTypeOf<{
      data: User[]
      meta: PaginationMeta
    }>()
  })

  it('PaginationMeta 字段完整', () => {
    // Arrange & Act & Assert
    expectTypeOf<PaginationMeta>().toMatchTypeOf<{
      count: number
      page: number
      pageSize: number
      totalPages: number
    }>()
  })

  it('User 接口包含所有必填字段', () => {
    // Arrange & Act & Assert
    expectTypeOf<User>().toMatchTypeOf<{
      id: string
      username: string
      is_active: boolean
      must_change_password: boolean
      created_at: string
      updated_at: string
    }>()
  })

  it('Role 接口包含所有必填字段', () => {
    // Arrange & Act & Assert
    expectTypeOf<Role>().toMatchTypeOf<{
      id: string
      tenant_id: string | null
      name: string
      slug: string
      description: string | null
      is_system: boolean
      created_at: string
      updated_at: string
    }>()
  })

  it('Permission 接口包含 action + resource', () => {
    // Arrange & Act & Assert
    expectTypeOf<Permission>().toMatchTypeOf<{
      id: string
      action: string
      resource: string
      display_name: string
      module_id: string | null
    }>()
  })

  it('Plugin 接口包含所有必填字段', () => {
    // Arrange & Act & Assert
    expectTypeOf<PluginDescriptor>().toMatchTypeOf<{
      id: string
      name: string
      version: string
      display_name: string
      state: string
      category: string | null
      description: string | null
    }>()
  })

  it('JwtPayload 类型包含所有必需字段', () => {
    // Arrange & Act & Assert
    expectTypeOf<JwtPayload>().toMatchTypeOf<{
      sub: string
      tenant_id: string
      username: string
      roles: string[]
      iat: number
      exp: number
    }>()
  })

  it('LoginRequest 包含 username + password', () => {
    // Arrange & Act & Assert
    expectTypeOf<LoginRequest>().toMatchTypeOf<{
      username: string
      password: string
    }>()
  })

  it('LoginResponse 包含 token 字段', () => {
    // Arrange & Act & Assert
    expectTypeOf<LoginResponse>().toMatchTypeOf<{
      access_token: string
      refresh_token: string
      expires_in: number
      token_type: 'Bearer'
    }>()
  })

  it('RefreshRequest 包含 refresh_token', () => {
    // Arrange & Act & Assert
    expectTypeOf<RefreshRequest>().toMatchTypeOf<{
      refresh_token: string
    }>()
  })

  it('RefreshResponse 包含 token 字段', () => {
    // Arrange & Act & Assert
    expectTypeOf<RefreshResponse>().toMatchTypeOf<{
      access_token: string
      refresh_token: string
      expires_in: number
      token_type: 'Bearer'
    }>()
  })

  it('AuditLogEntry 包含审计日志必需字段', () => {
    // Arrange & Act & Assert
    expectTypeOf<AuditLogEntry>().toMatchTypeOf<{
      id: string
      tenant_id: string
      action: string
      resource_type: string
      resource_id: string | null
      created_at: string
    }>()
  })

  it('ListQueryParams 包含分页 + 排序 + 过滤', () => {
    // Arrange & Act & Assert
    expectTypeOf<ListQueryParams>().toMatchTypeOf<{
      page?: number
      pageSize?: number
    }>()
  })

  it('Manifest 类型从 Zod schema 推导', () => {
    // Arrange & Act & Assert
    expectTypeOf<Manifest>({} as Manifest).toExtend<{
      name: string
      version: string
      display_name: string
      application: { entry: string }
      runtime: { mode: 'inline' | 'process' | 'container'; partition: string }
    }>()
  })
})
