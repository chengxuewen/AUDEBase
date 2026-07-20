/**
 * createTranslator - Core t() factory with ICU interpolation
 *
 * @audebase/i18n
 */

import type { TranslateFunction } from '@audebase/shared-types'
import type { TranslatorConfig } from './types.js'

/**
 * Replace {{var}} placeholders with param values.
 */
function interpolateSimple(text: string, params: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => params[name] ?? '')
}

/**
 * Parse ICU plural: {count, plural, =0 {text0} one {text1} other {textN}}
 * Returns the matched branch text with `#` replaced by the count.
 */
function interpolatePlural(text: string, params: Record<string, string>): string {
  // Match: {varName, plural, ...selectors}
  const pluralPattern = /\{(\w+),\s*plural,\s*([^{}]+(?:\{[^{}]*\}[^{}]*)+)\}/g

  return text.replace(pluralPattern, (_match, varName: string, body: string) => {
    const rawValue = params[varName] ?? '0'
    const count = parseInt(rawValue, 10)
    const countStr = String(count)

    // Extract branches: =N {text}, one {text}, other {text}
    const branchPattern = /(=\d+|one|other|zero|few|many)\s*\{([^{}]*)\}/g
    let exactMatch: string | undefined
    let keywordMatch: string | undefined
    let otherMatch: string | undefined

    let m: RegExpExecArray | null
    while ((m = branchPattern.exec(body)) !== null) {
      const selector: string | undefined = m[1]
      const branchText = m[2] ?? ''
      if (!selector) continue
      if (selector.startsWith('=')) {
        if (selector === `=${countStr}`) {
          exactMatch = branchText
        }
      } else if (selector === 'one' && count === 1) {
        keywordMatch = branchText
      } else if (selector === 'other') {
        otherMatch = branchText
      }
    }

    const chosen = exactMatch ?? keywordMatch ?? otherMatch ?? ''
    return chosen.replace(/#/g, countStr)
  })
}

function interpolate(text: string, params?: Record<string, string>): string {
  if (!params) return text
  const pluralized = interpolatePlural(text, params)
  return interpolateSimple(pluralized, params)
}

/**
 * Create a translator function bound to a set of translations.
 *
 * Key format: 'namespace:dot.path' or bare 'dot.path' (falls back to 'client' namespace).
 * Missing keys return the key string itself.
 */
export function createTranslator(config: TranslatorConfig): TranslateFunction {
  const { translations } = config

  function t(key: string, params?: Record<string, string>): string {
    const colonIdx = key.indexOf(':')
    let namespace: string
    let path: string

    if (colonIdx !== -1) {
      namespace = key.slice(0, colonIdx)
      path = key.slice(colonIdx + 1)
    } else {
      namespace = 'client'
      path = key
    }

    const ns = translations[namespace]
    if (!ns) return key

    const template = ns[path]
    if (!template) return key

    return interpolate(template, params)
  }

  return t
}
