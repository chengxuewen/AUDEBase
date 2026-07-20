/**
 * @audebase/plugin-communication — Plugin Communication (D1.3)
 *
 * Phase 1b: inline-mode communication.
 * - ServiceRegistry: in-memory service registration & discovery
 * - JsonRpcClient/JsonRpcServer: JSON-RPC 2.0 request/response
 * - EventPubSub: in-process pub/sub via EventEmitter
 * - RedisPubSub: Phase 2 stub for ioredis-backed cross-process pub/sub
 */

// ── Types ──────────────────────────────────────────────────────
export type {
  RpcMetadata,
  RpcRequest,
  RpcSuccess,
  RpcError,
  RpcResponse,
  RpcNotification,
  ServiceHandler,
  ParamSchema,
  ServiceRegistration,
  IServiceRegistry,
  SubscriptionHandler,
  PublishMessage,
  IPubSubAdapter,
} from "./types.js";

export {
  rpcMetadataSchema,
  rpcRequestSchema,
  rpcErrorObjectSchema,
  rpcErrorResponseSchema,
  rpcSuccessResponseSchema,
  rpcNotificationSchema,
  publishMessageSchema,
  RPC_ERROR_CODES,
} from "./types.js";

// ── Service Registry ───────────────────────────────────────────
export { ServiceRegistry } from "./registry.js";

// ── JSON-RPC ───────────────────────────────────────────────────
export type { RpcTransport } from "./json-rpc.js";
export { JsonRpcClient, JsonRpcServer } from "./json-rpc.js";

// ── Pub/Sub ────────────────────────────────────────────────────
export { EventPubSub, RedisPubSub } from "./pubsub.js";
