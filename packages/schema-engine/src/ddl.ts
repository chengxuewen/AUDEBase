import type { CollectionDef, FieldDef, ValidationResult } from "./types";

// ─── SQL identifier validation ───────────────────────────────────────

const SQL_RESERVED = new Set([
  "table",
  "select",
  "from",
  "where",
  "insert",
  "update",
  "delete",
  "create",
  "alter",
  "drop",
  "index",
  "primary",
  "key",
  "foreign",
  "references",
  "constraint",
  "check",
  "default",
  "not",
  "null",
  "unique",
  "values",
  "into",
  "set",
  "by",
  "order",
  "group",
  "having",
  "join",
  "inner",
  "outer",
  "left",
  "right",
  "on",
  "as",
  "asc",
  "desc",
  "limit",
  "offset",
  "union",
  "all",
  "any",
  "exists",
  "between",
  "like",
  "in",
  "is",
  "or",
  "and",
]);

const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const MAX_IDENTIFIER_LENGTH = 63;

/**
 * Validate table and column names for SQL safety.
 * Returns a ValidationResult indicating whether all identifiers are safe.
 */
export function validateSqlIdentifiers(collection: CollectionDef): ValidationResult {
  const errors: { path: string; message: string }[] = [];

  const checkIdentifier = (value: string, path: string): void => {
    if (!value || value.length === 0) {
      errors.push({ path, message: `Identifier is empty at "${path}"` });
      return;
    }
    if (value.length > MAX_IDENTIFIER_LENGTH) {
      errors.push({
        path,
        message: `Identifier "${value}" exceeds ${MAX_IDENTIFIER_LENGTH} characters at "${path}"`,
      });
      return;
    }
    if (!IDENTIFIER_RE.test(value)) {
      errors.push({
        path,
        message: `Identifier "${value}" contains invalid characters at "${path}"`,
      });
      return;
    }
    if (SQL_RESERVED.has(value.toLowerCase())) {
      errors.push({
        path,
        message: `Identifier "${value}" is a reserved word at "${path}"`,
      });
    }
  };

  const tableName = collection.table ?? collection.name;
  checkIdentifier(tableName, "table");

  for (const field of collection.fields) {
    checkIdentifier(field.name, `fields.${field.name}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ─── Type mapping ─────────────────────────────────────────────────────

function quoteIdent(name: string): string {
  return `"${name}"`;
}

/**
 * Map a FieldDef to its SQL column type string.
 */
export function fieldToColumnType(field: FieldDef): string {
  const col = quoteIdent(field.name);
  const isRequired = field.required === true;
  const isUnique = field.unique === true;

  switch (field.type) {
    case "string": {
      let sql = "VARCHAR(255)";
      if (isUnique) sql += " UNIQUE";
      if (isRequired) sql += " NOT NULL";
      return `${col} ${sql}`;
    }

    case "number": {
      let sql = "INTEGER";
      if (isUnique) sql += " UNIQUE";
      if (isRequired) sql += " NOT NULL";
      return `${col} ${sql}`;
    }

    case "boolean": {
      return `${col} BOOLEAN DEFAULT false`;
    }

    case "date": {
      let sql = "TIMESTAMP";
      if (isRequired) sql += " NOT NULL";
      return `${col} ${sql}`;
    }

    case "enum": {
      const values = field.enumValues ?? [];
      const escapedValues = values.map((v) => `'${v.replace(/'/g, "''")}'`);
      let sql = `VARCHAR(50)`;
      sql += ` CHECK (${col} IN (${escapedValues.join(", ")}))`;
      if (isRequired) sql += " NOT NULL";
      return `${col} ${sql}`;
    }

    case "belongsTo": {
      const targetTable = field.target ?? "unknown";
      let sql = `INTEGER REFERENCES ${quoteIdent(targetTable)}(id) ON DELETE SET NULL`;
      if (isRequired) sql += " NOT NULL";
      return `${col} ${sql}`;
    }

    case "hasMany": {
      // hasMany does not produce a column on this table
      return "";
    }

    // ponytail: exhaustive guard — TS compile-time check for missing types
    default: {
      const _exhaustive: never = field.type;
      void _exhaustive;
      return `${col} TEXT`;
    }
  }
}

// ─── DDL generation ───────────────────────────────────────────────────

/**
 * Generate a CREATE TABLE IF NOT EXISTS statement from a CollectionDef.
 */
export function generateCreateTable(collection: CollectionDef): string {
  const tableName = collection.table ?? collection.name;
  const pkName = collection.primaryKey ?? "id";
  const hasTimestamps = collection.timestamps !== false;

  const lines: string[] = [];

  // Primary key
  lines.push(`  ${quoteIdent(pkName)} SERIAL PRIMARY KEY`);

  // Regular fields (skip the PK field if it's a user-defined field)
  for (const field of collection.fields) {
    if (field.name === pkName) continue;
    const columnSql = fieldToColumnType(field);
    if (columnSql.length > 0) {
      lines.push(`  ${columnSql}`);
    }
  }

  // Timestamps
  if (hasTimestamps) {
    lines.push(`  "created_at" TIMESTAMP DEFAULT NOW()`);
    lines.push(`  "updated_at" TIMESTAMP DEFAULT NOW()`);
  }

  return [
    `CREATE TABLE IF NOT EXISTS ${quoteIdent(tableName)} (`,
    lines.join(",\n"),
    "",
    ");",
  ].join("\n");
}

/**
 * Generate CREATE INDEX statements for foreign key columns and explicitly indexed fields.
 * PostgreSQL automatically indexes PRIMARY KEY and UNIQUE columns,
 * so only FK columns and explicit index requests need manual indexes.
 */
export function generateCreateIndexes(collection: CollectionDef): string[] {
  const tableName = collection.table ?? collection.name;
  const indexes: string[] = [];

  for (const field of collection.fields) {
    if (field.type === "belongsTo") {
      const idxName = `idx_${tableName}_${field.name}`;
      indexes.push(
        `CREATE INDEX IF NOT EXISTS ${quoteIdent(idxName)} ON ${quoteIdent(tableName)} (${quoteIdent(field.name)});`,
      );
    }
  }

  return indexes;
}

/**
 * Generate ALTER TABLE ADD COLUMN statements for new fields.
 * Used during D12.1 extends — adding fields to existing tables.
 */
export function generateAlterTable(
  collection: CollectionDef,
  newFields: readonly FieldDef[],
): string[] {
  const tableName = collection.table ?? collection.name;
  const statements: string[] = [];

  for (const field of newFields) {
    const columnSql = fieldToColumnType(field);
    if (columnSql.length > 0) {
      statements.push(`ALTER TABLE ${quoteIdent(tableName)} ADD COLUMN ${columnSql};`);
    }
  }

  return statements;
}
