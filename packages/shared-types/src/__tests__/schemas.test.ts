// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect } from 'vitest'
import {
  loginSchema,
  tokenResponseSchema,
  paginatedUsersSchema,
  healthResponseSchema,
  errorResponseSchema,
  createUserSchema,
  updateUserSchema,
  createRoleSchema,
} from '../schemas.js'

describe('loginSchema', () => {
  it('接受有效登录请求', () => {
    // Arrange & Act
    const result = loginSchema.safeParse({
      username: 'admin',
      password: 'Admin@123',
    })

    // Assert
    expect(result.success).toBe(true)
  })

  it('拒绝 username 过短', () => {
    // Arrange & Act
    const result = loginSchema.safeParse({
      username: 'ab',
      password: 'password123',
    })

    // Assert
    expect(result.success).toBe(false)
  })

  it('拒绝 password 过短', () => {
    // Arrange & Act
    const result = loginSchema.safeParse({
      username: 'admin',
      password: '1234567',
    })

    // Assert
    expect(result.success).toBe(false)
  })

  it('拒绝缺少必填字段', () => {
    // Arrange & Act
    const result = loginSchema.safeParse({ username: 'admin' })

    // Assert
    expect(result.success).toBe(false)
  })
})

describe('tokenResponseSchema', () => {
  it('接受有效 token 响应', () => {
    // Arrange & Act
    const result = tokenResponseSchema.safeParse({
      access_token: 'eyJ...',
      refresh_token: 'ref_...',
      expires_in: 900,
      token_type: 'Bearer',
    })

    // Assert
    expect(result.success).toBe(true)
  })

  it('拒绝 token_type 非 Bearer', () => {
    // Arrange & Act
    const result = tokenResponseSchema.safeParse({
      access_token: 'eyJ...',
      refresh_token: 'ref_...',
      expires_in: 900,
      token_type: 'Basic',
    })

    // Assert
    expect(result.success).toBe(false)
  })

  it('拒绝 expires_in 非正整数', () => {
    // Arrange & Act
    const result = tokenResponseSchema.safeParse({
      access_token: 'eyJ...',
      refresh_token: 'ref_...',
      expires_in: -1,
      token_type: 'Bearer',
    })

    // Assert
    expect(result.success).toBe(false)
  })
})

describe('paginatedUsersSchema', () => {
  it('接受有效分页响应', () => {
    // Arrange & Act
    const result = paginatedUsersSchema.safeParse({
      data: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          username: 'admin',
          is_active: true,
          created_at: '2026-07-13T10:00:00Z',
        },
      ],
      meta: {
        count: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      },
    })

    // Assert
    expect(result.success).toBe(true)
  })

  it('拒绝 data 中缺少 id', () => {
    // Arrange & Act
    const result = paginatedUsersSchema.safeParse({
      data: [{ username: 'admin', is_active: true, created_at: '2026-07-13T10:00:00Z' }],
      meta: { count: 1, page: 1, pageSize: 20, totalPages: 1 },
    })

    // Assert
    expect(result.success).toBe(false)
  })

  it('拒绝 id 非 UUID 格式', () => {
    // Arrange & Act
    const result = paginatedUsersSchema.safeParse({
      data: [
        { id: 'not-uuid', username: 'x', is_active: true, created_at: '2026-07-13T10:00:00Z' },
      ],
      meta: { count: 1, page: 1, pageSize: 20, totalPages: 1 },
    })

    // Assert
    expect(result.success).toBe(false)
  })
})

describe('healthResponseSchema', () => {
  it('接受有效健康检查响应', () => {
    // Arrange & Act
    const result = healthResponseSchema.safeParse({
      status: 'ok',
      db: true,
      redis: true,
      uptime: 86400,
      version: '0.1.0',
      timestamp: '2026-07-13T10:00:00Z',
    })

    // Assert
    expect(result.success).toBe(true)
  })

  it('redis 可选', () => {
    // Arrange & Act
    const result = healthResponseSchema.safeParse({
      status: 'ok',
      db: true,
      uptime: 0,
    })

    // Assert
    expect(result.success).toBe(true)
  })

  it('拒绝 status 非 ok', () => {
    // Arrange & Act
    const result = healthResponseSchema.safeParse({
      status: 'error',
      db: false,
      uptime: 0,
    })

    // Assert
    expect(result.success).toBe(false)
  })
})

describe('createUserSchema', () => {
  it('接受有效创建用户请求', () => {
    // Arrange & Act
    const result = createUserSchema.safeParse({
      username: 'newuser',
      password: 'SecurePass1!',
      role_slugs: ['member'],
      is_active: true,
    })

    // Assert
    expect(result.success).toBe(true)
  })

  it('拒绝 password 不符合复杂度', () => {
    // Arrange & Act
    const result = createUserSchema.safeParse({
      username: 'newuser',
      password: '12345678',
      role_slugs: ['member'],
    })

    // Assert
    expect(result.success).toBe(false)
  })

  it('拒绝空 role_slugs', () => {
    // Arrange & Act
    const result = createUserSchema.safeParse({
      username: 'newuser',
      password: 'SecurePass1!',
      role_slugs: [],
    })

    // Assert
    expect(result.success).toBe(false)
  })
})

describe('updateUserSchema', () => {
  it('接受有效更新用户请求', () => {
    // Arrange & Act
    const result = updateUserSchema.safeParse({
      display_name: '新名称',
      is_active: false,
    })

    // Assert
    expect(result.success).toBe(true)
  })
})

describe('createRoleSchema', () => {
  it('接受有效创建角色请求', () => {
    // Arrange & Act
    const result = createRoleSchema.safeParse({
      name: '审计员',
      slug: 'auditor',
      description: '审计日志查看权限',
      permission_ids: ['perm-uuid-1', 'perm-uuid-2'],
    })

    // Assert
    expect(result.success).toBe(true)
  })

  it('拒绝 slug 非 snake_case', () => {
    // Arrange & Act
    const result = createRoleSchema.safeParse({
      name: '审计员',
      slug: 'Auditor Role',
      permission_ids: [],
    })

    // Assert
    expect(result.success).toBe(false)
  })
})

describe('errorResponseSchema', () => {
  it('接受有效错误响应', () => {
    // Arrange & Act
    const result = errorResponseSchema.safeParse({
      error: {
        code: 'VALIDATION_ERROR',
        message: '用户名必填',
        details: { field: 'username' },
      },
    })

    // Assert
    expect(result.success).toBe(true)
  })

  it('拒绝缺少 error 字段', () => {
    // Arrange & Act
    const result = errorResponseSchema.safeParse({})

    // Assert
    expect(result.success).toBe(false)
  })
})
