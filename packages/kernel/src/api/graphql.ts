/**
 * graphql.ts — GraphQL-lite endpoint for AUDEBase kernel.
 *
 * Parses a subset of GraphQL query syntax:
 *   { modelName { field1 field2 } }
 *
 * Maps model names to Drizzle schema tables and returns only requested fields.
 * No external dependencies — manual recursive descent parser.
 *
 * Route: POST /api/graphql
 * Body: { query: string, variables?: Record<string, unknown> }
 * Response: { data: Record<string, unknown[]> } | { errors: { message: string }[] }
 */

import type { FastifyInstance, FastifyBaseLogger } from "fastify";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgTable } from "drizzle-orm/pg-core";
import { createAuthMiddleware } from "../auth/middleware";
import { users } from "../db/schema/users";
import { roles } from "../db/schema/roles";
import { permissions } from "../db/schema/permissions";
import { collections } from "../db/schema/collections";
import { modules } from "../db/schema/modules";

// ── Types ────────────────────────────────────────────────────


interface GraphQLError {
  message: string;
}

interface GraphQLResponse {
  data?: Record<string, unknown[]>;
  errors?: GraphQLError[];
}

interface ParsedField {
  name: string;
  children: ParsedField[];
}

interface ParsedQuery {
  model: string;
  fields: ParsedField[];
}

// ── Model Registry ───────────────────────────────────────────

/** Mapping from GraphQL query model name to Drizzle table reference */
interface ModelEntry {
  readonly table: PgTable;
  /** Whitelist of queryable columns (excludes password_hash, token_version) */
  readonly publicFields: ReadonlySet<string>;
}

const modelRegistry = new Map<string, ModelEntry>();

function registerModel(name: string, table: PgTable, excludeFields: string[] = []): void {
  // ponytail: derive public field names from the table's column keys
  const exclude = new Set(excludeFields);
  const publicFields = new Set(
    Object.keys(table).filter((k) => !k.startsWith("_") && k !== "tableName" && !exclude.has(k)),
  );
  modelRegistry.set(name, { table, publicFields });
}

// Register core models (exclude sensitive fields)
registerModel("users", users, ["password_hash", "token_version"]);
registerModel("roles", roles);
registerModel("permissions", permissions);
registerModel("collections", collections);
registerModel("modules", modules);

// ── GraphQL Parser ───────────────────────────────────────────

/** Tokenize a GraphQL query string into an array of tokens */
function tokenize(query: string): string[] {
  // ponytail: simple character-by-character tokenizer
  const tokens: string[] = [];
  let i = 0;

  while (i < query.length) {
    const ch = query.charAt(i);

    // Skip whitespace, newlines, commas
    if (ch === "," || ch === " " || ch === "\n" || ch === "\r" || ch === "\t") {
      i++;
      continue;
    }

    if (ch === "{" || ch === "}") {
      tokens.push(ch);
      i++;
      continue;
    }

    // Identifier: word characters
    if (/[a-zA-Z0-9_]/.test(ch)) {
      let word = "";
      while (i < query.length) {
        const wc = query.charAt(i);
        if (!/[a-zA-Z0-9_]/.test(wc)) break;
        word += wc;
        i++;
      }
      tokens.push(word);
      continue;
    }

    i++;
  }

  return tokens;
}

/** Parse field children from tokens, consuming until '}' */
function parseFields(tokens: string[], pos: number): { fields: ParsedField[]; next: number } {
  const fields: ParsedField[] = [];

  while (pos < tokens.length) {
    if (tokens[pos] === "}") {
      return { fields, next: pos + 1 };
    }

    if (tokens[pos] === "{") {
      // Nested object — skip for now (no joins)
      // Find matching closing brace
      let depth = 1;
      pos++;
      while (pos < tokens.length && depth > 0) {
        if (tokens[pos] === "{") depth++;
        else if (tokens[pos] === "}") depth--;
        pos++;
      }
      continue;
    }

    // Field name
    const name = tokens[pos];
    if (typeof name !== "string") {
      pos++;
      continue;
    }
    pos++;

    // Check for nested fields
    if (pos < tokens.length && tokens[pos] === "{") {
      const result = parseFields(tokens, pos + 1);
      fields.push({ name, children: result.fields });
      pos = result.next;
    } else {
      fields.push({ name, children: [] });
    }
  }

  return { fields, next: pos };
}

/** Parse a single GraphQL query into model + fields */
function parseQuery(query: string): ParsedQuery[] {
  const tokens = tokenize(query);
  if (tokens.length === 0 || tokens[0] !== "{") {
    return [];
  }

  const queries: ParsedQuery[] = [];
  let pos = 1;

  while (pos < tokens.length) {
    if (tokens[pos] === "}") break;

    const model = tokens[pos];
    if (typeof model !== "string") {
      pos++;
      continue;
    }
    pos++;

    if (pos >= tokens.length || tokens[pos] !== "{") {
      pos++;
      continue;
    }

    const result = parseFields(tokens, pos + 1);
    queries.push({ model, fields: result.fields });
    pos = result.next;
  }

  return queries;
}

/** Flatten a ParsedField tree into a list of top-level field names (ignore nested) */
function flattenFields(fields: ParsedField[]): string[] {
  return fields
    .filter((f) => f.children.length === 0)
    .map((f) => f.name);
}

// ── Query Execution ──────────────────────────────────────────

/** Validate that all requested fields exist on the model */
function validateFields(
  modelName: string,
  entry: ModelEntry,
  requestedFields: string[],
): GraphQLError[] {
  const errors: GraphQLError[] = [];
  for (const field of requestedFields) {
    if (!entry.publicFields.has(field)) {
      errors.push({
        message: `Field "${field}" not found on model "${modelName}"`,
      });
    }
  }
  return errors;
}

/** Execute a query against the database and return only requested fields */
async function executeQuery(
  db: NodePgDatabase,
  entry: ModelEntry,
  requestedFields: string[],
  tenantId?: string,
): Promise<Record<string, unknown>[]> {
  // ponytail: select all columns, filter in JS — avoids building dynamic Drizzle select objects
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await (db.select().from(entry.table as any) as Promise<Record<string, unknown>[]>);

  const validFields = requestedFields.filter((f) => entry.publicFields.has(f));

  return rows.map((row) => {
    if (tenantId !== undefined && row.tenant_id !== tenantId) return null;
    const filtered: Record<string, unknown> = {};
    for (const field of validFields) {
      if (field in row) {
        filtered[field] = row[field];
      }
    }
    return filtered;
  }).filter((r): r is Record<string, unknown> => r !== null);
}

// ── Route Registration ───────────────────────────────────────

interface GraphQLRouteOptions {
  /** If true, skip auth (for testing) */
  skipAuth?: boolean;
}

/**
 * Register the GraphQL endpoint on a Fastify instance.
 *
 * POST /api/graphql
 * Body: { query: string, variables?: object }
 * Response: { data: { modelName: [...] } } | { errors: [{ message: "..." }] }
 */
export function registerGraphQLRoute(
  app: FastifyInstance,
  db: NodePgDatabase,
  jwtSecret: string,
  logger: FastifyBaseLogger,
  options: GraphQLRouteOptions = {},
): void {
  const requireAuth = createAuthMiddleware(db, jwtSecret);

  const preHandler = options.skipAuth ? [] : [requireAuth];

  app.post("/api/graphql", { preHandler }, async (request, reply): Promise<GraphQLResponse> => {
    const body = request.body as Record<string, unknown>;

    if (!body || typeof body.query !== "string" || !body.query.trim()) {
      return reply.status(400).send({
        errors: [{ message: "Missing or invalid 'query' field in request body" }],
      });
    }

    // ponytail: extract tenant_id from authenticated user for multi-tenant filtering
    const tenantId = request.user?.tenantId as string | undefined;

    const parsed = parseQuery(body.query.trim());
    if (parsed.length === 0) {
      return reply.status(400).send({
        errors: [{ message: "Failed to parse GraphQL query" }],
      });
    }

    const data: Record<string, unknown[]> = {};
    const allErrors: GraphQLError[] = [];

    for (const q of parsed) {
      const entry = modelRegistry.get(q.model);
      if (!entry) {
        allErrors.push({
          message: `Unknown model "${q.model}". Available: ${[...modelRegistry.keys()].join(", ")}`,
        });
        continue;
      }

      const fieldNames = flattenFields(q.fields);
      if (fieldNames.length === 0) {
        allErrors.push({
          message: `No valid fields requested for model "${q.model}"`,
        });
        continue;
      }

      const fieldErrors = validateFields(q.model, entry, fieldNames);
      if (fieldErrors.length > 0) {
        allErrors.push(...fieldErrors);
        continue;
      }

      try {
        const rows = await executeQuery(db, entry, fieldNames, tenantId);
        data[q.model] = rows;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ err: msg, model: q.model }, "graphql query failed");
        allErrors.push({
          message: `Query failed for model "${q.model}": ${msg}`,
        });
      }
    }

    const response: GraphQLResponse = {};
    if (Object.keys(data).length > 0) response.data = data;
    if (allErrors.length > 0) response.errors = allErrors;

    return response;
  });

  logger.info("graphql endpoint registered at POST /api/graphql");
}
