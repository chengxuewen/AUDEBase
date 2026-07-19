/** Connected WebSocket client identity */
export interface WsClient {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly connectedAt: Date;
}

/** A single subscription to collection change events */
export interface WsSubscription {
  readonly clientId: string;
  readonly collection: string;
  readonly events: readonly ("create" | "update" | "delete")[];
}

/** Event published when a collection record changes */
export interface CollectionChangeEvent {
  readonly collection: string;
  readonly action: "create" | "update" | "delete";
  readonly recordId: string;
  readonly data?: Record<string, unknown>;
  readonly tenantId: string;
}

/** Callback signature for the manager to notify external event sources */
export type ChangeCallback = (event: CollectionChangeEvent) => void;

// ── WebSocket Protocol Messages ────────────────────────────────────

/** Client → Server: subscribe to collection events */
export interface SubscribeMessage {
  readonly type: "subscribe";
  readonly collection: string;
  readonly events: ("create" | "update" | "delete")[];
}

/** Client → Server: unsubscribe from a collection */
export interface UnsubscribeMessage {
  readonly type: "unsubscribe";
  readonly collection: string;
}

/** Server → Client: subscription confirmation */
export interface SubscribedResponse {
  readonly type: "subscribed";
  readonly collection: string;
  readonly events: readonly ("create" | "update" | "delete")[];
}

/** Server → Client: unsubscription confirmation */
export interface UnsubscribedResponse {
  readonly type: "unsubscribed";
  readonly collection: string;
}

/** Server → Client: a collection event */
export interface EventResponse {
  readonly type: "event";
  readonly collection: string;
  readonly action: "create" | "update" | "delete";
  readonly recordId: string;
  readonly data?: Record<string, unknown>;
}

/** Server → Client: error */
export interface ErrorResponse {
  readonly type: "error";
  readonly message: string;
}

/** Union of all client → server messages */
export type ClientMessage = SubscribeMessage | UnsubscribeMessage;

/** Union of all server → client messages */
export type ServerMessage =
  SubscribedResponse | UnsubscribedResponse | EventResponse | ErrorResponse;
