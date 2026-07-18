import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { I18nEngine } from "@audebase/i18n";
import type { I18nConfig } from "@audebase/i18n";
import type { LocaleCode, TranslateFunction } from "@audebase/shared-types";

// Module-level engine reference, set during plugin registration
let engine: I18nEngine | null = null;

declare module "fastify" {
  interface FastifyInstance {
    i18n: I18nEngine;
  }
  interface FastifyRequest {
    /**
     * Translate a key for the current request's locale.
     * Locale detected from Accept-Language header, falls back to defaultLocale.
     */
    t: TranslateFunction;
  }
}

/** Plugin registration options */
export interface I18nPluginOptions {
  config?: Partial<I18nConfig>;
  /** Bootstrap translations to load at startup */
  bootstrap?: Record<LocaleCode, Record<string, string>>;
}

/** Bootstrap zh-CN translations for Phase 1a */
const ZH_CN_BOOTSTRAP: Record<string, string> = {
  "auth.login_success": "登录成功",
  "auth.login_failed": "用户名或密码错误",
  "auth.token_expired": "登录已过期，请重新登录",
  "auth.must_change_password": "首次登录需要修改密码",
  "auth.account_disabled": "帐号已被禁用",
  "common.save": "保存",
  "common.cancel": "取消",
  "common.delete": "删除",
  "common.confirm": "确认",
  "common.search": "搜索",
  "common.loading": "加载中...",
  "error.forbidden": "无权限",
  "error.not_found": "未找到",
  "error.internal": "服务器内部错误",
  "error.validation": "输入数据验证失败",
};

/**
 * Detect the request locale from Accept-Language header.
 * Returns the first 2-character language code, or defaultLocale if not detectable.
 */
function detectLocale(request: FastifyRequest, defaultLocale: LocaleCode): LocaleCode {
  const header = request.headers["accept-language"];
  if (!header) return defaultLocale;

  const firstTag = header.split(",")[0];
  if (!firstTag) return defaultLocale;

  // Extract primary language subtag (e.g., "zh-CN" → "zh", "en-US" → "en")
  const lang = firstTag.trim().split("-")[0];
  if (!lang || lang.length < 2) return defaultLocale;

  return lang;
}

/**
 * i18nPlugin — Fastify 国际化插件
 *
 * 注册后:
 * - fastify.i18n → I18nEngine 实例
 * - request.t(key, params?) → 翻译函数，自动检测请求语言
 */
function i18nPlugin(fastify: FastifyInstance, options: I18nPluginOptions): void {
  const defaultLocale: LocaleCode = (options.config?.defaultLocale as LocaleCode) ?? "zh";

  engine = new I18nEngine({
    defaultLocale,
    fallbackLocale: options.config?.fallbackLocale ?? "en",
  });

  // Load bootstrap translations
  const bootstrap = options.bootstrap ?? { zh: ZH_CN_BOOTSTRAP };
  for (const [locale, translations] of Object.entries(bootstrap)) {
    engine.loadLocale(locale, translations);
  }

  fastify.decorate("i18n", engine);

  // Decorate each request with a locale-aware t() function
  fastify.decorateRequest("t", null);
  fastify.addHook("onRequest", (request) => {
    const locale = detectLocale(request, defaultLocale);
    request.t = engine.t(locale);
  });
}

export default fp(i18nPlugin, {
  name: "audebase-i18n",
  fastify: "5.x",
});
