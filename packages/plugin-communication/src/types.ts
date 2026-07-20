/**
 * Plugin Communication types — D1.3 implementation.
 *
 * Phase 1b: inline-mode only (direct function calls for intra-group,
 * in-memory transport for inter-group). Process isolation deferred to Phase 2.
 */
import { z } from "zod";

// ── JSON-RPC 2.0 types ────────────────────────────────────────

/** Request metadata injected by Core (tenant_id, user_id, etc.) */
export interface RpcMetadata {
  readonly tenant_id?: string;
  readonly user_id?: string;
  readonly role_ids?: readonly string[];
  readonly request_id?: string;
}

/** JSON-RPC 2.0 request */
export interface RpcRequest {
  readonly jsonrpc: "2.0";
  readonly id: string | number;
  readonly method: string;
  readonly params?: Readonly<Record<string, unknown>>;
  readonly _metadata?: RpcMetadata;
}

/** JSON-RPC 2.0 success response */
export interface RpcSuccess {
  readonly jsonrpc: "2.0";
  readonly id: string | number;
  readonly result: unknown;
}

/** JSON-RPC 2.0 error response */
export interface RpcError {
  readonly jsonrpc: "2.0";
  readonly id: string | number | null;
  readonly error: {
    readonly code: number;
    readonly message: string;
    readonly data?: unknown;
  };
}

/** JSON-RPC 2.0 response (success or error) */
export type RpcResponse = RpcSuccess | RpcError;

/** JSON-RPC 2.0 notification (no id, no response expected) */
export interface RpcNotification {
  readonly jsonrpc: "2.0";
  readonly method: string;
  readonly params?: Readonly<Record<string, unknown>>;
  readonly _metadata?: RpcMetadata;
}

// ── Zod schemas for RPC validation ─────────────────────────────

/** RPC metadata Zod schema */
export const rpcMetadataSchema = z.object({
  tenant_id: z.string().optional(),
  user_id: z.string().optional(),
  role_ids: z.array(z.string()).optional(),
  request_id: z.string().optional(),
});

/** RPC request Zod schema */
export const rpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]),
  method: z.string().min(1),
  params: z.record(z.unknown()).optional(),
  _metadata: rpcMetadataSchema.optional(),
});

/** RPC error object Zod schema */
export const rpcErrorObjectSchema = z.object({
  code: z.number().int(),
  message: z.string(),
  data: z.unknown().optional(),
});

/** RPC error response Zod schema */
export const rpcErrorResponseSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]).nullable(),
  error: rpcErrorObjectSchema,
});

/** RPC success response Zod schema */
export const rpcSuccessResponseSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]),
  result: z.unknown(),
});

/** RPC notification Zod schema */
export const rpcNotificationSchema = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.string().min(1),
  params: z.record(z.unknown()).optional(),
  _metadata: rpcMetadataSchema.optional(),
});

// ── Standard JSON-RPC error codes ──────────────────────────────

export const RPC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  /** Application-level error range: -32000 to -32099 */
  APP_ERROR: -32000,
  /** Service timeout */
  TIMEOUT: -32001,
  /** Permission denied for cross-partition call */
  FORBIDDEN: -32002,
  /** Plugin not loaded / unavailable */
  SERVICE_UNAVAILABLE: -32003,
} as const;

// ── Service Registry types ─────────────────────────────────────

/** Handler function signature for a registered service method */
export type ServiceHandler = (
  params: Readonly<Record<string, unknown>>,
  metadata?: RpcMetadata,
) => Promise<unknown>;

/** Schema for validating handler parameters */
export type ParamSchema = z.ZodType<Record<string, unknown>>;

/** Registration entry in the ServiceRegistry */
export interface ServiceRegistration {
  /** Fully qualified method name (e.g., "erp:order.create") */
  readonly method: string;
  /** Plugin that registered this service */
  readonly pluginName: string;
  /** Handler implementation */
  readonly handler: ServiceHandler;
  /** Optional Zod schema for parameter validation */
  readonly paramSchema?: ParamSchema;
  /** Plugins allowed to call this service (empty = all) */
  readonly allowedCallers?: readonly string[];
}

/** ServiceRegistry interface */
export interface IServiceRegistry {
  register(registration: ServiceRegistration): void;
  unregister(method: string): void;
  resolve(method: string): ServiceRegistration | undefined;
  list(): readonly ServiceRegistration[];
  /** Unregister all services for a plugin */
  unregisterByPlugin(pluginName: string): void;
}

// ── Pub/Sub types ──────────────────────────────────────────────

/** Subscription handler */
export type SubscriptionHandler = (channel: string, message: string) => void | Promise<void>;

/** Pub/Sub message envelope */
export interface PublishMessage {
  readonly channel: string;
  readonly payload: string;
  readonly publisher?: string;
  readonly tenant_id?: string;
  readonly timestamp?: string;
}

/** PublishMessage Zod schema */
export const publishMessageSchema = z.object({
  channel: z.string().min(1),
  payload: z.string(),
  publisher: z.string().optional(),
  tenant_id: z.string().optional(),
  timestamp: z.string().optional(),
});

/** Pub/Sub adapter interface */
export interface IPubSubAdapter {
  publish(channel: string, message: PublishMessage): Promise<void>;
  subscribe(channel: string, handler: SubscriptionHandler): Promise<void>;
  unsubscribe(channel: string, handler: SubscriptionHandler): Promise<void>;
  /** Close the adapter and clean up resources */
  close(): Promise<void>;
}
