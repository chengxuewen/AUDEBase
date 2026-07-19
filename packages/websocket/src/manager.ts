import type { WsClient, CollectionChangeEvent, ServerMessage } from "./types";
import { RoomsManager } from "./rooms";

/**
 * Configuration for the WebSocket manager.
 */
export interface WsManagerOptions {
  /** Callback to send a server message to a specific client */
  readonly sendToClient: (clientId: string, message: ServerMessage) => void;
}

/**
 * WebSocket manager — tracks connected clients and broadcasts events.
 * Phase 2: in-memory only. No Redis dependency.
 */
export class WsManager {
  /** clientId → client */
  private readonly clients = new Map<string, WsClient>();
  private readonly rooms: RoomsManager;
  private readonly sendToClient: (clientId: string, message: ServerMessage) => void;

  constructor(options: WsManagerOptions) {
    this.rooms = new RoomsManager();
    this.sendToClient = options.sendToClient;
  }

  /** Register a newly connected client */
  registerClient(client: WsClient): void {
    this.clients.set(client.id, client);
  }

  /** Remove a disconnected client */
  removeClient(clientId: string): void {
    this.clients.delete(clientId);
    this.rooms.removeAll(clientId);
  }

  /** Check if a client is connected */
  isConnected(clientId: string): boolean {
    return this.clients.has(clientId);
  }

  /** Get client by ID */
  getClient(clientId: string): WsClient | undefined {
    return this.clients.get(clientId);
  }

  /** Get the underlying RoomsManager */
  getRoomsManager(): RoomsManager {
    return this.rooms;
  }

  /**
   * Subscribe a client to collection events.
   * Sends a "subscribed" confirmation back to the client.
   */
  subscribe(clientId: string, collection: string, events: string[]): void {
    this.rooms.subscribe(clientId, collection, events);
    this.sendToClient(clientId, {
      type: "subscribed",
      collection,
      events: events.filter(
        (e): e is "create" | "update" | "delete" =>
          e === "create" || e === "update" || e === "delete",
      ),
    });
  }

  /**
   * Unsubscribe a client from a collection.
   * Sends an "unsubscribed" confirmation back to the client.
   */
  unsubscribe(clientId: string, collection: string): void {
    this.rooms.unsubscribe(clientId, collection);
    this.sendToClient(clientId, {
      type: "unsubscribed",
      collection,
    });
  }

  /**
   * Handle a change event from the event bus / adapter.
   * Broadcasts the event to all subscribed clients matching
   * the collection, action, and tenant.
   */
  handleChangeEvent(event: CollectionChangeEvent): void {
    const subscriberIds = this.rooms.getSubscribers(event.collection, event.action);

    for (const clientId of subscriberIds) {
      const client = this.clients.get(clientId);
      if (!client) continue;

      // Only send to clients in the same tenant
      if (client.tenantId !== event.tenantId) continue;

      const msg: ServerMessage = {
        type: "event",
        collection: event.collection,
        action: event.action,
        recordId: event.recordId,
        data: event.data,
      };

      this.sendToClient(clientId, msg);
    }
  }

  /**
   * Broadcast a collection change event.
   * Alias for handleChangeEvent — used by the event adapter.
   */
  broadcast(_collection: string, event: CollectionChangeEvent): void {
    this.handleChangeEvent(event);
  }

  /** Number of connected clients */
  get connectedCount(): number {
    return this.clients.size;
  }
}
