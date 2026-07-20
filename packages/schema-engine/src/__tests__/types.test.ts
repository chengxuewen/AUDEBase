import { describe, test, expect } from "vitest";
import { FIELD_TYPES, SchemaRegistry, validateField, validateCollection } from "../index";
import type { FieldType, FieldDef, CollectionDef, ValidationResult } from "../index";

describe("types smoke tests", () => {
  test("FIELD_TYPES contains all expected types", () => {
    // Arrange & Act
    const types = FIELD_TYPES;

    // Assert
    expect(types).toContain("string");
    expect(types).toContain("number");
    expect(types).toContain("boolean");
    expect(types).toContain("date");
    expect(types).toContain("enum");
    expect(types).toContain("belongsTo");
    expect(types).toContain("hasMany");
    expect(types).toHaveLength(7);
  });

  test("FieldDef type usage compiles and works", () => {
    // Arrange
    const field: FieldDef = {
      name: "title",
      type: "string",
      required: true,
      label: "Title",
    };

    // Act & Assert
    expect(field.name).toBe("title");
    expect(field.type).toBe("string");
    expect(field.required).toBe(true);
    expect(field.label).toBe("Title");
  });

  test("CollectionDef type usage compiles and works", () => {
    // Arrange
    const collection: CollectionDef = {
      name: "posts",
      fields: [
        { name: "title", type: "string" },
        { name: "body", type: "string" },
      ],
      primaryKey: "id",
      timestamps: true,
    };

    // Act & Assert
    expect(collection.name).toBe("posts");
    expect(collection.fields).toHaveLength(2);
    expect(collection.primaryKey).toBe("id");
    expect(collection.timestamps).toBe(true);
  });

  test("FieldType union covers all allowed values", () => {
    // Arrange
    const validTypes: FieldType[] = [
      "string",
      "number",
      "boolean",
      "date",
      "enum",
      "belongsTo",
      "hasMany",
    ];

    // Act & Assert
    for (const t of validTypes) {
      expect(FIELD_TYPES).toContain(t);
    }
  });

  test("ValidationResult type is correct shape", () => {
    // Arrange
    const valid: ValidationResult = { valid: true, errors: [] };
    const invalid: ValidationResult = {
      valid: false,
      errors: [{ path: "name", message: "required" }],
    };

    // Act & Assert
    expect(valid.valid).toBe(true);
    expect(valid.errors).toHaveLength(0);
    expect(invalid.valid).toBe(false);
    expect(invalid.errors).toHaveLength(1);
  });

  test("barrel exports include all classes and functions", () => {
    // Arrange & Act & Assert
    expect(SchemaRegistry).toBeDefined();
    expect(validateField).toBeDefined();
    expect(validateCollection).toBeDefined();
  });
});
