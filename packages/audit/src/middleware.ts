import type { AuditEvent } from "./types";
import { buildAuditEvent, type AuditRequestContext } from "./service";

/**
 * Options for auditCapture middleware.
 */
export interface AuditCaptureOptions {
  /**
   * URL path prefixes to exclude from audit capture.
   * Default: ["/api/health", "/api/audit-logs"]
   */
  excludePaths?: string[];
  /**
   * Additional sensitive field names to redact from new_values.
   * Merged with the default list.
   */
  sensitiveFields?: string[];
}

const DEFAULT_EXCLUDE_PATHS = ["/api/health", "/api/audit-logs"];

/**
 * Minimal interface for the callback that writes audit events.
 */
export type AuditLogFn = (event: AuditEvent) => Promise<void>;

/**
 * Create a Fastify onResponse hook that captures audit events for
 * successful write operations (POST/PUT/PATCH/DELETE returning 2xx).
 *
 * The hook fires AFTER the response is sent, so audit capture is truly
 * non-blocking — the client already received the response.
 *
 * Usage:
 *   import { auditCapture } from "@audebase/audit";
 *   fastify.addHook("onResponse", auditCapture(auditService.log.bind(auditService)));
 */
export function auditCapture(auditLog: AuditLogFn, options: AuditCaptureOptions = {}) {
  const excludePaths = options.excludePaths ?? DEFAULT_EXCLUDE_PATHS;

  return function onResponseAudit(
    request: {
      method: string;
      url: string;
      body?: unknown;
      user?: unknown;
      headers: Record<string, string | undefined>;
      ip: string;
    },
    reply: { statusCode: number },
  ): Promise<void> {
    const writeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
    if (!writeMethods.has(request.method)) return;
    if (reply.statusCode < 200 || reply.statusCode >= 300) return;
    if (excludePaths.some((prefix) => request.url.startsWith(prefix))) return;

    const ctx: AuditRequestContext = {
      method: request.method,
      url: request.url,
      body: request.body as Record<string, unknown> | undefined | null,
      user: request.user as { id: string; tenant_id: string } | undefined | null,
      headers: request.headers,
      ip: request.ip,
    };

    const event = buildAuditEvent(ctx, options.sensitiveFields);
    if (event) {
      // ponytail: Promise.resolve handles both real Promises and mock returns
      Promise.resolve(auditLog(event)).catch(() => {});
    }
  };
}
