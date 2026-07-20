/**
 * JSON-RPC 2.0 Client & Server — Phase 1b inline-mode implementation.
 *
 * JsonRpcServer: receives and dispatches RPC requests via ServiceRegistry.
 * JsonRpcClient: sends RPC requests to a given transport handler.
 *
 * Phase 1b transport is in-process (direct function call).
 * Phase 2 will add stdin/stdout framing protocol.
 *
 * Security: _metadata is injected by Core middleware and propagated to handlers.
 */
import type {
  RpcRequest,
  RpcResponse,
  RpcNotification,
  RpcMetadata,
  RpcRequest,
  RpcResponse,
  RpcNotification,
  RpcMetadata,
} from "./types.js";
import { rpcRequestSchema, rpcNotificationSchema, RPC_ERROR_CODES } from "./types.js";
import type { IServiceRegistry } from "./types.js";
import { UserError, ErrorCode } from "@audebase/shared-types";

// ── Transport type ─────────────────────────────────────────────

/** Transport handler — sends an RPC request and returns the response */
export type RpcTransport = (request: RpcRequest | RpcNotification) => Promise<RpcResponse | null>;

// ── JsonRpcClient ──────────────────────────────────────────────

/**
 * JSON-RPC 2.0 client.
 *
 * Sends requests through a transport handler. For Phase 1b, the transport
 * is a direct call to JsonRpcServer.handle(). Phase 2 will use a framing protocol
 * over stdin/stdout for process-mode and container-mode plugins.
 */
export class JsonRpcClient {
  readonly #transport: RpcTransport;
  readonly #timeoutMs: number;
  #nextId = 1;

  constructor(transport: RpcTransport, timeoutMs = 30_000) {
    this.#transport = transport;
    this.#timeoutMs = timeoutMs;
  }

  /**
   * Invoke a remote method.
   *
   * @param method - Fully qualified method name (e.g., "erp:order.create")
   * @param params - Method parameters
   * @param metadata - Request metadata (tenant_id, user_id, etc.)
   * @returns The result from the remote handler
   */
  async call(
    method: string,
    params?: Readonly<Record<string, unknown>>,
    metadata?: RpcMetadata,
  ): Promise<unknown> {
    const id = this.#nextId++;
    const request: RpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
      _metadata: metadata,
    };

    const response = await this.#send(request);

    if ("error" in response) {
      throw new Error(`RPC error [${response.error.code}]: ${response.error.message}`);
    }

    return response.result;
  }

  /**
   * Send a notification (fire-and-forget, no response expected).
   */
  async notify(
    method: string,
    params?: Readonly<Record<string, unknown>>,
    metadata?: RpcMetadata,
  ): Promise<void> {
    const notification: RpcNotification = {
      jsonrpc: "2.0",
      method,
      params,
      _metadata: metadata,
    };

    // Notifications don't expect a response; transport returns null
    await this.#transport(notification);
  }

  async #send(request: RpcRequest): Promise<RpcResponse> {
    const response = await Promise.race([this.#transport(request), this.#timeout(request.id)]);

    if (response === null) {
      throw new Error(`RPC call "${request.method}" received null response`);
    }

    return response;
  }

  async #timeout(id: string | number): Promise<never> {
    // ponytail: simple setTimeout, add AbortController if cancellations needed
    return new Promise<never>((_resolve, reject) => {
      setTimeout(() => {
        reject(
          new UserError(
            ErrorCode.GENERAL_TIMEOUT,
            `RPC call timed out after ${this.#timeoutMs}ms`,
            { rpcId: id },
          ),
        );
      }, this.#timeoutMs);
    });
  }
}

// ── JsonRpcServer ──────────────────────────────────────────────

/**
 * JSON-RPC 2.0 server.
 *
 * Handles incoming requests by dispatching to registered services via ServiceRegistry.
 *
 * Phase 1b: used with InlineTransport — direct function call, no serialization.
 * Phase 2: used with FramedTransport — stdin/stdout with content-length framing.
 */
export class JsonRpcServer {
  readonly #registry: IServiceRegistry;

  constructor(registry: IServiceRegistry) {
    this.#registry = registry;
  }

  /**
   * Handle an incoming RPC request or notification.
   * Returns a response for requests, null for notifications.
   */
  async handle(raw: unknown): Promise<RpcResponse | null> {
    // Parse and validate
    const result = this.#parseRequest(raw);
    if (result === null) {
      // Input is not a valid JSON-RPC object at all — silently drop
      return null;
    }

    if ("error" in result) {
      return result.error; // Parse error response
    }

    const request = result.request;

    // Notifications — fire and forget
    if (this.#isNotification(request)) {
      await this.#dispatchNotification(request);
      return null;
    }

    // Request — dispatch and respond
    return this.#dispatchRequest(request as RpcRequest);
  }

  /**
   * Create an inline transport for same-process communication.
   * Returns a transport function that can be passed to JsonRpcClient.
   */
  createInlineTransport(): RpcTransport {
    return async (req: RpcRequest | RpcNotification): Promise<RpcResponse | null> => {
      return this.handle(req);
    };
  }

  // ── Private ──────────────────────────────────────────────────

  #parseRequest(
    raw: unknown,
  ): { request: RpcRequest | RpcNotification } | { error: RpcResponse } | null {
    if (typeof raw !== "object" || raw === null) {
      return null;
    }

    // Try request first (has id), then notification (no id)
    const requestResult = rpcRequestSchema.safeParse(raw);
    if (requestResult.success) {
      return { request: requestResult.data };
    }

    const notifResult = rpcNotificationSchema.safeParse(raw);
    if (notifResult.success) {
      return { request: notifResult.data };
    }

    // Invalid — return parse error response if it has an id
    const rec = raw as Record<string, unknown>;
    if ("id" in rec && rec.id !== undefined && rec.id !== null) {
      return {
        error: {
          jsonrpc: "2.0",
          id: rec.id as string | number,
          error: {
            code: RPC_ERROR_CODES.INVALID_REQUEST,
            message: "Parse error: invalid JSON-RPC request",
          },
        },
      };
    }

    return null; // notification with invalid format — silently drop
  }

  #isNotification(obj: unknown): boolean {
    return typeof obj === "object" && obj !== null && !("id" in obj);
  }

  async #dispatchNotification(notification: RpcNotification): Promise<void> {
    const { method, params = {}, _metadata } = notification;
    const reg = this.#registry.resolve(method);

    if (!reg) {
      // Notifications are fire-and-forget — silently ignore unknown methods
      return;
    }

    try {
      await reg.handler(params, _metadata);
    } catch {
      // Notifications don't send errors; Core logs them
      // ponytail: Phase 1b logs locally; Phase 2 adds structured logging
    }
  }

  async #dispatchRequest(request: RpcRequest): Promise<RpcResponse> {
    const { id, method, params = {}, _metadata } = request;

    // Validate method name
    if (typeof method !== "string" || method.length === 0) {
      return this.#errorResponse(id, RPC_ERROR_CODES.INVALID_REQUEST, "Method name is required");
    }

    const reg = this.#registry.resolve(method);

    if (!reg) {
      return this.#errorResponse(
        id,
        RPC_ERROR_CODES.METHOD_NOT_FOUND,
        `Method not found: ${method}`,
      );
    }

    // Check caller permissions (cross-partition access control)
    if (reg.allowedCallers && reg.allowedCallers.length > 0) {
      const callerName = _metadata?.user_id ?? "unknown";
      // ponytail: simple list check; Phase 2 integrates with RBAC permission engine
      if (!reg.allowedCallers.includes(callerName)) {
        return this.#errorResponse(
          id,
          RPC_ERROR_CODES.FORBIDDEN,
          `Plugin "${callerName}" is not allowed to call "${method}"`,
          { allowedCallers: reg.allowedCallers },
        );
      }
    }

    // Validate params if schema is provided
    if (reg.paramSchema) {
      const parseResult = reg.paramSchema.safeParse(params);
      if (!parseResult.success) {
        return this.#errorResponse(
          id,
          RPC_ERROR_CODES.INVALID_PARAMS,
          "Invalid params",
          parseResult.error.issues,
        );
      }
    }

    // Execute handler
    try {
      const result = await reg.handler(params, _metadata);
      return {
        jsonrpc: "2.0",
        id,
        result,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Internal error";
      return this.#errorResponse(id, RPC_ERROR_CODES.APP_ERROR, message);
    }
  }

  #errorResponse(
    id: string | number | null,
    code: number,
    message: string,
    data?: unknown,
  ): RpcResponse {
    return {
      jsonrpc: "2.0",
      id,
      error: { code, message, ...(data !== undefined ? { data } : {}) },
    };
  }
}
