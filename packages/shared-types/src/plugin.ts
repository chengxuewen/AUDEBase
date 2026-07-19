import { z } from "zod";

/**
 * 插件状态
 */
export type PluginStatus =
  "discovered" | "installed" | "loaded" | "enabled" | "disabled" | "migration_failed";

/**
 * 插件运行时模式
 */
export type PluginRuntimeMode = "inline" | "process" | "container";

/**
 * 插件信任分区
 */
export type PluginPartition = string; // known values: SYSTEM, oa, erp, mes, isolated (Phase 1b+ supports custom partitions)

/**
 * 插件描述符（modules 表映射）
 */
export interface PluginDescriptor {
  id: string;
  name: string; // 包名，如 @audebase/plugin-core
  version: string; // SemVer
  display_name: string;
  state: PluginStatus;
  category: string | null;
  description: string | null;
  author: string | null;
  license: string | null;
  dependencies: string[]; // 依赖插件名列表
  runtime_mode: PluginRuntimeMode;
  runtime_partition: PluginPartition;
  auto_install: boolean;
  installed_at: string | null;
}

// === Zod Schemas ===

/** 插件状态 Zod schema */
export const pluginStatusSchema = z.enum([
  "discovered",
  "installed",
  "loaded",
  "enabled",
  "disabled",
  "migration_failed",
]);

/** 插件运行时模式 Zod schema */
export const pluginRuntimeModeSchema = z.enum(["inline", "process", "container"]);

/** 分页插件响应 Zod schema */
export const paginatedPluginsSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      version: z.string(),
      display_name: z.string(),
      state: pluginStatusSchema,
      category: z.string().nullable(),
      description: z.string().nullable(),
      dependencies: z.array(z.string()),
      runtime_mode: pluginRuntimeModeSchema,
      runtime_partition: z.string(),
      installed_at: z.string().nullable(),
    }),
  ),
  meta: z.object({
    count: z.number().int().min(0),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(100),
    totalPages: z.number().int().min(0),
  }),
});

/**
 * SemVer 版本号 (D1.8: API 版本控制)
 */
export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

/**
 * API 版本信息 - 关联 manifest.exports 中声明的 api_version
 */
export interface VersionInfo {
  apiVersion: SemVer;
  deprecated?: boolean;
  sunsetDate?: string;
}

/** SemVer 字符串正则: MAJOR.MINOR.PATCH[-PRERELEASE] */
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/;

/**
 * 解析 SemVer 版本字符串
 * @throws 版本字符串格式无效时抛出
 */
export function parseSemVer(version: string): SemVer {
  const m = version.trim().match(SEMVER_RE);
  if (!m) {
    throw new Error(`Invalid SemVer: "${version}". Expected MAJOR.MINOR.PATCH[-PRERELEASE]`);
  }
  return {
    major: parseInt(m[1]!, 10),
    minor: parseInt(m[2]!, 10),
    patch: parseInt(m[3]!, 10),
    ...(m[4] ? { prerelease: m[4] } : {}),
  };
}

/** SemVer Zod schema */
export const semVerSchema = z.string().regex(SEMVER_RE, "Invalid SemVer format");
