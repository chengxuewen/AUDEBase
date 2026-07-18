// === Types ===
export type { AuditEvent, AuditQuery, PurgeResult } from "./types";

// === Service ===
export {
  AuditService,
  mapMethodToAction,
  sanitizeValues,
  extractResourceType,
  extractResourceId,
  buildAuditEvent,
  DEFAULT_SENSITIVE_FIELDS,
} from "./service";
export type { AuditDatabase, AuditRequestContext } from "./service";

// === Middleware ===
export { auditCapture } from "./middleware";
export type { AuditCaptureOptions, AuditLogFn } from "./middleware";
