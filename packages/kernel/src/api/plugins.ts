import type { FastifyInstance, FastifyBaseLogger } from "fastify";
import type { PluginDescriptor } from "@audebase/shared-types";
import { createAuthMiddleware } from "../auth/middleware";
import { Permissions, Resources } from "../auth/permissions";
import { rbacGuard } from "../plugins/rbac";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

// ponytail: static mock data until PluginManager is wired to modules table
const MOCK_PLUGINS: PluginDescriptor[] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    name: "plugin-core",
    version: "0.1.0",
    display_name: "内核插件",
    state: "enabled",
    category: "SYSTEM",
    description: "平台核心引导插件，负责首次运行时创建 admin 用户、默认角色和系统租户",
    author: "AUDEBase",
    license: "Apache-2.0",
    dependencies: [],
    runtime_mode: "inline",
    runtime_partition: "SYSTEM",
    auto_install: true,
    installed_at: "2026-07-14T00:00:00Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    name: "plugin-rbac",
    version: "0.1.0",
    display_name: "RBAC 权限引擎",
    state: "enabled",
    category: "SYSTEM",
    description: "基于角色的访问控制，支持角色管理、权限分配和 Record Rules",
    author: "AUDEBase",
    license: "Apache-2.0",
    dependencies: ["plugin-core"],
    runtime_mode: "inline",
    runtime_partition: "SYSTEM",
    auto_install: true,
    installed_at: "2026-07-14T00:00:00Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000003",
    name: "plugin-audit",
    version: "0.1.0",
    display_name: "审计日志",
    state: "loaded",
    category: "SYSTEM",
    description: "自动记录 API 写操作审计日志，支持按资源类型和时间范围查询",
    author: "AUDEBase",
    license: "Apache-2.0",
    dependencies: ["plugin-core"],
    runtime_mode: "inline",
    runtime_partition: "SYSTEM",
    auto_install: false,
    installed_at: "2026-07-14T00:00:00Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000004",
    name: "plugin-health-check",
    version: "0.1.0",
    display_name: "健康检查",
    state: "enabled",
    category: "SYSTEM",
    description: "提供 GET /health 和 /health/ready 端点，监控数据库和 Redis 连接状态",
    author: "AUDEBase",
    license: "Apache-2.0",
    dependencies: [],
    runtime_mode: "inline",
    runtime_partition: "SYSTEM",
    auto_install: true,
    installed_at: "2026-07-14T00:00:00Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000005",
    name: "plugin-i18n",
    version: "0.1.0",
    display_name: "国际化",
    state: "disabled",
    category: "SYSTEM",
    description: "多语言支持，预加载 zh-CN 和 en 翻译资源",
    author: "AUDEBase",
    license: "Apache-2.0",
    dependencies: ["plugin-core"],
    runtime_mode: "inline",
    runtime_partition: "SYSTEM",
    auto_install: false,
    installed_at: null,
  },
];

interface PaginatedPlugins {
  data: PluginDescriptor[];
  meta: {
    count: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

/**
 * 注册插件管理路由到 Fastify 实例
 *
 * - GET /api/plugins — 分页插件列表（当前返回静态 mock 数据）
 */
export function registerPluginRoutes(
  app: FastifyInstance,
  _db: NodePgDatabase, // unused for now — ponytail: will use modules table when PluginManager is wired
  jwtSecret: string,
  logger: FastifyBaseLogger,
): void {
  const requireAuth = createAuthMiddleware(_db, jwtSecret);

  app.get(
    "/api/plugins",
    { preHandler: [requireAuth, rbacGuard(Permissions.PLUGINS_READ, Resources.PLUGIN)] },
    (request): PaginatedPlugins => {
      const query = request.query as Record<string, string>;
      const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
      const pageSize = Math.min(Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20), 100);

      const all = MOCK_PLUGINS;
      const totalPages = Math.ceil(all.length / pageSize);
      const start = (page - 1) * pageSize;
      const pageData = all.slice(start, start + pageSize);

      logger.info({ pluginCount: all.length, page, pageSize }, "plugin list requested");

      return {
        data: pageData,
        meta: {
          count: all.length,
          page,
          pageSize,
          totalPages,
        },
      };
    },
  );
}
