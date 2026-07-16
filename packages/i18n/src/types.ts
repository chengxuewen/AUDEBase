/**
 * i18n types
 *
 * @audebase/i18n
 */

import type { LocaleCode, LocaleMap } from '@audebase/shared-types'

/**
 * Translations organized by namespace then locale.
 * e.g. { 'plugin-core': { 'menu.plugins': '插件管理' }, client: { 'loading': '加载中...' } }
 */
export interface TranslatorConfig {
  translations: Record<string, LocaleMap>
  defaultLang: LocaleCode
}

export { LocaleCode, LocaleMap }
