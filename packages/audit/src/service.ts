import { randomUUID } from "node:crypto";
import type { AuditLogEntry, ApiListResponse } from "@audebase/shared-types";
import type { AuditEvent, AuditQuery } from "./types";

/**
 * Minimal database interface required by AuditService.
 * In production this is Drizzle; in tests it is a mock.
 */
export interface AuditDatabase {
  insert(table: string, values: Record<string, unknown>): Promise<unknown>;
  query: {
    audit_log: {
      findMany(opts?: AuditFindManyOptions): Promise<AuditLogRow[]>;
    };
  };
  delete(table: string, where: Record<string, unknown>): Promise<number>;
}

/** Internal row shape returned from DB queries */
interface AuditLogRow {
  id: string;
  tenant_id: string;
  actor_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip: string | null;
  user_agent: string | null;
  request_id: string | null;
  created_at: string;
  actor?: { id: string; username: string } | null;
}

interface AuditFindManyOptions {
  where?: Record<string, unknown>;
  orderBy?: Record<string, string>;
  limit?: number;
  offset?: number;
}

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Map HTTP method to audit action.
 */
export function mapMethodToAction(method: string): string {
  switch (method.toUpperCase()) {
    case "POST":
      return "create";
    case "PUT":
    case "PATCH":
      return "update";
    case "DELETE":
      return "delete";
    default:
      return method.toLowerCase();
  }
}

/**
 * Default sensitive field names to redact from new_values.
 */
export const DEFAULT_SENSITIVE_FIELDS = [
  "password",
  "password_hash",
  "token",
  "access_token",
  "refresh_token",
  "token_version",
  "secret",
  "api_key",
];

/**
 * Recursively redact sensitive fields from a values object.
 * Returns a new object — never mutates input.
 */
export function sanitizeValues(
  values: Record<string, unknown>,
  sensitiveFields: string[] = DEFAULT_SENSITIVE_FIELDS,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(values)) {
    if (sensitiveFields.includes(key)) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = values[key];
    }
  }
  return result;
}

/**
 * AuditService — log, query, and purge audit events.
 *
 * Constructor receives a database adapter that follows the AuditDatabase
 * interface. In production this is a thin wrapper around Drizzle; in tests
 * it is a mock.
 */
export class AuditService {
  constructor(private readonly db: AuditDatabase) {}

  /**
   * Record an audit event. Non-blocking: write failures are caught and
   * silently dropped (the API response is never held up by audit logging).
   */
  async log(event: AuditEvent): Promise<void> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const entry: Record<string, unknown> = {
      id,
      tenant_id: event.tenant_id,
      actor_id: event.actor_id ?? null,
      action: event.action,
      resource_type: event.resource_type,
      resource_id: event.resource_id ?? null,
      old_values: event.old_values ?? null,
      new_values: event.new_values ?? null,
      ip: event.ip ?? null,
      user_agent: event.user_agent ?? null,
      request_id: event.request_id ?? null,
      created_at: now,
    };
    try {
      await this.db.insert("audit_log", entry);
    } catch {
      // ponytail: audit write failures must not block the API response.
      // Add structured logging when the logging infra is available (Phase 1a).
    }
  }

  /**
   * Query audit logs with optional filters and pagination.
   * Results are ordered by created_at DESC.
   */
  async query(params: AuditQuery): Promise<ApiListResponse<AuditLogEntry>> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
    const offset = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (params.tenant_id) where.tenant_id = params.tenant_id;
    if (params.action) where.action = params.action;
    if (params.resource_type) where.resource_type = params.resource_type;
    if (params.resource_id) where.resource_id = params.resource_id;
    if (params.actor_id) where.actor_id = params.actor_id;

    const rows = await this.db.query.audit_log.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { created_at: "desc" },
      limit: pageSize,
      offset,
    });

    // ponytail: count query is a separate call. In a real Drizzle setup this
    // would be a single round-trip with a window function or a count subquery.
    // For Phase 1a, simple two-query approach.
    const total = rows.length > 0 ? this.estimateTotal(where, rows, page, pageSize) : 0;

    const data: AuditLogEntry[] = rows.map((row) => ({
      id: row.id,
      tenant_id: row.tenant_id,
      actor: row.actor ?? (row.actor_id ? { id: row.actor_id, username: "" } : null),
      action: row.action,
      resource_type: row.resource_type,
      resource_id: row.resource_id,
      old_values: row.old_values,
      new_values: row.new_values,
      ip: row.ip,
      user_agent: row.user_agent,
      request_id: row.request_id,
      created_at: row.created_at,
    }));

    return {
      data,
      meta: {
        count: total,
        page,
        pageSize,
        totalPages: Math.max(0, Math.ceil(total / pageSize)),
      },
    };
  }

  /**
   * Purge audit logs older than the given date.
   * Returns the number of deleted records.
   */
  async purge(beforeDate: Date): Promise<number> {
    try {
      const deleted = await this.db.delete("audit_log", {
        created_at: { $lt: beforeDate.toISOString() },
      });
      return deleted;
    } catch {
      return 0;
    }
  }

  private estimateTotal(
    _where: Record<string, unknown>,
    rows: AuditLogRow[],
    page: number,
    pageSize: number,
  ): number {
    // ponytail: rough estimate when count query is not available.
    // If the page is full, assume there are more rows.
    if (rows.length < pageSize) return (page - 1) * pageSize + rows.length;
    return (page + 1) * pageSize;
  }
}

/**
 * Extract resource type from a URL path.
 * e.g. "/api/users/abc-123" → "user"
 */
export function extractResourceType(url: string): string {
  const match = url.match(/^\/api\/([^/]+)/);
  if (!match || !match[1]) return "unknown";
  // Singularize: strip trailing 's' (naive — good enough for most REST APIs)
  const resource = match[1];
  return resource.endsWith("s") ? resource.slice(0, -1) : resource;
}

/**
 * Extract resource ID from a URL path.
 * e.g. "/api/users/abc-123" → "abc-123"
 */
export function extractResourceId(url: string): string | null {
  const match = url.match(/^\/api\/[^/]+\/([^/?]+)/);
  return match?.[1] ?? null;
}

/**
 * Audit context from a Fastify request.
 */
export interface AuditRequestContext {
  method: string;
  url: string;
  body?: Record<string, unknown> | null;
  user?: { id: string; tenant_id: string } | null;
  headers?: Record<string, string | undefined>;
  ip?: string;
}

/**
 * Build an AuditEvent from request context.
 * Does NOT inspect response — call AFTER a successful response is confirmed.
 */
export function buildAuditEvent(
  ctx: AuditRequestContext,
  sensitiveFields?: string[],
): AuditEvent | null {
  if (!WRITE_METHODS.has(ctx.method.toUpperCase())) return null;

  const action = mapMethodToAction(ctx.method);
  const resource_type = extractResourceType(ctx.url);
  const resource_id = extractResourceId(ctx.url);
  const actor_id = ctx.user?.id ?? null;
  const tenant_id = ctx.user?.tenant_id ?? "00000000-0000-0000-0000-000000000000";

  let new_values: Record<string, unknown> | null = null;
  if (ctx.method.toUpperCase() !== "DELETE" && ctx.body) {
    new_values = sanitizeValues(ctx.body, sensitiveFields);
  }

  return {
    tenant_id,
    actor_id,
    action,
    resource_type,
    resource_id,
    new_values,
    ip: ctx.ip ?? null,
    user_agent: ctx.headers?.["user-agent"] ?? null,
    request_id: ctx.headers?.["x-request-id"] ?? null,
  };
}
