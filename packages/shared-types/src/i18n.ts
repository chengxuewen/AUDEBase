/**
 * 国际化类型
 *
 * @audebase/shared-types
 */

/**
 * 翻译字典 - 扁平 key-value 映射
 */
export type LocaleMap = Record<string, string>

/**
 * 语言代码 - ISO 639-1 + 可选 ISO 3166-1 地区码
 */
export type LocaleCode = string

/**
 * 翻译函数签名
 */
export type TranslateFunction = (
  key: string,
  params?: Record<string, string>,
) => string
