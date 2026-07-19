import { describe, test, expect, beforeEach } from "vitest";
import { RoomsManager } from "../rooms";

describe("RoomsManager", () => {
  let rooms: RoomsManager;

  beforeEach(() => {
    rooms = new RoomsManager();
  });

  // ── subscribe ────────────────────────────────────────────────────

  describe("subscribe", () => {
    test("adds a subscription for a new client and collection", () => {
      // Act
      rooms.subscribe("client1", "users", ["create", "update"]);

      // Assert
      const subs = rooms.getClientSubscriptions("client1");
      expect(subs).toHaveLength(1);
      expect(subs[0]!.collection).toBe("users");
      expect(subs[0]!.events).toEqual(["create", "update"]);
    });

    test("replaces an existing subscription for the same collection", () => {
      // Arrange
      rooms.subscribe("client1", "users", ["create"]);

      // Act
      rooms.subscribe("client1", "users", ["update", "delete"]);

      // Assert
      const subs = rooms.getClientSubscriptions("client1");
      expect(subs).toHaveLength(1);
      expect(subs[0]!.events).toEqual(["update", "delete"]);
    });

    test("allows a client to subscribe to multiple collections", () => {
      // Act
      rooms.subscribe("client1", "users", ["create"]);
      rooms.subscribe("client1", "orders", ["update"]);

      // Assert
      expect(rooms.getClientSubscriptions("client1")).toHaveLength(2);
    });

    test("filters out invalid event names", () => {
      // Act
      rooms.subscribe("client1", "users", ["create", "invalid", "update"] as string[]);

      // Assert
      const subs = rooms.getClientSubscriptions("client1");
      expect(subs[0]!.events).toEqual(["create", "update"]);
    });
  });

  // ── unsubscribe ──────────────────────────────────────────────────

  describe("unsubscribe", () => {
    test("removes a subscription for a specific collection", () => {
      // Arrange
      rooms.subscribe("client1", "users", ["create"]);
      rooms.subscribe("client1", "orders", ["update"]);

      // Act
      rooms.unsubscribe("client1", "users");

      // Assert
      const subs = rooms.getClientSubscriptions("client1");
      expect(subs).toHaveLength(1);
      expect(subs[0]!.collection).toBe("orders");
    });

    test("removes client entry when no subscriptions remain", () => {
      // Arrange
      rooms.subscribe("client1", "users", ["create"]);

      // Act
      rooms.unsubscribe("client1", "users");

      // Assert
      expect(rooms.clientCount).toBe(0);
      expect(rooms.getClientSubscriptions("client1")).toEqual([]);
    });

    test("is a no-op for unknown clients", () => {
      // Act
      rooms.unsubscribe("nonexistent", "users");

      // Assert
      expect(rooms.clientCount).toBe(0);
    });
  });

  // ── getSubscribers ───────────────────────────────────────────────

  describe("getSubscribers", () => {
    test("returns client IDs subscribed to a specific collection and action", () => {
      // Arrange
      rooms.subscribe("client1", "users", ["create", "update"]);
      rooms.subscribe("client2", "users", ["update"]);
      rooms.subscribe("client3", "orders", ["create"]);

      // Act
      const result = rooms.getSubscribers("users", "update");

      // Assert
      expect(result).toHaveLength(2);
      expect(result).toContain("client1");
      expect(result).toContain("client2");
    });

    test("returns empty array when no subscribers match", () => {
      // Arrange
      rooms.subscribe("client1", "users", ["create"]);

      // Act
      const result = rooms.getSubscribers("users", "delete");

      // Assert
      expect(result).toEqual([]);
    });

    test("returns empty array when no one is subscribed to the collection", () => {
      // Act
      const result = rooms.getSubscribers("nonexistent", "create");

      // Assert
      expect(result).toEqual([]);
    });
  });

  // ── removeAll ────────────────────────────────────────────────────

  describe("removeAll", () => {
    test("removes all subscriptions for a client", () => {
      // Arrange
      rooms.subscribe("client1", "users", ["create"]);
      rooms.subscribe("client1", "orders", ["update"]);
      expect(rooms.clientCount).toBe(1);

      // Act
      rooms.removeAll("client1");

      // Assert
      expect(rooms.clientCount).toBe(0);
      expect(rooms.getClientSubscriptions("client1")).toEqual([]);
    });

    test("is a no-op for unknown clients", () => {
      // Act
      rooms.removeAll("nonexistent");

      // Assert
      expect(rooms.clientCount).toBe(0);
    });

    test("does not affect other clients", () => {
      // Arrange
      rooms.subscribe("client1", "users", ["create"]);
      rooms.subscribe("client2", "orders", ["update"]);

      // Act
      rooms.removeAll("client1");

      // Assert
      expect(rooms.clientCount).toBe(1);
      expect(rooms.getClientSubscriptions("client2")).toHaveLength(1);
    });
  });

  // ── getClientSubscriptions ───────────────────────────────────────

  describe("getClientSubscriptions", () => {
    test("returns empty array for unknown client", () => {
      // Act
      const result = rooms.getClientSubscriptions("nonexistent");

      // Assert
      expect(result).toEqual([]);
    });
  });
});
