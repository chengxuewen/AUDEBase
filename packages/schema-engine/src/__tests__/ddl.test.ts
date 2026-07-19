import { describe, test, expect } from "vitest";
import {
  fieldToColumnType,
  generateCreateTable,
  generateCreateIndexes,
  generateAlterTable,
  validateSqlIdentifiers,
} from "../ddl";
import type { CollectionDef, FieldDef } from "../types";

// ─── fieldToColumnType ────────────────────────────────────────────────

describe("fieldToColumnType", () => {
  test("string field maps to VARCHAR(255)", () => {
    // Arrange
    const field: FieldDef = { name: "email", type: "string" };

    // Act
    const result = fieldToColumnType(field);

    // Assert
    expect(result).toBe('"email" VARCHAR(255)');
  });

  test("required string field adds NOT NULL", () => {
    // Arrange
    const field: FieldDef = { name: "name", type: "string", required: true };

    // Act
    const result = fieldToColumnType(field);

    // Assert
    expect(result).toBe('"name" VARCHAR(255) NOT NULL');
  });

  test("unique string field adds UNIQUE NOT NULL", () => {
    // Arrange
    const field: FieldDef = {
      name: "email",
      type: "string",
      unique: true,
      required: true,
    };

    // Act
    const result = fieldToColumnType(field);

    // Assert
    expect(result).toBe('"email" VARCHAR(255) UNIQUE NOT NULL');
  });

  test("number field maps to INTEGER", () => {
    // Arrange
    const field: FieldDef = { name: "age", type: "number" };

    // Act
    const result = fieldToColumnType(field);

    // Assert
    expect(result).toBe('"age" INTEGER');
  });

  test("unique number field adds UNIQUE NOT NULL", () => {
    // Arrange
    const field: FieldDef = {
      name: "code",
      type: "number",
      unique: true,
      required: true,
    };

    // Act
    const result = fieldToColumnType(field);

    // Assert
    expect(result).toBe('"code" INTEGER UNIQUE NOT NULL');
  });

  test("boolean field maps to BOOLEAN DEFAULT false", () => {
    // Arrange
    const field: FieldDef = { name: "active", type: "boolean" };

    // Act
    const result = fieldToColumnType(field);

    // Assert
    expect(result).toBe('"active" BOOLEAN DEFAULT false');
  });

  test("date field maps to TIMESTAMP", () => {
    // Arrange
    const field: FieldDef = { name: "birthday", type: "date" };

    // Act
    const result = fieldToColumnType(field);

    // Assert
    expect(result).toBe('"birthday" TIMESTAMP');
  });

  test("date field with required adds NOT NULL", () => {
    // Arrange
    const field: FieldDef = {
      name: "created",
      type: "date",
      required: true,
    };

    // Act
    const result = fieldToColumnType(field);

    // Assert
    expect(result).toBe('"created" TIMESTAMP NOT NULL');
  });

  test("enum field generates CHECK constraint", () => {
    // Arrange
    const field: FieldDef = {
      name: "status",
      type: "enum",
      enumValues: ["draft", "published", "archived"],
    };

    // Act
    const result = fieldToColumnType(field);

    // Assert
    expect(result).toBe(
      `"status" VARCHAR(50) CHECK ("status" IN ('draft', 'published', 'archived'))`,
    );
  });

  test("enum field with required adds NOT NULL", () => {
    // Arrange
    const field: FieldDef = {
      name: "status",
      type: "enum",
      enumValues: ["active", "inactive"],
      required: true,
    };

    // Act
    const result = fieldToColumnType(field);

    // Assert
    expect(result).toContain("NOT NULL");
    expect(result).toContain("CHECK");
  });

  test("belongsTo field generates REFERENCES with ON DELETE SET NULL", () => {
    // Arrange
    const field: FieldDef = {
      name: "user_id",
      type: "belongsTo",
      target: "users",
    };

    // Act
    const result = fieldToColumnType(field);

    // Assert
    expect(result).toBe('"user_id" INTEGER REFERENCES "users"(id) ON DELETE SET NULL');
  });

  test("belongsTo with required adds NOT NULL", () => {
    // Arrange
    const field: FieldDef = {
      name: "user_id",
      type: "belongsTo",
      target: "users",
      required: true,
    };

    // Act
    const result = fieldToColumnType(field);

    // Assert
    expect(result).toContain("NOT NULL");
    expect(result).toContain("REFERENCES");
  });

  test("hasMany field produces no column", () => {
    // Arrange
    const field: FieldDef = {
      name: "posts",
      type: "hasMany",
      target: "posts",
    };

    // Act
    const result = fieldToColumnType(field);

    // Assert
    expect(result).toBe("");
  });

  test("enum field escapes single quotes in values", () => {
    // Arrange
    const field: FieldDef = {
      name: "label",
      type: "enum",
      enumValues: ["it's", "ok"],
    };

    // Act
    const result = fieldToColumnType(field);

    // Assert
    expect(result).toContain("'it''s'");
  });
});

// ─── generateCreateTable ──────────────────────────────────────────────

describe("generateCreateTable", () => {
  test("generates CREATE TABLE with string and number fields", () => {
    // Arrange
    const collection: CollectionDef = {
      name: "users",
      fields: [
        { name: "name", type: "string", required: true },
        { name: "age", type: "number" },
      ],
    };

    // Act
    const sql = generateCreateTable(collection);

    // Assert
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "users"');
    expect(sql).toContain('"id" SERIAL PRIMARY KEY');
    expect(sql).toContain('"name" VARCHAR(255) NOT NULL');
    expect(sql).toContain('"age" INTEGER');
    expect(sql).toContain('"created_at" TIMESTAMP DEFAULT NOW()');
    expect(sql).toContain('"updated_at" TIMESTAMP DEFAULT NOW()');
  });

  test("uses custom table name", () => {
    // Arrange
    const collection: CollectionDef = {
      name: "orders",
      table: "app_orders",
      fields: [{ name: "ref", type: "string", required: true }],
    };

    // Act
    const sql = generateCreateTable(collection);

    // Assert
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "app_orders"');
  });

  test("uses custom primary key", () => {
    // Arrange
    const collection: CollectionDef = {
      name: "items",
      primaryKey: "uuid",
      fields: [
        { name: "uuid", type: "string", required: true, unique: true },
        { name: "label", type: "string" },
      ],
    };

    // Act
    const sql = generateCreateTable(collection);

    // Assert
    expect(sql).toContain('"uuid" SERIAL PRIMARY KEY');
    // The uuid field should NOT appear twice — once as PK, not again as a column
    const uuidOccurrences = sql.split('"uuid"').length - 1;
    expect(uuidOccurrences).toBe(1);
  });

  test("timestamp fields omitted when timestamps is false", () => {
    // Arrange
    const collection: CollectionDef = {
      name: "logs",
      timestamps: false,
      fields: [{ name: "message", type: "string" }],
    };

    // Act
    const sql = generateCreateTable(collection);

    // Assert
    expect(sql).not.toContain("created_at");
    expect(sql).not.toContain("updated_at");
  });

  test("hasMany fields are skipped in table creation", () => {
    // Arrange
    const collection: CollectionDef = {
      name: "authors",
      fields: [
        { name: "name", type: "string", required: true },
        { name: "posts", type: "hasMany", target: "posts" },
      ],
    };

    // Act
    const sql = generateCreateTable(collection);

    // Assert
    expect(sql).not.toContain("posts");
    expect(sql).toContain('"name"');
    expect(sql).toContain('"id" SERIAL PRIMARY KEY');
  });

  test("enum field generates CHECK constraint in CREATE TABLE", () => {
    // Arrange
    const collection: CollectionDef = {
      name: "tasks",
      fields: [
        {
          name: "status",
          type: "enum",
          enumValues: ["todo", "done"],
          required: true,
        },
      ],
    };

    // Act
    const sql = generateCreateTable(collection);

    // Assert
    expect(sql).toContain("CHECK");
    expect(sql).toContain("'todo'");
    expect(sql).toContain("'done'");
  });

  test("belongsTo generates REFERENCES in CREATE TABLE", () => {
    // Arrange
    const collection: CollectionDef = {
      name: "posts",
      fields: [
        { name: "title", type: "string", required: true },
        { name: "author_id", type: "belongsTo", target: "users" },
      ],
    };

    // Act
    const sql = generateCreateTable(collection);

    // Assert
    expect(sql).toContain('REFERENCES "users"(id) ON DELETE SET NULL');
  });
});

// ─── generateCreateIndexes ────────────────────────────────────────────

describe("generateCreateIndexes", () => {
  test("generates indexes for belongsTo foreign key columns", () => {
    // Arrange
    const collection: CollectionDef = {
      name: "posts",
      fields: [
        { name: "title", type: "string", required: true },
        { name: "author_id", type: "belongsTo", target: "users" },
        { name: "category_id", type: "belongsTo", target: "categories" },
      ],
    };

    // Act
    const indexes = generateCreateIndexes(collection);

    // Assert
    expect(indexes).toHaveLength(2);
    expect(indexes[0]).toContain('CREATE INDEX IF NOT EXISTS "idx_posts_author_id"');
    expect(indexes[0]).toContain('ON "posts" ("author_id")');
    expect(indexes[1]).toContain('"idx_posts_category_id"');
  });

  test("returns empty array when no FK columns exist", () => {
    // Arrange
    const collection: CollectionDef = {
      name: "tags",
      fields: [
        { name: "label", type: "string", required: true },
        { name: "count", type: "number" },
      ],
    };

    // Act
    const indexes = generateCreateIndexes(collection);

    // Assert
    expect(indexes).toHaveLength(0);
  });

  test("uses custom table name in index names", () => {
    // Arrange
    const collection: CollectionDef = {
      name: "comments",
      table: "blog_comments",
      fields: [{ name: "post_id", type: "belongsTo", target: "posts" }],
    };

    // Act
    const indexes = generateCreateIndexes(collection);

    // Assert
    expect(indexes[0]).toContain('"idx_blog_comments_post_id"');
    expect(indexes[0]).toContain('ON "blog_comments"');
  });
});

// ─── generateAlterTable ───────────────────────────────────────────────

describe("generateAlterTable", () => {
  test("generates ADD COLUMN statements for new fields", () => {
    // Arrange
    const collection: CollectionDef = {
      name: "users",
      fields: [{ name: "name", type: "string" }],
    };
    const newFields: FieldDef[] = [
      { name: "phone", type: "string" },
      { name: "age", type: "number" },
    ];

    // Act
    const statements = generateAlterTable(collection, newFields);

    // Assert
    expect(statements).toHaveLength(2);
    expect(statements[0]).toBe('ALTER TABLE "users" ADD COLUMN "phone" VARCHAR(255);');
    expect(statements[1]).toBe('ALTER TABLE "users" ADD COLUMN "age" INTEGER;');
  });

  test("skips hasMany fields in ALTER TABLE", () => {
    // Arrange
    const collection: CollectionDef = {
      name: "users",
      fields: [{ name: "name", type: "string" }],
    };
    const newFields: FieldDef[] = [
      { name: "bio", type: "string" },
      { name: "posts", type: "hasMany", target: "posts" },
    ];

    // Act
    const statements = generateAlterTable(collection, newFields);

    // Assert
    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain('"bio"');
  });

  test("returns empty array when no new fields", () => {
    // Arrange
    const collection: CollectionDef = {
      name: "users",
      fields: [{ name: "name", type: "string" }],
    };

    // Act
    const statements = generateAlterTable(collection, []);

    // Assert
    expect(statements).toHaveLength(0);
  });

  test("respects custom table name in ALTER TABLE", () => {
    // Arrange
    const collection: CollectionDef = {
      name: "items",
      table: "app_items",
      fields: [{ name: "label", type: "string" }],
    };
    const newFields: FieldDef[] = [{ name: "color", type: "string" }];

    // Act
    const statements = generateAlterTable(collection, newFields);

    // Assert
    expect(statements[0]).toContain('TABLE "app_items"');
  });
});

// ─── validateSqlIdentifiers ───────────────────────────────────────────

describe("validateSqlIdentifiers", () => {
  test("valid identifiers pass validation", () => {
    // Arrange
    const collection: CollectionDef = {
      name: "users",
      fields: [
        { name: "first_name", type: "string" },
        { name: "age2", type: "number" },
      ],
    };

    // Act
    const result = validateSqlIdentifiers(collection);

    // Assert
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("rejects identifiers with special characters", () => {
    // Arrange
    const collection: CollectionDef = {
      name: "users",
      fields: [{ name: "email-hash", type: "string" }],
    };

    // Act
    const result = validateSqlIdentifiers(collection);

    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes("email-hash"))).toBe(true);
  });

  test("rejects identifiers that are too long (>63 chars)", () => {
    // Arrange
    const longName = "a".repeat(64);
    const collection: CollectionDef = {
      name: "users",
      fields: [{ name: longName, type: "string" }],
    };

    // Act
    const result = validateSqlIdentifiers(collection);

    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("exceeds"))).toBe(true);
  });

  test("rejects table names that are SQL reserved words", () => {
    // Arrange
    const collection: CollectionDef = {
      name: "select",
      fields: [{ name: "value", type: "string" }],
    };

    // Act
    const result = validateSqlIdentifiers(collection);

    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "table" && e.message.includes("reserved"))).toBe(
      true,
    );
  });

  test("rejects field names that are SQL reserved words", () => {
    // Arrange
    const collection: CollectionDef = {
      name: "users",
      fields: [{ name: "table", type: "string" }],
    };

    // Act
    const result = validateSqlIdentifiers(collection);

    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("reserved"))).toBe(true);
  });
});

// ─── Full round-trip integration ──────────────────────────────────────

describe("DDL round-trip integration", () => {
  test("CollectionDef → SQL produces parseable, self-consistent output", () => {
    // Arrange
    const collection: CollectionDef = {
      name: "products",
      table: "app_products",
      fields: [
        { name: "name", type: "string", required: true },
        { name: "price", type: "number", required: true },
        { name: "active", type: "boolean" },
        {
          name: "status",
          type: "enum",
          enumValues: ["draft", "published", "archived"],
          required: true,
        },
        { name: "category_id", type: "belongsTo", target: "categories" },
        { name: "reviews", type: "hasMany", target: "reviews" },
      ],
    };

    // Act
    const sql = generateCreateTable(collection);
    const indexes = generateCreateIndexes(collection);

    // Assert — table structure
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "app_products"');
    expect(sql).toContain('"id" SERIAL PRIMARY KEY');
    expect(sql).toContain('"name" VARCHAR(255) NOT NULL');
    expect(sql).toContain('"price" INTEGER NOT NULL');
    expect(sql).toContain('"active" BOOLEAN DEFAULT false');
    expect(sql).toContain("CHECK");
    expect(sql).toContain("'draft'");
    expect(sql).toContain('"category_id" INTEGER REFERENCES "categories"(id) ON DELETE SET NULL');
    expect(sql).not.toContain('"reviews"');
    expect(sql).toContain('"created_at" TIMESTAMP DEFAULT NOW()');
    expect(sql).toContain('"updated_at" TIMESTAMP DEFAULT NOW()');

    // Assert — indexes
    expect(indexes).toHaveLength(1);
    expect(indexes[0]).toContain('"idx_app_products_category_id"');

    // Assert — all SQL statements end with semicolons
    expect(sql).toContain(";");
    expect(indexes.every((ix) => ix.endsWith(";"))).toBe(true);
  });
});
