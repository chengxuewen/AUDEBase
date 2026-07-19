import { describe, test, expect, beforeEach } from "vitest";
import { WsManager } from "../manager";
import type { WsClient, CollectionChangeEvent, ServerMessage } from "../types";

describe("WsManager", () => {
  let manager: WsManager;
  let sentMessages: { clientId: string; message: ServerMessage }[];

  beforeEach(() => {
    sentMessages = [];
    manager = new WsManager({
      sendToClient: (clientId, message) => {
        sentMessages.push({ clientId, message });
      },
    });
  });

  function makeClient(overrides: Partial<WsClient> = {}): WsClient {
    return {
      id: "tenant1:user1",
      tenantId: "tenant1",
      userId: "user1",
      connectedAt: new Date(),
      ...overrides,
    };
  }

  // ── registerClient / removeClient ────────────────────────────────

  describe("register and remove", () => {
    test("registers a client and tracks it", () => {
      // Arrange
      const client = makeClient();

      // Act
      manager.registerClient(client);

      // Assert
      expect(manager.isConnected(client.id)).toBe(true);
      expect(manager.connectedCount).toBe(1);
    });

    test("removes a client and cleans up subscriptions", () => {
      // Arrange
      const client = makeClient();
      manager.registerClient(client);
      manager.subscribe(client.id, "users", ["create"]);

      // Act
      manager.removeClient(client.id);

      // Assert
      expect(manager.isConnected(client.id)).toBe(false);
      expect(manager.connectedCount).toBe(0);
      expect(manager.getRoomsManager().clientCount).toBe(0);
    });

    test("removeClient is a no-op for unknown clients", () => {
      // Act
      manager.removeClient("nonexistent");

      // Assert
      expect(manager.connectedCount).toBe(0);
    });

    test("getClient returns undefined for unknown client", () => {
      // Act
      const result = manager.getClient("nonexistent");

      // Assert
      expect(result).toBeUndefined();
    });

    test("getClient returns the registered client", () => {
      // Arrange
      const client = makeClient();
      manager.registerClient(client);

      // Act
      const result = manager.getClient(client.id);

      // Assert
      expect(result).toEqual(client);
    });
  });

  // ── subscribe / unsubscribe via manager ──────────────────────────

  describe("subscribe and unsubscribe", () => {
    test("sends subscribed confirmation on subscribe", () => {
      // Arrange
      const client = makeClient();
      manager.registerClient(client);

      // Act
      manager.subscribe(client.id, "users", ["create", "update"]);

      // Assert
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0]!.message).toEqual({
        type: "subscribed",
        collection: "users",
        events: ["create", "update"],
      });
    });

    test("sends unsubscribed confirmation on unsubscribe", () => {
      // Arrange
      const client = makeClient();
      manager.registerClient(client);
      manager.subscribe(client.id, "users", ["create"]);

      // Act
      manager.unsubscribe(client.id, "users");

      // Assert
      const unsubMsg = sentMessages[sentMessages.length - 1];
      expect(unsubMsg?.message).toEqual({
        type: "unsubscribed",
        collection: "users",
      });
    });

    test("filters invalid event names on subscribe", () => {
      // Arrange
      const client = makeClient();
      manager.registerClient(client);

      // Act
      manager.subscribe(client.id, "users", ["create", "bad", "update"]);

      // Assert
      expect(sentMessages[0]!.message).toMatchObject({
        type: "subscribed",
        events: ["create", "update"],
      });
    });
  });

  // ── handleChangeEvent ────────────────────────────────────────────

  describe("handleChangeEvent", () => {
    test("broadcasts matching events to all subscribed clients", () => {
      // Arrange
      const client1 = makeClient({ id: "tenant1:user1", tenantId: "tenant1" });
      const client2 = makeClient({ id: "tenant1:user2", tenantId: "tenant1" });
      manager.registerClient(client1);
      manager.registerClient(client2);
      manager.subscribe(client1.id, "users", ["create", "update"]);
      manager.subscribe(client2.id, "users", ["create"]);
      sentMessages = [];

      const event: CollectionChangeEvent = {
        collection: "users",
        action: "create",
        recordId: "123",
        data: { name: "Alice" },
        tenantId: "tenant1",
      };

      // Act
      manager.handleChangeEvent(event);

      // Assert
      expect(sentMessages).toHaveLength(2);
      expect(sentMessages.map((m) => m.clientId)).toContain(client1.id);
      expect(sentMessages.map((m) => m.clientId)).toContain(client2.id);
      for (const sm of sentMessages) {
        expect(sm.message).toMatchObject({
          type: "event",
          collection: "users",
          action: "create",
          recordId: "123",
        });
      }
    });

    test("does not send events to clients in different tenants", () => {
      // Arrange
      const client1 = makeClient({ id: "tenant1:user1", tenantId: "tenant1" });
      const client2 = makeClient({ id: "tenant2:user1", tenantId: "tenant2" });
      manager.registerClient(client1);
      manager.registerClient(client2);
      manager.subscribe(client1.id, "users", ["create"]);
      manager.subscribe(client2.id, "users", ["create"]);
      sentMessages = [];

      const event: CollectionChangeEvent = {
        collection: "users",
        action: "create",
        recordId: "456",
        tenantId: "tenant1",
      };

      // Act
      manager.handleChangeEvent(event);

      // Assert — only tenant1's client gets the event
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0]!.clientId).toBe(client1.id);
    });

    test("does not send events when no one is subscribed to the action", () => {
      // Arrange
      const client = makeClient();
      manager.registerClient(client);
      manager.subscribe(client.id, "users", ["create"]);
      sentMessages = [];
      const event: CollectionChangeEvent = {
        collection: "users",
        action: "update",
        recordId: "789",
        tenantId: "tenant1",
      };

      // Act
      manager.handleChangeEvent(event);

      // Assert
      expect(sentMessages).toHaveLength(0);
    });

    test("skips disconnected clients (removed between subscribe and event)", () => {
      // Arrange
      const client = makeClient();
      manager.registerClient(client);
      manager.subscribe(client.id, "users", ["create"]);
      // Disconnect the client
      manager.removeClient(client.id);
      sentMessages = [];

      const event: CollectionChangeEvent = {
        collection: "users",
        action: "create",
        recordId: "999",
        tenantId: "tenant1",
      };

      // Act
      manager.handleChangeEvent(event);

      // Assert — rooms still has the subscription but client is gone
      expect(sentMessages).toHaveLength(0);
    });
  });

  // ── broadcast ────────────────────────────────────────────────────

  describe("broadcast", () => {
    test("forwards to handleChangeEvent", () => {
      // Arrange
      const client = makeClient();
      manager.registerClient(client);
      manager.subscribe(client.id, "users", ["update"]);
      sentMessages = [];

      const event: CollectionChangeEvent = {
        collection: "users",
        action: "update",
        recordId: "abc",
        tenantId: "tenant1",
      };

      // Act
      manager.broadcast("users", event);

      // Assert
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0]!.message).toMatchObject({
        type: "event",
        collection: "users",
        action: "update",
        recordId: "abc",
      });
    });
  });

  // ── getRoomsManager ──────────────────────────────────────────────

  describe("getRoomsManager", () => {
    test("returns the internal rooms manager", () => {
      // Arrange
      const client = makeClient();
      manager.registerClient(client);
      manager.subscribe(client.id, "users", ["create"]);

      // Act
      const rooms = manager.getRoomsManager();

      // Assert
      expect(rooms.clientCount).toBe(1);
      expect(rooms.getSubscribers("users", "create")).toEqual([client.id]);
    });
  });
});
