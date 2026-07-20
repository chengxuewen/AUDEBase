/**
 * Record Rules Engine (D10) — Odoo-style domain filter injection
 *
 * Parses Poland-notation domain filter arrays from manifest permissions
 * and auto-injects WHERE conditions into DB queries.
 *
 * Domain Filter Syntax (D10):
 *   ["&", condA, condB]  →  AND
 *   ["|", condA, condB]  →  OR
 *   ["!", cond]          →  NOT
 *   ["field", "op", val] →  comparison leaf
 *
 * Operators: = != > < >= <= in 'not in' like ilike
 *
 * Example:
 *   ["&", ["status", "=", "draft"], ["amount", ">", 1000]]
 *   → WHERE status = $1 AND amount > $2  with params ['draft', 1000]
 */

// ── Types ────────────────────────────────────────────────────────────────────

/** All supported comparison operators */
export type ComparisonOperator =
  | "="
  | "!="
  | ">"
  | "<"
  | ">="
  | "<="
  | "in"
  | "not in"
  | "like"
  | "ilike";

/** A single field-value comparison */
export interface LeafCondition {
  readonly field: string;
  readonly operator: ComparisonOperator;
  readonly value: unknown;
}

/** AND node */
export interface AndCondition {
  readonly operator: "&";
  readonly conditions: readonly TypedCondition[];
}

/** OR node */
export interface OrCondition {
  readonly operator: "|";
  readonly conditions: readonly TypedCondition[];
}

/** NOT node */
export interface NotCondition {
  readonly operator: "!";
  readonly condition: TypedCondition;
}

/** Parsed condition tree */
export type TypedCondition =
  | LeafCondition
  | AndCondition
  | OrCondition
  | NotCondition;

/** Raw domain filter tuple as declared in manifest */
export type DomainFilterTuple = readonly unknown[];

/** Result of SQL WHERE clause generation */
export interface WhereClauseResult {
  readonly sql: string;
  readonly params: readonly unknown[];
}

/** Options for generateWhereClause */
export interface WhereClauseOptions {
  readonly tableAlias?: string;
  readonly tenantId?: string;
  readonly tenantFieldName?: string;
}

/** Error thrown for malformed domain filters */
export class DomainFilterError extends Error {
  constructor(message: string) {
    super(`[DomainFilter] ${message}`);
    this.name = "DomainFilterError";
  }
}

// ── Constants ────────────────────────────────────────────────────────────────

const VALID_OPERATORS: ReadonlySet<string> = new Set([
  "=",
  "!=",
  ">",
  "<",
  ">=",
  "<=",
  "in",
  "not in",
  "like",
  "ilike",
]);

const FIELD_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

// ── Validators ───────────────────────────────────────────────────────────────

function validateField(field: unknown): string {
  if (typeof field !== "string" || !FIELD_NAME_RE.test(field)) {
    throw new DomainFilterError(
      `Invalid field name: ${JSON.stringify(field)}. Must match ${FIELD_NAME_RE}.`,
    );
  }
  return field;
}

function validateOperator(op: unknown): ComparisonOperator {
  if (typeof op !== "string" || !VALID_OPERATORS.has(op)) {
    throw new DomainFilterError(
      `Invalid operator: ${JSON.stringify(op)}. Must be one of: ${[...VALID_OPERATORS].sort().join(", ")}.`,
    );
  }
  return op as ComparisonOperator;
}

function validateValueForOperator(
  operator: ComparisonOperator,
  value: unknown,
): void {
  if (operator === "in" || operator === "not in") {
    if (!Array.isArray(value)) {
      throw new DomainFilterError(
        `Operator "${operator}" requires an array value, got: ${JSON.stringify(value)}.`,
      );
    }
    if (value.length === 0) {
      throw new DomainFilterError(
        `Operator "${operator}" requires a non-empty array.`,
      );
    }
  }
}

// ── Type Guards ──────────────────────────────────────────────────────────────

function isLeaf(c: TypedCondition): c is LeafCondition {
  return "field" in c;
}

// ── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parse an Odoo-style Poland-notation domain filter array into a condition tree.
 */
export function parseDomainFilter(filter: DomainFilterTuple): TypedCondition {
  if (!Array.isArray(filter)) {
    throw new DomainFilterError(`Expected an array, got ${typeof filter}.`);
  }
  if (filter.length === 0) {
    throw new DomainFilterError("Empty filter array.");
  }

  const first = filter[0];

  if (first === "&") {
    const children = filter.slice(1);
    if (children.length < 2) {
      throw new DomainFilterError(
        `"&" requires at least 2 conditions, got ${children.length}.`,
      );
    }
    return {
      operator: "&",
      conditions: children.map((c) => parseDomainFilter(c as DomainFilterTuple)),
    };
  }

  if (first === "|") {
    const children = filter.slice(1);
    if (children.length < 2) {
      throw new DomainFilterError(
        `"|" requires at least 2 conditions, got ${children.length}.`,
      );
    }
    return {
      operator: "|",
      conditions: children.map((c) => parseDomainFilter(c as DomainFilterTuple)),
    };
  }

  if (first === "!") {
    const children = filter.slice(1);
    if (children.length !== 1) {
      throw new DomainFilterError(
        `"!" requires exactly 1 condition, got ${children.length}.`,
      );
    }
    return {
      operator: "!",
      condition: parseDomainFilter(children[0] as DomainFilterTuple),
    };
  }

  // Leaf: [field, operator, value]
  if (filter.length !== 3) {
    throw new DomainFilterError(
      `Leaf condition must have 3 elements [field, op, value], got ${filter.length}: ${JSON.stringify(filter)}.`,
    );
  }

  const field = validateField(filter[0]);
  const operator = validateOperator(filter[1]);
  const value = filter[2];
  validateValueForOperator(operator, value);

  return { field, operator, value };
}

// ── In-Memory Evaluator ──────────────────────────────────────────────────────

/**
 * Evaluate a parsed condition against a data row (in-memory).
 */
export function evaluateCondition(
  condition: TypedCondition,
  row: Readonly<Record<string, unknown>>,
): boolean {
  if (isLeaf(condition)) {
    return matchLeaf(condition, row);
  }
  if (condition.operator === "&") {
    return condition.conditions.every((c) => evaluateCondition(c, row));
  }
  if (condition.operator === "|") {
    return condition.conditions.some((c) => evaluateCondition(c, row));
  }
  return !evaluateCondition(condition.condition, row);
}

function matchLeaf(
  c: LeafCondition,
  row: Readonly<Record<string, unknown>>,
): boolean {
  const rowValue = row[c.field];

  switch (c.operator) {
    case "=":
      return coerceEqual(rowValue, c.value);
    case "!=":
      return !coerceEqual(rowValue, c.value);
    case ">":
      return coerceCompare(rowValue, c.value) > 0;
    case "<":
      return coerceCompare(rowValue, c.value) < 0;
    case ">=":
      return coerceCompare(rowValue, c.value) >= 0;
    case "<=":
      return coerceCompare(rowValue, c.value) <= 0;
    case "in":
      return (c.value as unknown[]).some((v) => coerceEqual(rowValue, v));
    case "not in":
      return !(c.value as unknown[]).some((v) => coerceEqual(rowValue, v));
    case "like":
    case "ilike": {
      if (rowValue == null) return false;
      // ponytail: simple substring; Odoo %_ wildcards deferred
      const pattern = String(c.value);
      const source = String(rowValue);
      if (c.operator === "ilike") {
        return source.toLowerCase().includes(pattern.toLowerCase());
      }
      return source.includes(pattern);
    }
  }
}

function coerceEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  return String(a) === String(b);
}

function coerceCompare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  // Numeric comparison when both are numbers (avoids lexicographic "1000" < "500")
  if (typeof a === "number" && typeof b === "number") {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }
  const sa = String(a);
  const sb = String(b);
  if (sa < sb) return -1;
  if (sa > sb) return 1;
  return 0;
}

// ── SQL WHERE Clause Generator ──────────────────────────────────────────────

/**
 * Generate a parameterized SQL WHERE clause from condition trees.
 *
 * @returns { sql, params } — SQL with $1, $2, ... placeholders
 */
export function generateWhereClause(
  conditions: readonly TypedCondition[],
  options: WhereClauseOptions = {},
): WhereClauseResult {
  const alias = options.tableAlias ? `${options.tableAlias}.` : "";
  const collector = new ParamCollector();
  const clauses: string[] = [];

  if (options.tenantId !== undefined) {
    const tfn = options.tenantFieldName ?? "tenant_id";
    validateField(tfn);
    clauses.push(`${alias}${tfn} = ${collector.add(options.tenantId)}`);
  }

  for (const cond of conditions) {
    clauses.push(compileCondition(cond, alias, collector));
  }

  const sql = clauses.length > 0 ? clauses.join(" AND ") : "TRUE";
  return { sql, params: collector.params() };
}

/** Accumulator for $1, $2, ... parameter numbering. */
class ParamCollector {
  private items: unknown[] = [];

  add(value: unknown): string {
    this.items.push(value);
    return `$${this.items.length}`;
  }

  params(): readonly unknown[] {
    return this.items;
  }
}

function compileCondition(
  condition: TypedCondition,
  alias: string,
  pc: ParamCollector,
): string {
  if (isLeaf(condition)) {
    return compileLeaf(condition, alias, pc);
  }
  if (condition.operator === "!") {
    return `NOT (${compileCondition(condition.condition, alias, pc)})`;
  }
  const joiner = condition.operator === "&" ? " AND " : " OR ";
  const parts = condition.conditions.map((c) => compileCondition(c, alias, pc));
  return `(${parts.join(joiner)})`;
}

function compileLeaf(
  c: LeafCondition,
  alias: string,
  pc: ParamCollector,
): string {
  const col = `${alias}${c.field}`;

  if (c.operator === "in") {
    const values = c.value as unknown[];
    const placeholders = values.map((v) => pc.add(v));
    return `${col} IN (${placeholders.join(", ")})`;
  }

  if (c.operator === "not in") {
    const values = c.value as unknown[];
    const placeholders = values.map((v) => pc.add(v));
    return `${col} NOT IN (${placeholders.join(", ")})`;
  }

  // ponytail: % wrapping for LIKE; Odoo %_ wildcards deferred
  if (c.operator === "like" || c.operator === "ilike") {
    return `${col} ${c.operator.toUpperCase()} ${pc.add(`%${String(c.value)}%`)}`;
  }

  return `${col} ${c.operator} ${pc.add(c.value)}`;
}
