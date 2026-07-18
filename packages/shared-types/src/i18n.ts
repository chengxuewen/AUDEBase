/**
 * 翻译字典 — 扁平 key-value 映射
 *
 * key 风格: dot-separated 路径（如 'errors.unauthorized'、'users.create.title'）
 * ICU 消息格式: "已删除 {count} 条记录"
 */
export type LocaleMap = Record<string, string>;

/**
 * 语言代码 — ISO 639-1 + 可选 ISO 3166-1 地区码
 */
export type LocaleCode = string; // 如 'zh-CN', 'en-US'

/**
 * 翻译函数签名
 */
export type TranslateFunction = (key: string, params?: Record<string, string>) => string;
