import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PermissionBrief } from "@audebase/shared-types";

/**
 * 权限缓存项
 */
interface CachedPermissions {
  permissions: PermissionBrief[];
  expiresAt: number;
}

/** 缓存 TTL（5 分钟） */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * PermissionEngine — RBAC 权限检查引擎
 *
 * 从 user_roles → role_permissions → permissions 查询用户权限。
 * 支持 'manage' 作为超级权限（包含所有 CRUD）。
 * 包含内存缓存以减少重复查询。
 */
export class PermissionEngine {
  private cache: Map<string, CachedPermissions> = new Map();

  constructor(private db: NodePgDatabase) {}

  /**
   * 检查用户是否有指定权限
   *
   * 'manage' action 或 '*' resource 表示拥有所有权限。
   */
  async can(userId: string, action: string, resource: string): Promise<boolean> {
    // 先检查缓存
    const cached = this.getFromCache(userId);
    if (cached) {
      return cached.some(
        (p) =>
          p.action === "manage" ||
          p.resource === "*" ||
          (p.action === action && p.resource === resource),
      );
    }

    // 从数据库查询
    const result = await this.db.execute(sql`
      SELECT 1
      FROM user_roles ur
      JOIN role_permissions rp ON rp.role_id = ur.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = ${userId}
        AND (p.action = ${action} OR p.action = 'manage')
        AND (p.resource = ${resource} OR p.resource = '*')
      LIMIT 1
    `);

    return result.rows.length > 0;
  }

  /**
   * 获取用户的所有权限项列表
   */
  async getUserPermissions(userId: string): Promise<PermissionBrief[]> {
    const cached = this.getFromCache(userId);
    if (cached) return cached;

    const result = await this.db.execute<{ action: string; resource: string }>(sql`
      SELECT DISTINCT p.action, p.resource
      FROM user_roles ur
      JOIN role_permissions rp ON rp.role_id = ur.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = ${userId}
      ORDER BY p.resource, p.action
    `);

    const permissions: PermissionBrief[] = result.rows.map((r) => ({
      action: r.action as PermissionBrief["action"],
      resource: r.resource,
    }));

    // 写入缓存
    this.cache.set(userId, {
      permissions,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return permissions;
  }

  /**
   * 清除用户权限缓存（角色变更后调用）
   */
  invalidateCache(userId: string): void {
    this.cache.delete(userId);
  }

  /**
   * 清除所有缓存（role_permissions 表变更后调用）
   */
  invalidateAllCache(): void {
    this.cache.clear();
  }

  /**
   * 从缓存获取权限（检查未过期）
   */
  private getFromCache(userId: string): PermissionBrief[] | null {
    const entry = this.cache.get(userId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(userId);
      return null;
    }
    return entry.permissions;
  }
}
