/**
 * Manifest Zod Schema - Phase 1a manifest.yaml validation
 */
import { z } from 'zod'

const PLUGIN_NAME_REGEX = /^@[a-z][a-z0-9-]*\/plugin-[\w-]+$/
const SEMVER_REGEX = /^\d+\.\d+\.\d+(?:-[\w.]+)?(?:\+[\w.]+)?$/

export const manifestSchema = z.object({
  name: z
    .string()
    .regex(PLUGIN_NAME_REGEX, '插件名必须符合 @{scope}/plugin-{name} 格式')
    .describe('插件包名'),

  version: z
    .string()
    .regex(SEMVER_REGEX, '版本号必须符合 SemVer 格式 (1.0.0)')
    .describe('SemVer 版本'),

  display_name: z
    .string()
    .min(1, '显示名称不能为空')
    .max(255, '显示名称最多 255 个字符')
    .optional()
    .describe('显示名称'),

  description: z.string().optional().describe('插件描述'),

  category: z.enum(['SYSTEM', 'business', 'integration', 'theme']).optional().describe('插件分类'),

  license: z.string().default('Apache-2.0').describe('许可协议'),

  application: z.object({
      entry: z.string().min(1, '入口文件路径不能为空').describe('入口文件路径'),
      author: z.string().optional().describe('作者'),
    })
    .optional(),

  dependencies: z
    .array(z.string().regex(PLUGIN_NAME_REGEX, '依赖项必须是有效的插件包名'))
    .default([])
    .describe('依赖列表'),

  assets: z.array(z.string()).default([]).describe('资源文件列表'),

  runtime: z.object({
      mode: z.literal('inline').describe('运行时模式 (Phase 1a 仅 inline)'),
      partition: z
        .string()
        .min(1, 'partition 不能为空')
        .describe('信任分组'),
      crash_policy: z.enum(['restart', 'ignore']).default('restart').describe('崩溃策略'),
    })
    .optional(),

  security: z
    .object({
      db_namespace: z.string().optional().describe('数据库命名空间'),
    })
    .default({})
    .describe('安全配置'),

  models: z
    .array(
      z.object({
        name: z
          .string()
          .min(1, 'Collection 名称不能为空')
          .regex(/^[a-z][a-z0-9_]*$/, 'Collection 名必须为 snake_case'),
        table: z
          .string()
          .min(1, '表名不能为空')
          .regex(/^[a-z][a-z0-9_]*$/, '表名必须为 snake_case'),
      }),
    )
    .default([])
    .describe('数据模型声明'),

  permissions: z
    .array(
      z
        .object({
          action: z
            .string()
            .min(1)
            .regex(/^[a-z][a-z0-9_:*]+$/, 'action 格式: resource:verb'),
          resource: z
            .string()
            .min(1)
            .regex(/^[a-z][a-z0-9_-]+$/, 'resource 必须为 kebab-case'),
          description: z.string().optional(),
          // Extra fields allowed by tests (is_global, priority)
          is_global: z.boolean().optional(),
          priority: z.number().optional(),
        })
        // Allow unknown permission keys to pass through (tests use is_global/priority)
        .passthrough(),
    )
    .default([])
    .describe('权限声明'),

  locale: z
    .object({
      path: z.string().min(1).describe('翻译文件目录路径'),
    })
    .optional()
    .describe('国际化配置'),

  data: z.array(z.string()).default([]).describe('SQL 种子文件路径列表'),

  lifecycle: z
    .object({
      auto_install: z.boolean().default(false).describe('是否自动安装'),
      crash_policy: z.enum(['restart', 'ignore']).optional(),
      migration_version: z.string().optional(),
    })
    .optional()
    .describe('生命周期配置'),

  cron: z
    .array(
      z.object({
        name: z.string().min(1),
        schedule: z.string().min(1),
        handler: z.string().min(1),
      }),
    )
    .default([])
    .describe('定时任务声明'),
})

export type Manifest = z.infer<typeof manifestSchema>
