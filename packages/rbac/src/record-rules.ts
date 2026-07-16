/**
 * Record Rules - Domain Filter (Poland Notation) parsing and evaluation
 *
 * Implements D10 Record Rules with Poland notation (prefix expression) array syntax.
 *
 * @audebase/rbac
 */

import type { TenantContext } from './types.js'

/** AST node for parsed domain filter */
export interface DomainFilterAST {
  type: 'operator' | 'condition'
  operator?: string
  field?: string
  value?: unknown
  children?: DomainFilterAST[]
}

const LOGICAL_OPERATORS = new Set(['&', '|', '!'])
const COMPARISON_OPERATORS = new Set([
  '=', '!=', '>', '<', '>=', '<=',
  'in', 'not in', 'like', 'ilike',
])

/**
 * Parse a Poland notation domain filter array into an AST.
 *
 * @returns AST root node, or null for empty filter
 * @throws Error on invalid filter structure or unknown operator
 */
export function parseDomainFilter(filter: unknown): DomainFilterAST | null {
  if (!Array.isArray(filter) || filter.length === 0) {
    return null
  }

  return parseNode(filter as unknown[])
}

function parseNode(filter: unknown[]): DomainFilterAST {
  const first = filter[0]

  // Logical operator: & (AND), | (OR), ! (NOT)
  if (typeof first === 'string' && LOGICAL_OPERATORS.has(first)) {
    const operator = first
    const childCount = operator === '!' ? 1 : 2
    const children: DomainFilterAST[] = []

    for (let i = 1; i <= childCount; i++) {
      const child = filter[i]
      if (!Array.isArray(child)) {
        throw new Error(`Expected array at position ${i} for operator "${operator}"`)
      }
      children.push(parseNode(child as unknown[]))
    }

    return {
      type: 'operator',
      operator,
      children,
    }
  }

  // Comparison condition: [field, operator, value]
  if (typeof first === 'string') {
    const field = first
    const operator = filter[1]
    const value = filter[2]

    if (typeof operator !== 'string' || !COMPARISON_OPERATORS.has(operator)) {
      throw new Error(`Unknown operator: ${String(operator)}`)
    }

    return {
      type: 'condition',
      operator,
      field,
      value,
    }
  }

  throw new Error(`Invalid domain filter node: ${String(first)}`)
}

/**
 * Apply a record rule (parsed AST) to a query object.
 * Adds tenant_id and record rule conditions to query.where.
 *
 * @param query - Mutable query object with `where` property
 * @param tenantId - Tenant ID to inject (null = system-level, no tenant filter)
 * @param recordRule - Raw domain filter array or parsed AST (null = no rule)
 * @returns The same query object with conditions added
 */
export function applyRecordRule(
  query: Record<string, unknown>,
  tenantId: string | null,
  recordRule: unknown[] | DomainFilterAST | null,
): Record<string, unknown> {
  const where = (query.where ?? {}) as Record<string, unknown>

  if (tenantId !== null) {
    where.tenant_id = tenantId
  }

  if (recordRule !== null) {
    const ast = Array.isArray(recordRule)
      ? parseDomainFilter(recordRule)
      : recordRule
    if (ast !== null) {
      applyAstToWhere(ast, where)
    }
  }

  return { ...query, where }
}

/**
 * Inject tenant_id filter from JWT context into a query.
 * Overwrites any client-supplied tenant_id (D10 security: tenant_id from JWT only).
 */
export function injectTenantFilter(
  query: Record<string, unknown>,
  context: TenantContext,
): Record<string, unknown> {
  const where = (query.where ?? {}) as Record<string, unknown>

  if (context.tenant_id !== null) {
    where.tenant_id = context.tenant_id
  }

  return { ...query, where }
}

// --- Helpers ---

function applyAstToWhere(ast: DomainFilterAST, where: Record<string, unknown>): void {
  if (ast.type === 'condition' && ast.field !== undefined && ast.value !== undefined) {
    where[ast.field] = ast.value
  } else if (ast.type === 'operator' && ast.children) {
    for (const child of ast.children) {
      applyAstToWhere(child, where)
    }
  }
}
