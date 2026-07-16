/**
 * 插件 Manifest 类型（从 Zod schema 推导）
 *
 * @audebase/shared-types
 */

import { z } from 'zod'

/**
 * Manifest Zod schema
 */
export const manifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  display_name: z.string(),
  description: z.string().optional(),
  category: z.string().optional(),
  license: z.string().optional(),
  author: z.string().optional(),
  application: z.object({
    entry: z.string(),
  }),
  runtime: z.object({
    mode: z.enum(['inline', 'process', 'container']),
    partition: z.string(),
  }),
  dependencies: z.array(z.string()).optional(),
  auto_install: z.boolean().optional(),
})

/**
 * Manifest 类型（从 Zod schema 推导）
 */
export type Manifest = z.infer<typeof manifestSchema>
