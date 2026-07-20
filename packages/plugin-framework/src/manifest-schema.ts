/**
 * Plugin Manifest Zod Schema (Phase 1a)
 *
 * Based on D1.5 manifest.yaml spec.
 * Extends shared-types basic schema with runtime/security/models/permissions/locale/data/cron fields.
 */

import { z } from 'zod'

export const manifestSchema = z.object({
  // === Basic metadata ===
  name: z
    .string()
    .regex(
      /^@[a-z][a-z0-9-]*\/plugin-[\w-]+$/,
      '插件名必须以 @scope/plugin- 开头',
    ),
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+(-[\w.]+)?$/, 'SemVer 格式'),
  display_name: z.string().min(1).max(255),
  description: z.string().optional(),
  category: z.enum(['SYSTEM', 'business', 'integration', 'theme']).optional(),

  // === License ===
  license: z.string().default('Apache-2.0'),

  // === Plugin implementation ===
  application: z.object({
    entry: z.string(),
    author: z.string().optional(),
  }),

  // === Dependencies ===
  dependencies: z.array(z.string()).default([]),

  // === Assets ===
  assets: z.array(z.string()).default([]),

  // === Runtime config ===
  runtime: z.object({
    mode: z.literal('inline'), // Phase 1a: inline only
    partition: z.string(), // SYSTEM | oa | erp | mes | isolated
    crash_policy: z.enum(['restart', 'ignore']).default('restart'),
  }),

  // === Security ===
  security: z
    .object({
      db_namespace: z.string().optional(),
    })
    .default({}),

  // === Data models (Phase 1a skeleton) ===
  models: z
    .array(
      z.object({
        name: z.string(),
        table: z.string(),
      }),
    )
    .default([]),

  // === Permissions ===
  permissions: z
    .array(
      z.object({
        action: z.string(),
        resource: z.string(),
        description: z.string().optional(),
      }),
    )
    .default([]),

  // === i18n ===
  locale: z
    .object({
      path: z.string(),
    })
    .optional(),

  // === Seed data (plugin-core) ===
  data: z.array(z.string()).default([]),

  // === Cron jobs (Phase 1b) ===
  cron: z
    .array(
      z.object({
        name: z.string(),
        schedule: z.string(),
        handler: z.string(),
      }),
    )
    .default([]),
})

export type Manifest = z.infer<typeof manifestSchema>
