import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { Writable } from "node:stream";
import Fastify, { type FastifyInstance } from "fastify";
import { createRequestLogger } from "../request-logger";
import type { Logger } from "pino";
import { createLogger } from "../logger";

function createCaptureStream(): { stream: Writable; lines: () => unknown[] } {
  const captured: unknown[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      const text = chunk.toString().trim();
      if (text.length > 0) {
        for (const line of text.split("\n")) {
          try {
            captured.push(JSON.parse(line));
          } catch {
            captured.push(line);
          }
        }
      }
      callback();
    },
  });
  return { stream, lines: () => captured };
}

describe("createRequestLogger", () => {
  let app: FastifyInstance;
  let capture: ReturnType<typeof createCaptureStream>;
  let logger: Logger;

  beforeAll(async () => {
    capture = createCaptureStream();
    logger = createLogger({ name: "http-test", level: "info", stream: capture.stream });

    app = Fastify({ logger: false });

    app.decorateRequest("user", null);
    app.addHook("onRequest", async (request) => {
      const authHeader = request.headers["authorization"];
      if (authHeader === "Bearer valid-token") {
        (request as unknown as Record<string, unknown>).user = { id: "user-001" };
      }
    });

    createRequestLogger(app, logger);

    app.get("/hello", async (_request, reply) => reply.send({ ok: true }));

    app.get("/slow", async (_request, reply) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return reply.send({ ok: true });
    });

    app.get("/error", async (_request, reply) => reply.status(500).send({ error: "boom" }));

    app.get("/tenant/:id/data", async (request, reply) => {
      (request as unknown as Record<string, unknown>).tenantId = (
        request.params as Record<string, string>
      ).id;
      return reply.send({ ok: true });
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  test("注入 X-Request-ID 到响应头", async () => {
    const response = await app.inject({ method: "GET", url: "/hello" });

    const reqId = response.headers["x-request-id"] as string | undefined;
    expect(reqId).toBeDefined();
    expect(reqId!.length).toBeGreaterThan(0);
  });

  test("保留客户端传入的 X-Request-ID", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/hello",
      headers: { "x-request-id": "client-req-12345" },
    });

    expect(response.headers["x-request-id"]).toBe("client-req-12345");
  });

  test("记录 method, url, statusCode, responseTime, requestId", async () => {
    await app.inject({ method: "GET", url: "/hello" });

    const requestLog = capture
      .lines()
      .filter((l: unknown) => (l as Record<string, unknown>)?.msg === "request completed")
      .pop() as Record<string, unknown> | undefined;
    expect(requestLog).toBeDefined();
    expect(requestLog?.method).toBe("GET");
    expect(requestLog?.url).toBe("/hello");
    expect(requestLog?.statusCode).toBe(200);
    expect(typeof requestLog?.responseTime).toBe("number");
    expect(requestLog?.requestId).toBeDefined();
  });

  test("记录慢响应时间", async () => {
    await app.inject({ method: "GET", url: "/slow" });

    const requestLog = capture
      .lines()
      .filter((l: unknown) => (l as Record<string, unknown>)?.msg === "request completed")
      .pop() as Record<string, unknown> | undefined;
    expect(requestLog).toBeDefined();
    expect((requestLog?.responseTime as number) ?? 0).toBeGreaterThanOrEqual(45);
  });

  test("记录 500 错误响应", async () => {
    await app.inject({ method: "GET", url: "/error" });

    const requestLog = capture
      .lines()
      .filter((l: unknown) => (l as Record<string, unknown>)?.msg === "request completed")
      .pop() as Record<string, unknown> | undefined;
    expect(requestLog).toBeDefined();
    expect(requestLog?.statusCode).toBe(500);
  });

  test("记录 userId 当已认证时", async () => {
    await app.inject({
      method: "GET",
      url: "/hello",
      headers: { authorization: "Bearer valid-token" },
    });

    const requestLog = capture
      .lines()
      .filter((l: unknown) => (l as Record<string, unknown>)?.msg === "request completed")
      .pop() as Record<string, unknown> | undefined;
    expect(requestLog).toBeDefined();
    expect(requestLog?.userId).toBe("user-001");
  });

  test("不记录 userId 当未认证时", async () => {
    await app.inject({ method: "GET", url: "/hello" });

    const requestLog = capture
      .lines()
      .filter((l: unknown) => (l as Record<string, unknown>)?.msg === "request completed")
      .pop() as Record<string, unknown> | undefined;
    expect(requestLog).toBeDefined();
    expect(requestLog?.userId).toBeUndefined();
  });

  test("记录 tenantId 当租户上下文中", async () => {
    await app.inject({ method: "GET", url: "/tenant/t-abc/data" });

    const requestLog = capture
      .lines()
      .filter((l: unknown) => (l as Record<string, unknown>)?.msg === "request completed")
      .pop() as Record<string, unknown> | undefined;
    expect(requestLog).toBeDefined();
    expect(requestLog?.tenantId).toBe("t-abc");
  });

  test("请求日志不包含敏感 header", async () => {
    await app.inject({
      method: "GET",
      url: "/hello",
      headers: {
        authorization: "Bearer super-secret-token",
        cookie: "session=abc123",
      },
    });

    const requestLog = capture
      .lines()
      .filter((l: unknown) => (l as Record<string, unknown>)?.msg === "request completed")
      .pop() as Record<string, unknown> | undefined;
    expect(requestLog).toBeDefined();
    expect(requestLog?.authorization).toBeUndefined();
    expect(requestLog?.cookie).toBeUndefined();
  });
});
