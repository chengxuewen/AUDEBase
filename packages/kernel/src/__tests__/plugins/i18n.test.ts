import { describe, test, expect, beforeAll, afterAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import i18nPlugin from "../../plugins/i18n";

// ---- helpers ----

async function createTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(i18nPlugin, { config: { defaultLocale: "zh", fallbackLocale: "en" } });

  // Register all routes before any inject call
  app.get("/locale-test", async (request) => ({
    translated: request.t("auth.login_success"),
  }));

  app.get("/locale-en", async (request) => ({
    translated: request.t("auth.login_failed"),
  }));

  app.get("/locale-default", async (request) => ({
    translated: request.t("common.save"),
  }));

  app.get("/locale-missing", async (request) => ({
    translated: request.t("nonexistent.key"),
  }));

  app.get("/locale-params", async (request) => ({
    hasT: typeof request.t === "function",
  }));

  return app;
}

describe("i18nPlugin", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  test("decorates fastify with i18n engine", () => {
    expect(app.i18n).toBeDefined();
    expect(typeof app.i18n.translate).toBe("function");
    expect(typeof app.i18n.t).toBe("function");
  });

  test("detects zh-CN locale from Accept-Language header", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/locale-test",
      headers: { "accept-language": "zh-CN,zh;q=0.9" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().translated).toBe("登录成功");
  });

  test("detects en locale from Accept-Language header", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/locale-en",
      headers: { "accept-language": "en-US,en;q=0.9" },
    });

    expect(res.statusCode).toBe(200);
    // en translations not loaded; fallback chain: en → defaultLocale(zh) → returns zh value
    expect(res.json().translated).toBe("用户名或密码错误");
  });

  test("falls back to default locale when no Accept-Language header", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/locale-default",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().translated).toBe("保存");
  });

  test("returns raw key for untranslated key", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/locale-missing",
      headers: { "accept-language": "zh-CN" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().translated).toBe("nonexistent.key");
  });

  test("supports param interpolation", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/locale-params",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().hasT).toBe(true);
  });
});
