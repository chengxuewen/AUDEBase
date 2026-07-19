// === Types ===
export type {
  WsClient,
  WsSubscription,
  CollectionChangeEvent,
  ChangeCallback,
  SubscribeMessage,
  UnsubscribeMessage,
  SubscribedResponse,
  UnsubscribedResponse,
  EventResponse,
  ErrorResponse,
  ClientMessage,
  ServerMessage,
} from "./types";

// === Auth ===
export { authenticateWs } from "./auth";

// === Rooms ===
export { RoomsManager } from "./rooms";

// === Manager ===
export { WsManager } from "./manager";
export type { WsManagerOptions } from "./manager";

// === Adapter ===
export { createEventBusAdapter } from "./adapter";
