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
