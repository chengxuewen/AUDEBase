import { z } from "zod";

/**
 * JWT Access Token Payload
 */
export interface JwtPayload {
  sub: string; // user.id
  tenant_id: string; // 当前租户
  username: string;
  roles: string[]; // 角色 slug 列表
  iat: number; // issued at
  exp: number; // expiration
}

/**
 * 用户摘要（登录响应中使用，不含敏感字段）
 */
export interface UserBrief {
  id: string;
  tenant_id: string;
  username: string;
  display_name: string;
  must_change_password: boolean;
  roles: string[];
}

/**
 * 登录请求
 */
export interface LoginRequest {
  username: string;
  password: string;
}

/**
 * 登录响应
 */
export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // 900 秒（15 分钟）
  token_type: "Bearer";
  user: UserBrief;
}

/**
 * 刷新 Token 请求
 */
export interface RefreshRequest {
  refresh_token: string;
}

/**
 * 刷新 Token 响应
 */
export interface RefreshResponse {
  access_token: string;
  refresh_token: string; // 刷新令牌轮转（旧 token 自动失效）
  expires_in: number;
  token_type: "Bearer";
}

/**
 * 登出请求
 */
export interface LogoutRequest {
  refresh_token: string;
}

// === Zod Schemas ===

/** 登录请求 Zod schema */
export const loginSchema = z.object({
  username: z.string().min(3).max(100),
  password: z.string().min(8),
});

/** Token 响应 Zod schema */
export const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  token_type: z.literal("Bearer"),
});

/** 刷新 Token 请求 Zod schema */
export const refreshSchema = z.object({
  refresh_token: z.string().min(1),
});

/** 登出请求 Zod schema */
export const logoutSchema = z.object({
  refresh_token: z.string().min(1),
});

/** 用户摘要 Zod schema */
export const userBriefSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  username: z.string().min(3).max(100),
  display_name: z.string(),
  must_change_password: z.boolean(),
  roles: z.array(z.string()),
});

/** 登录响应 Zod schema */
export const loginResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  token_type: z.literal("Bearer"),
  user: userBriefSchema,
});
