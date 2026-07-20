/**
 * Environment variable schema and config loader.
 *
 * @audebase/core
 */

import { z } from 'zod'

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  AUDE_JWT_SECRET: z.string().min(32, 'AUDE_JWT_SECRET must be at least 32 characters'),

  DATABASE_URL: z
    .string()
    .refine((url) => url.startsWith('postgres://') || url.startsWith('postgresql://'), 'DATABASE_URL must be a postgres:// or postgresql:// URL'),

  REDIS_URL: z.string().url().optional(),

  AUDE_LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),

  AUDE_SLOW_QUERY_THRESHOLD_MS: z.coerce.number().int().min(1).default(100),

  AUDE_CORS_ORIGINS: z.string().optional(),

  AUDE_JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),

  AUDE_JWT_REFRESH_TTL: z.coerce.number().int().positive().default(604800),

  AUDE_BCRYPT_COST: z.coerce.number().int().min(10).max(15).default(12),

  AUDE_DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
})

export type AppConfig = z.infer<typeof configSchema>

/**
 * Parse and validate environment variables.
 * Throws a clear error listing which vars are missing/invalid.
 */
export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const result = configSchema.safeParse(env)

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => {
        const path = issue.path.join('.')
        return `  ${path || '(root)'}: ${issue.message}`
      })
      .join('\n')
    throw new Error(`Configuration validation failed:\n${issues}`)
  }

  return result.data
}
