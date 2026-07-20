import { describe, test, expect } from "vitest";
import { SchemaRegistry } from "../registry";
import type { CollectionDef, FieldDef } from "../types";

function stringField(name: string): FieldDef {
  return { name, type: "string" };
}

function makeCollection(name: string, fields: readonly FieldDef[]): CollectionDef {
  return { name, fields };
}

describe("SchemaRegistry", () => {
  describe("register", () => {
    test("registers a collection and makes it retrievable", () => {
      // Arrange
      const registry = new SchemaRegistry();
      const collection = makeCollection("users", [stringField("email")]);

      // Act
      registry.register(collection);

      // Assert
      expect(registry.get("users")).toBe(collection);
    });

    test("throws when registering a duplicate collection name", () => {
      // Arrange
      const registry = new SchemaRegistry();
      registry.register(makeCollection("users", [stringField("email")]));

      // Act & Assert
      expect(() => registry.register(makeCollection("users", [stringField("name")]))).toThrow(
        'Collection "users" is already registered',
      );
    });
  });

  describe("get", () => {
    test("returns undefined for an unregistered collection", () => {
      // Arrange
      const registry = new SchemaRegistry();

      // Act
      const result = registry.get("nonexistent");

      // Assert
      expect(result).toBeUndefined();
    });

    test("returns the registered collection", () => {
      // Arrange
      const registry = new SchemaRegistry();
      const collection = makeCollection("orders", [stringField("ref")]);
      registry.register(collection);

      // Act
      const result = registry.get("orders");

      // Assert
      expect(result).toBe(collection);
    });
  });

  describe("list", () => {
    test("returns empty array when no collections registered", () => {
      // Arrange
      const registry = new SchemaRegistry();

      // Act
      const result = registry.list();

      // Assert
      expect(result).toEqual([]);
    });

    test("returns all registered collections", () => {
      // Arrange
      const registry = new SchemaRegistry();
      const users = makeCollection("users", [stringField("email")]);
      const orders = makeCollection("orders", [stringField("ref")]);
      registry.register(users);
      registry.register(orders);

      // Act
      const result = registry.list();

      // Assert
      expect(result).toHaveLength(2);
      expect(result).toContain(users);
      expect(result).toContain(orders);
    });
  });

  describe("has", () => {
    test("returns false for unregistered collection", () => {
      // Arrange
      const registry = new SchemaRegistry();

      // Act
      const result = registry.has("users");

      // Assert
      expect(result).toBe(false);
    });

    test("returns true for registered collection", () => {
      // Arrange
      const registry = new SchemaRegistry();
      registry.register(makeCollection("users", [stringField("email")]));

      // Act
      const result = registry.has("users");

      // Assert
      expect(result).toBe(true);
    });
  });

  describe("remove", () => {
    test("returns false when removing unregistered collection", () => {
      // Arrange
      const registry = new SchemaRegistry();

      // Act
      const result = registry.remove("nonexistent");

      // Assert
      expect(result).toBe(false);
    });

    test("returns true and removes the collection", () => {
      // Arrange
      const registry = new SchemaRegistry();
      registry.register(makeCollection("users", [stringField("email")]));

      // Act
      const result = registry.remove("users");

      // Assert
      expect(result).toBe(true);
      expect(registry.has("users")).toBe(false);
    });
  });
});
