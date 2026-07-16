/**
 * Zod 边界验证 schema
 *
 * @audebase/shared-types
 */

import { z } from 'zod'

/**
 * 登录请求 schema
 * username: 3-100 字符
 * password: 8-128 字符
 */
export const loginSchema = z.object({
  username: z.string().min(3).max(100),
  password: z.string().min(8).max(128),
})

/**
 * Token 响应 schema
 */
export const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  token_type: z.literal('Bearer'),
})

/**
 * 分页用户响应 schema
 */
export const paginatedUsersSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().uuid(),
      username: z.string(),
      is_active: z.boolean(),
      created_at: z.string(),
    }),
  ),
  meta: z.object({
    count: z.number().int().min(0),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    totalPages: z.number().int().min(0),
  }),
})

/**
 * 健康检查响应 schema
 */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  db: z.boolean(),
  redis: z.boolean().optional(),
  uptime: z.number().min(0),
  version: z.string().optional(),
  timestamp: z.string().optional(),
})

/**
 * 错误响应 schema
 */
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
})

/**
 * 创建用户 schema
 * password: 至少 8 字符，含大写+小写+数字+特殊字符
 */
export const createUserSchema = z.object({
  username: z.string().min(3).max(100),
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/, '必须包含大写字母')
    .regex(/[a-z]/, '必须包含小写字母')
    .regex(/[0-9]/, '必须包含数字')
    .regex(/[^A-Za-z0-9]/, '必须包含特殊字符'),
  email: z.string().email().optional(),
  display_name: z.string().optional(),
  role_slugs: z.array(z.string().min(1)).min(1),
  is_active: z.boolean().optional(),
})

/**
 * 更新用户 schema
 */
export const updateUserSchema = z.object({
  display_name: z.string().optional(),
  email: z.string().email().optional(),
  is_active: z.boolean().optional(),
  locale: z.string().optional(),
  role_ids: z.array(z.string()).optional(),
  password: z.string().min(8).optional(),
})

/**
 * 创建角色 schema
 * slug: snake_case 格式
 */
export const createRoleSchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z][a-z0-9_]*$/),
  description: z.string().optional(),
  permission_ids: z.array(z.string().min(1)),
})
