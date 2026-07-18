import { describe, test, expect, beforeEach } from "vitest";
import { I18nEngine } from "../i18n.js";
import type { I18nConfig } from "../types.js";

// --- helpers ---

function createEngine(overrides?: Partial<I18nConfig>): I18nEngine {
  return new I18nEngine({ defaultLocale: "zh-CN", ...overrides });
}

// --- basic translation lookup ---

describe("I18nEngine.translate — basic lookup", () => {
  let engine: I18nEngine;

  beforeEach(() => {
    // Arrange
    engine = createEngine({ defaultLocale: "zh-CN" });
    engine.loadLocale("zh-CN", { hello: "你好", save: "保存" });
  });

  test("returns translation when key exists", () => {
    // Act
    const result = engine.translate("zh-CN", "hello");
    // Assert
    expect(result).toBe("你好");
  });

  test("returns different key correctly", () => {
    const result = engine.translate("zh-CN", "save");
    expect(result).toBe("保存");
  });
});

// --- param interpolation ---

describe("I18nEngine.translate — param interpolation", () => {
  let engine: I18nEngine;

  beforeEach(() => {
    // Arrange
    engine = createEngine();
    engine.loadLocale("zh-CN", {
      greet: "你好 {{name}}",
      detail: "{{name}} 有 {{count}} 条消息",
    });
  });

  test("interpolates a single param", () => {
    // Act
    const result = engine.translate("zh-CN", "greet", { name: "张三" });
    // Assert
    expect(result).toBe("你好 张三");
  });

  test("interpolates multiple params", () => {
    const result = engine.translate("zh-CN", "detail", { name: "李四", count: "5" });
    expect(result).toBe("李四 有 5 条消息");
  });

  test("interpolates numeric params", () => {
    const result = engine.translate("zh-CN", "detail", { name: "王五", count: 42 });
    expect(result).toBe("王五 有 42 条消息");
  });

  test("keeps placeholder when param is missing", () => {
    const result = engine.translate("zh-CN", "greet", {});
    expect(result).toBe("你好 {{name}}");
  });

  test("no params — returns raw translation unchanged", () => {
    // Act
    const result = engine.translate("zh-CN", "greet");
    // Assert
    expect(result).toBe("你好 {{name}}");
  });
});

// --- fallback chain ---

describe("I18nEngine.translate — fallback chain", () => {
  test("falls back to defaultLocale when key missing in requested locale", () => {
    // Arrange
    const engine = createEngine({ defaultLocale: "zh-CN" });
    engine.loadLocale("zh-CN", { save: "保存" });
    engine.loadLocale("en", { save: "Save" });
    // Act
    const result = engine.translate("en", "save");
    // Assert — 'en' has its own "save", should use it
    expect(result).toBe("Save");
  });

  test("falls back to defaultLocale when key absent in requested locale", () => {
    // Arrange
    const engine = createEngine({ defaultLocale: "zh-CN" });
    engine.loadLocale("zh-CN", { hello: "你好" });
    engine.loadLocale("en", { bye: "Goodbye" });
    // Act — 'hello' is in zh-CN but not in 'en'
    const result = engine.translate("en", "hello");
    // Assert
    expect(result).toBe("你好");
  });

  test("falls back to fallbackLocale ('en') when missing in both requested and default", () => {
    // Arrange
    const engine = createEngine({ defaultLocale: "zh-CN" });
    engine.loadLocale("zh-CN", { hello: "你好" });
    engine.loadLocale("en", { save: "Save" });
    // Act — 'save' is NOT in zh-CN, IS in 'en' (fallback)
    const result = engine.translate("ja", "save");
    // Assert
    expect(result).toBe("Save");
  });

  test("returns raw key when missing in all locales", () => {
    // Arrange
    const engine = createEngine({ defaultLocale: "zh-CN" });
    engine.loadLocale("zh-CN", { hello: "你好" });
    // Act
    const result = engine.translate("zh-CN", "nonexistent.key");
    // Assert
    expect(result).toBe("nonexistent.key");
  });

  test("returns raw key when requested locale has no translations at all", () => {
    // Arrange
    const engine = createEngine({ defaultLocale: "zh-CN" });
    engine.loadLocale("zh-CN", { hello: "你好" });
    // Act — 'en' has never been loaded
    const result = engine.translate("en", "missing");
    // Assert — should fall through to zh-CN, then 'en' (no translations), then raw key
    expect(result).toBe("missing");
  });

  test("custom fallbackLocale is used instead of default 'en'", () => {
    // Arrange
    const engine = createEngine({ defaultLocale: "zh-CN", fallbackLocale: "ja" });
    engine.loadLocale("zh-CN", { hello: "你好" });
    engine.loadLocale("ja", { save: "保存する" });
    // Act
    const result = engine.translate("fr", "save");
    // Assert
    expect(result).toBe("保存する");
  });
});

// --- loadLocale merging ---

describe("I18nEngine.loadLocale — merging", () => {
  test("merges new translations into existing locale without overwriting unrelated keys", () => {
    // Arrange
    const engine = createEngine();
    engine.loadLocale("zh-CN", { hello: "你好", save: "保存" });
    // Act
    engine.loadLocale("zh-CN", { cancel: "取消" });
    // Assert
    expect(engine.translate("zh-CN", "hello")).toBe("你好");
    expect(engine.translate("zh-CN", "save")).toBe("保存");
    expect(engine.translate("zh-CN", "cancel")).toBe("取消");
  });

  test("overwrites existing key on subsequent load", () => {
    // Arrange
    const engine = createEngine();
    engine.loadLocale("zh-CN", { hello: "你好" });
    // Act
    engine.loadLocale("zh-CN", { hello: "您好" });
    // Assert
    expect(engine.translate("zh-CN", "hello")).toBe("您好");
  });

  test("does not affect other locales when merging", () => {
    // Arrange
    const engine = createEngine();
    engine.loadLocale("zh-CN", { hello: "你好" });
    engine.loadLocale("en", { hello: "Hello" });
    // Act — merge into zh-CN
    engine.loadLocale("zh-CN", { save: "保存" });
    // Assert — en should be unaffected: 'hello' stays English,
    // 'save' was never loaded into 'en' so falls back to zh-CN
    expect(engine.translate("en", "hello")).toBe("Hello");
    expect(engine.translate("en", "save")).toBe("保存");
  });

  // --- getAvailableLocales ---

  describe("I18nEngine.getAvailableLocales", () => {
    test("returns empty array when no locales loaded", () => {
      // Arrange
      const engine = createEngine();
      // Act
      const result = engine.getAvailableLocales();
      // Assert
      expect(result).toEqual([]);
    });

    test("returns all loaded locales", () => {
      // Arrange
      const engine = createEngine();
      engine.loadLocale("zh-CN", { hello: "你好" });
      engine.loadLocale("en", { hello: "Hello" });
      // Act
      const result = engine.getAvailableLocales();
      // Assert
      expect(result).toHaveLength(2);
      expect(result).toContain("zh-CN");
      expect(result).toContain("en");
    });

    test("does not duplicate locale names", () => {
      // Arrange
      const engine = createEngine();
      engine.loadLocale("zh-CN", { hello: "你好" });
      engine.loadLocale("zh-CN", { save: "保存" }); // merge, not duplicate
      // Act
      const result = engine.getAvailableLocales();
      // Assert
      expect(result).toEqual(["zh-CN"]);
    });
  });

  // --- multiple locale isolation ---

  describe("I18nEngine — locale isolation", () => {
    test("translations from one locale do not leak into another", () => {
      // Arrange
      const engine = createEngine({ defaultLocale: "zh-CN" });
      engine.loadLocale("zh-CN", { hello: "你好" });
      engine.loadLocale("en", { hello: "Hello" });
      // Act & Assert
      expect(engine.translate("zh-CN", "hello")).toBe("你好");
      expect(engine.translate("en", "hello")).toBe("Hello");
    });

    test("each locale has independent key set", () => {
      // Arrange
      const engine = createEngine();
      engine.loadLocale("zh-CN", { a: "甲", b: "乙" });
      engine.loadLocale("en", { a: "Alpha" }); // no 'b'
      // Act & Assert
      expect(engine.translate("zh-CN", "a")).toBe("甲");
      expect(engine.translate("zh-CN", "b")).toBe("乙");
      expect(engine.translate("en", "a")).toBe("Alpha");
      // 'b' in 'en' should fallback to zh-CN
      expect(engine.translate("en", "b")).toBe("乙");
    });
  });

  // --- t() factory ---

  describe("I18nEngine.t — reusable translation function", () => {
    test("returns a function bound to the given locale", () => {
      // Arrange
      const engine = createEngine({ defaultLocale: "zh-CN" });
      engine.loadLocale("zh-CN", { hello: "你好", greet: "你好 {{name}}" });
      const tZh = engine.t("zh-CN");
      // Act & Assert
      expect(tZh("hello")).toBe("你好");
      expect(tZh("greet", { name: "张三" })).toBe("你好 张三");
    });

    test("reusable function can be called multiple times", () => {
      // Arrange
      const engine = createEngine();
      engine.loadLocale("zh-CN", { a: "甲", b: "乙" });
      const t = engine.t("zh-CN");
      // Act & Assert
      expect(t("a")).toBe("甲");
      expect(t("b")).toBe("乙");
      expect(t("a")).toBe("甲"); // idempotent
    });

    test("separate t() instances remain isolated", () => {
      // Arrange
      const engine = createEngine({ defaultLocale: "zh-CN" });
      engine.loadLocale("zh-CN", { hello: "你好" });
      engine.loadLocale("en", { hello: "Hello" });
      const tZh = engine.t("zh-CN");
      const tEn = engine.t("en");
      // Act & Assert
      expect(tZh("hello")).toBe("你好");
      expect(tEn("hello")).toBe("Hello");
    });
  });

  // --- immutability ---

  describe("I18nEngine — immutability", () => {
    test("loadLocale does not mutate the input translations object", () => {
      // Arrange
      const engine = createEngine();
      const input: Record<string, string> = { hello: "你好" };
      const copy = { ...input };
      // Act
      engine.loadLocale("zh-CN", input);
      // Assert — input should be unchanged
      expect(input).toEqual(copy);
      // Also verify the engine stored a copy (modifying engine state doesn't reach input)
    });

    test("engine internals are not exposed via mutation of return values", () => {
      // Arrange
      const engine = createEngine();
      engine.loadLocale("zh-CN", { hello: "你好" });
      // Act — getAvailableLocales returns a new array
      const locales = engine.getAvailableLocales();
      locales.push("fr");
      // Assert — engine should be unaffected
      expect(engine.getAvailableLocales()).toEqual(["zh-CN"]);
    });
  });

  // --- edge cases ---

  describe("I18nEngine — edge cases", () => {
    test("empty translations loaded — engine still works", () => {
      // Arrange
      const engine = createEngine();
      engine.loadLocale("zh-CN", {});
      // Act
      const result = engine.translate("zh-CN", "anything");
      // Assert
      expect(result).toBe("anything");
    });

    test("key containing param-like braces but no actual params", () => {
      // Arrange
      const engine = createEngine();
      engine.loadLocale("zh-CN", { template: "use {{x}} syntax" });
      // Act
      const result = engine.translate("zh-CN", "template", { x: "double-brace" });
      // Assert
      expect(result).toBe("use double-brace syntax");
    });

    test("key with multiple same params", () => {
      // Arrange
      const engine = createEngine();
      engine.loadLocale("zh-CN", { repeat: "{{x}} and {{x}}" });
      // Act
      const result = engine.translate("zh-CN", "repeat", { x: "A" });
      // Assert
      expect(result).toBe("A and A");
    });
  });
});
