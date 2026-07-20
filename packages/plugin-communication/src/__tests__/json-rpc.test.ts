/**
 * Tests for JsonRpcClient and JsonRpcServer.
 */
import { describe, it, expect } from "vitest";
import { JsonRpcClient, JsonRpcServer } from "../json-rpc.js";
import { ServiceRegistry } from "../registry.js";
import { RPC_ERROR_CODES } from "../types.js";
import type { RpcMetadata } from "../types.js";
import type { RpcTransport } from "../json-rpc.js";

// ── Helpers ────────────────────────────────────────────────────

function createServer(server: JsonRpcServer): RpcTransport {
  return server.createInlineTransport();
}

// ── Tests: JsonRpcServer ───────────────────────────────────────

describe("JsonRpcServer", () => {
  it("dispatches a valid request to a registered handler", async () => {
    // Arrange
    const registry = new ServiceRegistry();
    registry.register({
      method: "test:echo",
      pluginName: "test",
      handler: async (params) => ({ echoed: params.value }),
    });
    const server = new JsonRpcServer(registry);
    const transport = createServer(server);

    // Act
    const response = await transport({
      jsonrpc: "2.0",
      id: 1,
      method: "test:echo",
      params: { value: "hello" },
    });

    // Assert
    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: { echoed: "hello" },
    });
  });

  it("returns METHOD_NOT_FOUND for unregistered methods", async () => {
    // Arrange
    const registry = new ServiceRegistry();
    const server = new JsonRpcServer(registry);
    const transport = createServer(server);

    // Act
    const response = await transport({
      jsonrpc: "2.0",
      id: 2,
      method: "nonexistent:method",
    });

    // Assert
    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: 2,
      error: {
        code: RPC_ERROR_CODES.METHOD_NOT_FOUND,
        message: "Method not found: nonexistent:method",
      },
    });
  });

  it("returns INVALID_REQUEST when method name is empty", async () => {
    // Arrange
    const registry = new ServiceRegistry();
    const server = new JsonRpcServer(registry);
    const transport = createServer(server);

    // Act
    const response = await transport({
      jsonrpc: "2.0",
      id: 3,
      method: "",
    });

    // Assert
    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: 3,
      error: {
        code: RPC_ERROR_CODES.INVALID_REQUEST,
      },
    });
  });

  it("handles notifications (no id, no response)", async () => {
    // Arrange
    const received: Array<Record<string, unknown>> = [];
    const registry = new ServiceRegistry();
    registry.register({
      method: "events:track",
      pluginName: "analytics",
      handler: async (params) => {
        received.push(params);
      },
    });
    const server = new JsonRpcServer(registry);
    const transport = createServer(server);

    // Act
    const response = await transport({
      jsonrpc: "2.0",
      method: "events:track",
      params: { event: "page_view" },
    });

    // Assert
    expect(response).toBeNull();
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ event: "page_view" });
  });

  it("propagates _metadata to handler", async () => {
    // Arrange
    let capturedMeta: RpcMetadata | undefined;
    const registry = new ServiceRegistry();
    registry.register({
      method: "test:whoami",
      pluginName: "test",
      handler: async (_params, metadata) => {
        capturedMeta = metadata;
        return { ok: true };
      },
    });
    const server = new JsonRpcServer(registry);
    const transport = createServer(server);

    // Act
    await transport({
      jsonrpc: "2.0",
      id: 4,
      method: "test:whoami",
      params: {},
      _metadata: { tenant_id: "t1", user_id: "u1" },
    });

    // Assert
    expect(capturedMeta).toEqual({ tenant_id: "t1", user_id: "u1" });
  });

  it("validates params against Zod schema when provided", async () => {
    // Arrange
    const { z } = await import("zod");
    const schema = z.object({ name: z.string().min(1) });
    const registry = new ServiceRegistry();
    registry.register({
      method: "test:greet",
      pluginName: "test",
      handler: async (params) => ({ greeting: `Hello, ${String(params.name)}` }),
      paramSchema: schema,
    });
    const server = new JsonRpcServer(registry);
    const transport = createServer(server);

    // Act: valid params
    const okResponse = await transport({
      jsonrpc: "2.0",
      id: 5,
      method: "test:greet",
      params: { name: "World" },
    });

    // Act: invalid params
    const badResponse = await transport({
      jsonrpc: "2.0",
      id: 6,
      method: "test:greet",
      params: { name: "" },
    });

    // Assert
    expect(okResponse).toMatchObject({ result: { greeting: "Hello, World" } });
    expect(badResponse).toMatchObject({
      error: { code: RPC_ERROR_CODES.INVALID_PARAMS },
    });
  });

  it("restricts access via allowedCallers", async () => {
    // Arrange
    const registry = new ServiceRegistry();
    registry.register({
      method: "admin:secret",
      pluginName: "admin",
      handler: async () => ({ secret: true }),
      allowedCallers: ["admin-user"],
    });
    const server = new JsonRpcServer(registry);
    const transport = createServer(server);

    // Act: unauthorized caller
    const denied = await transport({
      jsonrpc: "2.0",
      id: 7,
      method: "admin:secret",
      _metadata: { user_id: "guest" },
    });

    // Assert
    expect(denied).toMatchObject({
      error: { code: RPC_ERROR_CODES.FORBIDDEN },
    });

    // Act: authorized caller
    const allowed = await transport({
      jsonrpc: "2.0",
      id: 8,
      method: "admin:secret",
      _metadata: { user_id: "admin-user" },
    });

    // Assert
    expect(allowed).toMatchObject({ result: { secret: true } });
  });

  it("returns APP_ERROR when handler throws", async () => {
    // Arrange
    const registry = new ServiceRegistry();
    registry.register({
      method: "test:crash",
      pluginName: "test",
      handler: async () => {
        throw new Error("something exploded");
      },
    });
    const server = new JsonRpcServer(registry);
    const transport = createServer(server);

    // Act
    const response = await transport({
      jsonrpc: "2.0",
      id: 9,
      method: "test:crash",
    });

    // Assert
    expect(response).toMatchObject({
      error: {
        code: RPC_ERROR_CODES.APP_ERROR,
        message: "something exploded",
      },
    });
  });
});

// ── Tests: JsonRpcClient ───────────────────────────────────────

describe("JsonRpcClient", () => {
  it("calls a remote method and returns result", async () => {
    // Arrange
    const registry = new ServiceRegistry();
    registry.register({
      method: "math:add",
      pluginName: "math",
      handler: async (params) => ({
        sum: (params.a as number) + (params.b as number),
      }),
    });
    const server = new JsonRpcServer(registry);
    const client = new JsonRpcClient(createServer(server));

    // Act
    const result = await client.call("math:add", { a: 3, b: 4 });

    // Assert
    expect(result).toEqual({ sum: 7 });
  });

  it("throws when remote method returns an error", async () => {
    // Arrange
    const registry = new ServiceRegistry();
    const server = new JsonRpcServer(registry);
    const client = new JsonRpcClient(createServer(server));

    // Act & Assert
    await expect(client.call("nonexistent:method")).rejects.toThrow("Method not found");
  });

  it("sends notifications without expecting a response", async () => {
    // Arrange
    const events: Array<Record<string, unknown>> = [];
    const registry = new ServiceRegistry();
    registry.register({
      method: "log:info",
      pluginName: "logger",
      handler: async (params) => {
        events.push(params);
      },
    });
    const server = new JsonRpcServer(registry);
    const client = new JsonRpcClient(createServer(server));

    // Act
    await client.notify("log:info", { level: "info", message: "test" });

    // Assert
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ level: "info", message: "test" });
  });

  it("passes metadata through to the handler", async () => {
    // Arrange
    let receivedMeta: RpcMetadata | undefined;
    const registry = new ServiceRegistry();
    registry.register({
      method: "ctx:dump",
      pluginName: "test",
      handler: async (_params, meta) => {
        receivedMeta = meta;
        return {};
      },
    });
    const server = new JsonRpcServer(registry);
    const client = new JsonRpcClient(createServer(server));

    // Act
    await client.call(
      "ctx:dump",
      {},
      { tenant_id: "tenant-1", user_id: "user-1", request_id: "req-1" },
    );

    // Assert
    expect(receivedMeta).toEqual({
      tenant_id: "tenant-1",
      user_id: "user-1",
      request_id: "req-1",
    });
  });
});
