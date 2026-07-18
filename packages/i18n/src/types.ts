import type { LocaleCode } from "@audebase/shared-types";

/**
 * Configuration for the I18nEngine.
 */
export interface I18nConfig {
  /** Default locale used as first fallback for missing translations. */
  defaultLocale: LocaleCode;
  /** Optional second fallback locale (defaults to 'en' when omitted). */
  fallbackLocale?: LocaleCode;
}
