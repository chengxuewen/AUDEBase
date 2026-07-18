import type { LocaleCode, LocaleMap, TranslateFunction } from "@audebase/shared-types";
import type { I18nConfig } from "./types.js";

/**
 * Minimal i18n engine for Phase 1a.
 *
 * - Stores flat key-value translation maps per locale.
 * - loadLocale() performs a shallow merge (unrelated keys survive).
 * - translate() follows the fallback chain:
 *   requested locale → config.defaultLocale → 'en' → raw key (never throws).
 * - Param interpolation uses `{{name}}` syntax.
 */
export class I18nEngine {
  private readonly translations = new Map<LocaleCode, LocaleMap>();
  private readonly config: Required<I18nConfig>;

  constructor(config: I18nConfig) {
    this.config = {
      defaultLocale: config.defaultLocale,
      fallbackLocale: config.fallbackLocale ?? "en",
    };
  }

  /**
   * Load (or merge) translations for a locale.
   * Shallow merge — existing keys for *other* locales are preserved,
   * and only the given locale's map is extended/replaced.
   */
  loadLocale(locale: LocaleCode, translations: LocaleMap): void {
    const current = this.translations.get(locale);
    if (current === undefined) {
      this.translations.set(locale, { ...translations });
      return;
    }
    // ponytail: shallow merge — spreads are allocation-heavy per-call
    // but this is startup-only, so O(n) spread is fine.
    this.translations.set(locale, { ...current, ...translations });
  }

  /**
   * Translate a key for the given locale with optional param interpolation.
   *
   * Fallback chain:
   *  1. requested locale
   *  2. config.defaultLocale
   *  3. config.fallbackLocale (defaults to 'en')
   *  4. return the raw key (never throws)
   */
  translate(locale: LocaleCode, key: string, params?: Record<string, string | number>): string {
    const raw = this.lookupRaw(locale, key);
    if (params === undefined) return raw;
    return this.interpolate(raw, params);
  }

  /**
   * Returns a reusable translation function bound to the given locale.
   */
  t(locale: LocaleCode): TranslateFunction {
    return (key: string, params?: Record<string, string | number>): string => {
      return this.translate(locale, key, params);
    };
  }

  /**
   * List all locales that have been loaded via loadLocale().
   */
  getAvailableLocales(): LocaleCode[] {
    return Array.from(this.translations.keys());
  }

  // ---- private helpers ----

  private lookupRaw(locale: LocaleCode, key: string): string {
    const chain = [locale, this.config.defaultLocale, this.config.fallbackLocale];

    for (const lc of chain) {
      const map = this.translations.get(lc);
      if (map !== undefined) {
        const value = map[key];
        if (value !== undefined) return value;
      }
    }

    return key;
  }

  private interpolate(template: string, params: Record<string, string | number>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
      const value = params[name];
      return value !== undefined ? String(value) : _match;
    });
  }
}
