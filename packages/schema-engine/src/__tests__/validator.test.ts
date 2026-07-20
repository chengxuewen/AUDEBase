import { describe, test, expect } from "vitest";
import { validateField, validateCollection } from "../validator";
import type { CollectionDef, FieldDef } from "../types";

describe("validateField", () => {
  test("valid field returns valid result", () => {
    // Arrange
    const field: FieldDef = { name: "email", type: "string" };

    // Act
    const result = validateField(field);

    // Assert
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("field with all optional properties is valid", () => {
    // Arrange
    const field: FieldDef = {
      name: "age",
      type: "number",
      required: true,
      unique: false,
      default: 0,
      label: "Age",
    };

    // Act
    const result = validateField(field);

    // Assert
    expect(result.valid).toBe(true);
  });

  test("rejects field with empty name", () => {
    // Arrange
    const field: FieldDef = { name: "", type: "string" };

    // Act
    const result = validateField(field);

    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      path: "name",
      message: "Field name is required",
    });
  });

  test("rejects field with missing name", () => {
    // Arrange
    const field = { type: "string" } as FieldDef;

    // Act
    const result = validateField(field);

    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "name")).toBe(true);
  });

  test("rejects field with missing type", () => {
    // Arrange
    const field = { name: "x" } as FieldDef;

    // Act
    const result = validateField(field);

    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "type")).toBe(true);
  });

  test("rejects field with invalid type", () => {
    // Arrange
    const field: FieldDef = { name: "x", type: "invalid" as "string" };

    // Act
    const result = validateField(field);

    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      path: "type",
      message: 'Invalid field type "invalid"',
    });
  });

  test("rejects enum field without enumValues", () => {
    // Arrange
    const field: FieldDef = { name: "status", type: "enum" };

    // Act
    const result = validateField(field);

    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      path: "enumValues",
      message: "enum type requires enumValues with at least one value",
    });
  });

  test("rejects enum field with empty enumValues", () => {
    // Arrange
    const field: FieldDef = {
      name: "status",
      type: "enum",
      enumValues: [],
    };

    // Act
    const result = validateField(field);

    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      path: "enumValues",
      message: "enum type requires enumValues with at least one value",
    });
  });

  test("accepts valid enum field with enumValues", () => {
    // Arrange
    const field: FieldDef = {
      name: "status",
      type: "enum",
      enumValues: ["draft", "published"],
    };

    // Act
    const result = validateField(field);

    // Assert
    expect(result.valid).toBe(true);
  });

  test("rejects belongsTo field without target", () => {
    // Arrange
    const field: FieldDef = { name: "author", type: "belongsTo" };

    // Act
    const result = validateField(field);

    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      path: "target",
      message: "belongsTo type requires a target collection name",
    });
  });

  test("rejects hasMany field without target", () => {
    // Arrange
    const field: FieldDef = { name: "orders", type: "hasMany" };

    // Act
    const result = validateField(field);

    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      path: "target",
      message: "hasMany type requires a target collection name",
    });
  });

  test("accepts belongsTo field with target", () => {
    // Arrange
    const field: FieldDef = {
      name: "author",
      type: "belongsTo",
      target: "users",
    };

    // Act
    const result = validateField(field);

    // Assert
    expect(result.valid).toBe(true);
  });

  test("accepts hasMany field with target", () => {
    // Arrange
    const field: FieldDef = {
      name: "comments",
      type: "hasMany",
      target: "comments",
    };

    // Act
    const result = validateField(field);

    // Assert
    expect(result.valid).toBe(true);
  });

  test("accepts all valid field types", () => {
    // Arrange
    const types = ["string", "number", "boolean", "date"] as const;

    for (const type of types) {
      const field: FieldDef = { name: "f", type };

      // Act
      const result = validateField(field);

      // Assert
      expect(result.valid).toBe(true);
    }
  });
});

describe("validateCollection", () => {
  test("valid collection passes", () => {
    // Arrange
    const collection: CollectionDef = {
      name: "users",
      fields: [
        { name: "id", type: "string" },
        { name: "email", type: "string" },
      ],
    };

    // Act
    const result = validateCollection(collection);

    // Assert
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("rejects collection with empty name", () => {
    // Arrange
    const collection: CollectionDef = {
      name: "",
      fields: [{ name: "id", type: "string" }],
    };

    // Act
    const result = validateCollection(collection);

    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      path: "name",
      message: "Collection name is required",
    });
  });

  test("rejects collection with no fields", () => {
    // Arrange
    const collection: CollectionDef = {
      name: "users",
      fields: [],
    };

    // Act
    const result = validateCollection(collection);

    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      path: "fields",
      message: "Collection must have at least one field",
    });
  });

  test("rejects collection with duplicate field names", () => {
    // Arrange
    const collection: CollectionDef = {
      name: "users",
      fields: [
        { name: "email", type: "string" },
        { name: "email", type: "string" },
      ],
    };

    // Act
    const result = validateCollection(collection);

    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      path: "fields.email",
      message: 'Duplicate field name "email"',
    });
  });

  test("rejects collection with invalid nested field", () => {
    // Arrange
    const collection: CollectionDef = {
      name: "users",
      fields: [
        { name: "email", type: "string" },
        { name: "status", type: "enum" },
      ],
    };

    // Act
    const result = validateCollection(collection);

    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      path: "fields[1].enumValues",
      message: "enum type requires enumValues with at least one value",
    });
  });

  test("full collection with table, primaryKey, timestamps is valid", () => {
    // Arrange
    const collection: CollectionDef = {
      name: "orders",
      table: "app_orders",
      fields: [
        { name: "id", type: "string" },
        { name: "ref", type: "string", required: true, unique: true },
      ],
      primaryKey: "id",
      timestamps: true,
    };

    // Act
    const result = validateCollection(collection);

    // Assert
    expect(result.valid).toBe(true);
  });
});
