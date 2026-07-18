import { z } from "zod";
import type { RoleBrief } from "./role";

/**
 * 用户实体
 */
export interface User {
  id: string;
  tenant_id: string;
  username: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  locale: string; // 默认 'zh-CN'
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null; // ISO 8601
  roles: RoleBrief[];
  created_at: string;
  updated_at: string;
}

/**
 * 创建用户请求
 */
export interface CreateUserRequest {
  username: string;
  email?: string;
  password: string;
  display_name?: string;
  role_ids: string[]; // 初始角色
}

/**
 * 更新用户请求
 */
export interface UpdateUserRequest {
  display_name?: string;
  email?: string;
  is_active?: boolean;
  locale?: string;
  role_ids?: string[];
  password?: string; // 修改密码
}

// === Zod Schemas ===

/** 创建用户请求 Zod schema */
export const createUserSchema = z.object({
  username: z.string().min(3).max(100),
  email: z.string().email().optional(),
  password: z
    .string()
    .min(8)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "密码必须包含大小写字母和数字"),
  display_name: z.string().min(1).max(200).optional(),
  role_ids: z.array(z.string().uuid()).min(1),
});

/** 更新用户请求 Zod schema */
export const updateUserSchema = z.object({
  display_name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  is_active: z.boolean().optional(),
  locale: z.string().min(2).max(10).optional(),
  role_ids: z.array(z.string().uuid()).optional(),
  password: z
    .string()
    .min(8)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "密码必须包含大小写字母和数字")
    .optional(),
});

/** 分页用户响应 Zod schema */
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
    pageSize: z.number().int().min(1).max(100),
    totalPages: z.number().int().min(0),
  }),
});
