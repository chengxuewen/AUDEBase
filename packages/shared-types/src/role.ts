import { z } from "zod";

/**
 * 权限动作
 */
export type PermissionAction = "create" | "read" | "update" | "delete" | "manage"; // 表示全部 CRUD + 管理

/**
 * 权限摘要
 */
export interface PermissionBrief {
  action: PermissionAction;
  resource: string;
}

/**
 * 角色摘要
 */
export interface RoleBrief {
  id: string;
  slug: string;
  name: string;
}

/**
 * 权限实体
 */
export interface Permission {
  id: string;
  action: PermissionAction;
  resource: string; // 如 'plugin', 'user', 'role', 'audit_log'
  display_name: string;
  module_id: string | null;
}

/**
 * 角色实体
 */
export interface Role {
  id: string;
  tenant_id: string | null; // NULL = 系统角色
  name: string;
  slug: string;
  description: string | null;
  is_system: boolean; // 系统角色不可删除
  permissions: PermissionBrief[];
  user_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * 创建角色请求
 */
export interface CreateRoleRequest {
  name: string;
  slug: string;
  description?: string;
  permission_ids: string[];
}

/**
 * 更新角色请求
 */
export interface UpdateRoleRequest {
  name?: string;
  description?: string;
  permission_ids?: string[];
}

// === Zod Schemas ===

/** 权限动作 Zod schema */
export const permissionActionSchema = z.enum(["create", "read", "update", "delete", "manage"]);

/** 创建角色请求 Zod schema */
export const createRoleSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z][a-z0-9_]*$/, "slug 必须为 snake_case 格式"),
  description: z.string().max(500).optional(),
  permission_ids: z.array(z.string().uuid()),
});

/** 更新角色请求 Zod schema */
export const updateRoleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  permission_ids: z.array(z.string().uuid()).optional(),
});

/** 分页角色响应 Zod schema */
export const paginatedRolesSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().uuid(),
      tenant_id: z.string().uuid().nullable(),
      name: z.string(),
      slug: z.string(),
      description: z.string().nullable(),
      is_system: z.boolean(),
      permissions: z.array(
        z.object({
          action: permissionActionSchema,
          resource: z.string(),
        }),
      ),
      user_count: z.number().int().min(0),
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

/** 分页权限响应 Zod schema */
export const paginatedPermissionsSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().uuid(),
      action: permissionActionSchema,
      resource: z.string(),
      display_name: z.string(),
      module_id: z.string().uuid().nullable(),
    }),
  ),
});
