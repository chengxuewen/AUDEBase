/**
 * Locale file loader + validator
 *
 * @audebase/i18n
 */

import { readFile } from 'node:fs/promises'
import type { LocaleMap } from '@audebase/shared-types'

/**
 * Minimal fs interface for dependency injection in tests.
 */
interface FsLike {
  readFile(path: string): Promise<string>
}

/**
 * Validate that a parsed locale object is a flat Record<string, string>.
 * Throws if any value is not a string (nested objects, numbers, etc.).
 */
export function validateLocaleFile(data: Record<string, unknown>): asserts data is LocaleMap {
  for (const [key, value] of Object.entries(data)) {
    if (typeof value !== 'string') {
      throw new Error(
        `Invalid locale file: key "${key}" has non-string value of type ${typeof value}`,
      )
    }
  }
}

/**
 * Load a locale JSON file and return validated flat translations.
 * Returns `{}` if the file cannot be read (ENOENT etc.).
 * Throws on invalid JSON.
 */
export async function loadLocaleFile(
  path: string,
  fs?: FsLike,
): Promise<LocaleMap> {
  const reader = fs ?? { readFile: (p: string) => readFile(p, 'utf-8') }

  let content: string
  try {
    content = await reader.readFile(path)
  } catch {
    return {}
  }

  const parsed: unknown = JSON.parse(content)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Invalid locale file: expected JSON object, got ${typeof parsed}`)
  }
  const record = parsed as Record<string, unknown>
  validateLocaleFile(record)
  return { ...record }
}
