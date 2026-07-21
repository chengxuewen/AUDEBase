/**
 * Domain Filter → Sequelize WHERE converter
 *
 * Converts Odoo-style Poland-notation domain filters (D10) into
 * Sequelize-compatible WHERE objects for NocoBase query injection.
 *
 * Domain Filter Syntax:
 *   ["&", condA, condB]  →  AND
 *   ["|", condA, condB]  →  OR
 *   ["!", cond]          →  NOT
 *   ["field", "op", val] →  comparison leaf
 *
 * Operators: = != > < >= <= in 'not in' like ilike
 */

import { Op } from "sequelize";

// ── Types ──────────────────────────────────────────────────────────────

export type ComparisonOperator =
  | "=" | "!=" | ">" | "<" | ">=" | "<="
  | "in" | "not in"
  | "like" | "ilike";

export interface LeafCondition {
  readonly field: string;
  readonly operator: ComparisonOperator;
  readonly value: unknown;
}

export interface AndCondition {
  readonly operator: "&";
  readonly conditions: readonly TypedCondition[];
}

export interface OrCondition {
  readonly operator: "|";
  readonly conditions: readonly TypedCondition[];
}

export interface NotCondition {
  readonly operator: "!";
  readonly condition: TypedCondition;
}

export type TypedCondition = LeafCondition | AndCondition | OrCondition | NotCondition;
export type DomainFilterTuple = readonly unknown[];

/**
 * NocoBase ACL filter shape — Sequelize WHERE clause.
 * Supports nested { [Op.and]: [...] } etc.
 */
export type SequelizeFilter = Record<string, unknown>;

// ── Context for variable substitution ──────────────────────────────────

export interface FilterContext {
  /** Current user ID — replaces $user.id in domain filters */
  userId?: string | number;
  /** Current tenant ID */
  tenantId?: string | number;
  /** Arbitrary context variables for $ctx.key substitution */
  ctx?: Record<string, unknown>;
}

// ── Constants ──────────────────────────────────────────────────────────

const VALID_OPERATORS = new Set<string>([
  "=", "!=", ">", "<", ">=", "<=", "in", "not in", "like", "ilike",
]);

// ── Parser ─────────────────────────────────────────────────────────────

export class DomainFilterError extends Error {
  constructor(message: string) {
    super(`[DomainFilter] ${message}`);
    this.name = "DomainFilterError";
  }
}

function validateField(field: unknown): string {
  if (typeof field !== "string" || field.length === 0) {
    throw new DomainFilterError(`Field must be a non-empty string, got ${JSON.stringify(field)}.`);
  }
  if (!/^[a-zA-Z_]\w*$/.test(field)) {
    throw new DomainFilterError(`Invalid field name: "${field}".`);
  }
  return field;
}

function validateOperator(op: unknown): ComparisonOperator {
  if (typeof op !== "string" || !VALID_OPERATORS.has(op)) {
    throw new DomainFilterError(
      `Invalid operator: ${JSON.stringify(op)}. Must be one of ${[...VALID_OPERATORS].join(", ")}.`,
    );
  }
  return op as ComparisonOperator;
}

function validateValueForOperator(op: ComparisonOperator, value: unknown): void {
  if ((op === "in" || op === "not in") && !Array.isArray(value)) {
    throw new DomainFilterError(`Operator "${op}" requires an array value.`);
  }
}

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
      throw new DomainFilterError(`"&" requires at least 2 conditions, got ${children.length}.`);
    }
    return {
      operator: "&",
      conditions: children.map((c) => parseDomainFilter(c as DomainFilterTuple)),
    };
  }

  if (first === "|") {
    const children = filter.slice(1);
    if (children.length < 2) {
      throw new DomainFilterError(`"|" requires at least 2 conditions, got ${children.length}.`);
    }
    return {
      operator: "|",
      conditions: children.map((c) => parseDomainFilter(c as DomainFilterTuple)),
    };
  }

  if (first === "!") {
    const children = filter.slice(1);
    if (children.length !== 1) {
      throw new DomainFilterError(`"!" requires exactly 1 condition, got ${children.length}.`);
    }
    return {
      operator: "!",
      condition: parseDomainFilter(children[0] as DomainFilterTuple),
    };
  }

  // Leaf: [field, operator, value]
  if (filter.length !== 3) {
    throw new DomainFilterError(
      `Leaf condition must have 3 elements [field, op, value], got ${filter.length}.`,
    );
  }

  const field = validateField(filter[0]);
  const operator = validateOperator(filter[1]);
  const value = filter[2];
  validateValueForOperator(operator, value);

  return { field, operator, value };
}

// ── Variable Substitution ──────────────────────────────────────────────

/**
 * Substitute $user.id, $ctx.* variables in a leaf condition value.
 */
function substituteValue(value: unknown, ctx: FilterContext): unknown {
  if (value === "$user.id") {
    if (ctx.userId == null) {
      throw new DomainFilterError("$user.id used but no userId in context.");
    }
    return ctx.userId;
  }
  if (typeof value === "string" && value.startsWith("$ctx.")) {
    const key = value.slice(5);
    if (!ctx.ctx || !(key in ctx.ctx)) {
      throw new DomainFilterError(`$ctx.${key} used but not found in context.`);
    }
    return ctx.ctx[key];
  }
  return value;
}

// ── Sequelize WHERE Converter ──────────────────────────────────────────

const OP_MAP: Record<string, symbol> = {
  "=": Op.eq,
  "!=": Op.ne,
  ">": Op.gt,
  "<": Op.lt,
  ">=": Op.gte,
  "<=": Op.lte,
  "in": Op.in,
  "not in": Op.notIn,
  "like": Op.like,
  "ilike": Op.iLike,
};

/**
 * Convert a parsed condition tree to a Sequelize WHERE object.
 *
 * Example:
 *   parseDomainFilter(["&", ["status","=","draft"], ["amount",">",1000]])
 *   → condition tree
 *   conditionToSequelize(tree, {}) → { [Op.and]: [{ status: 'draft' }, { amount: { [Op.gt]: 1000 } }] }
 */
export function conditionToSequelize(
  condition: TypedCondition,
  ctx: FilterContext = {},
): SequelizeFilter {
  if (isLeaf(condition)) {
    const value = substituteValue(condition.value, ctx);
    const op = OP_MAP[condition.operator];
    return { [condition.field]: op ? { [op]: value } : value };
  }

  if (condition.operator === "!") {
    return { [Op.not]: conditionToSequelize(condition.condition, ctx) };
  }

  const joiner = condition.operator === "&" ? Op.and : Op.or;
  // Flatten single-child AND/OR to avoid unnecessary nesting
  const children = condition.conditions.map((c) => conditionToSequelize(c, ctx));
  return { [joiner]: children.length === 1 ? children[0] : children };
}

/**
 * Parse a domain filter tuple directly to a Sequelize WHERE object.
 * This is the main entry point used by the ACL middleware.
 */
export function domainFilterToSequelize(
  filter: DomainFilterTuple,
  ctx: FilterContext = {},
): SequelizeFilter {
  const tree = parseDomainFilter(filter);
  return conditionToSequelize(tree, ctx);
}

// ── Helpers ────────────────────────────────────────────────────────────

function isLeaf(c: TypedCondition): c is LeafCondition {
  return "field" in c;
}
