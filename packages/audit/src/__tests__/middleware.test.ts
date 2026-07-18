import { describe, test, expect, vi } from "vitest";
import { auditCapture } from "../middleware";
import type { AuditLogFn } from "../middleware";

// ── Helpers ──────────────────────────────────────────────────────

interface MockRequest {
  method: string;
  url: string;
  body?: Record<string, unknown> | null;
  user?: { id: string; tenant_id: string } | null;
  headers: Record<string, string | undefined>;
  ip: string;
}

interface MockReply {
  statusCode: number;
}

function makeRequest(overrides: Partial<MockRequest> = {}): MockRequest {
  return {
    method: "GET",
    url: "/api/users",
    headers: {},
    ip: "127.0.0.1",
    ...overrides,
  };
}

function makeReply(overrides: Partial<MockReply> = {}): MockReply {
  return {
    statusCode: 200,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────

describe("auditCapture middleware", () => {
  test("GET request does not trigger audit", async () => {
    // Arrange
    const auditSpy = vi.fn();
    const hook = auditCapture(auditSpy as AuditLogFn);
    const req = makeRequest({ method: "GET", url: "/api/users" });
    const reply = makeReply();

    // Act
    await hook(req, reply);

    // Assert
    expect(auditSpy).not.toHaveBeenCalled();
  });

  test("POST request triggers audit", async () => {
    // Arrange
    const auditSpy = vi.fn();
    const hook = auditCapture(auditSpy as AuditLogFn);
    const req = makeRequest({
      method: "POST",
      url: "/api/users",
      body: { username: "newuser" },
      user: { id: "u-uuid", tenant_id: "t-uuid" },
      headers: { "user-agent": "test", "x-request-id": "req-1" },
      ip: "192.168.1.1",
    });
    const reply = makeReply();

    // Act
    await hook(req, reply);

    // Assert
    expect(auditSpy).toHaveBeenCalledTimes(1);
    const event = auditSpy.mock.calls[0]![0];
    expect(event).toMatchObject({
      action: "create",
      resource_type: "user",
      actor_id: "u-uuid",
      tenant_id: "t-uuid",
    });
  });

  test("PUT request triggers audit", async () => {
    // Arrange
    const auditSpy = vi.fn();
    const hook = auditCapture(auditSpy as AuditLogFn);
    const req = makeRequest({
      method: "PUT",
      url: "/api/users/uuid-1",
      body: { username: "updated" },
      user: { id: "u-uuid", tenant_id: "t-uuid" },
    });
    const reply = makeReply();

    // Act
    await hook(req, reply);

    // Assert
    expect(auditSpy).toHaveBeenCalledTimes(1);
  });

  test("DELETE request triggers audit", async () => {
    // Arrange
    const auditSpy = vi.fn();
    const hook = auditCapture(auditSpy as AuditLogFn);
    const req = makeRequest({
      method: "DELETE",
      url: "/api/users/uuid-1",
      user: { id: "u-uuid", tenant_id: "t-uuid" },
    });
    const reply = makeReply();

    // Act
    await hook(req, reply);

    // Assert
    expect(auditSpy).toHaveBeenCalledTimes(1);
  });

  test("PATCH request triggers audit", async () => {
    // Arrange
    const auditSpy = vi.fn();
    const hook = auditCapture(auditSpy as AuditLogFn);
    const req = makeRequest({
      method: "PATCH",
      url: "/api/users/uuid-1",
      body: { username: "patched" },
      user: { id: "u-uuid", tenant_id: "t-uuid" },
    });
    const reply = makeReply();

    // Act
    await hook(req, reply);

    // Assert
    expect(auditSpy).toHaveBeenCalledTimes(1);
  });

  test("non-2xx response does not trigger audit", async () => {
    // Arrange
    const auditSpy = vi.fn();
    const hook = auditCapture(auditSpy as AuditLogFn);
    const req = makeRequest({
      method: "POST",
      url: "/api/users",
      body: { username: "newuser" },
      user: { id: "u-uuid", tenant_id: "t-uuid" },
    });
    const reply = makeReply({ statusCode: 400 });

    // Act
    await hook(req, reply);

    // Assert
    expect(auditSpy).not.toHaveBeenCalled();
  });

  test("audit write failure does not throw", async () => {
    // Arrange
    const failingAudit: AuditLogFn = vi.fn().mockRejectedValue(new Error("DB timeout"));
    const hook = auditCapture(failingAudit);
    const req = makeRequest({
      method: "POST",
      url: "/api/users",
      body: { username: "newuser" },
      user: { id: "u-uuid", tenant_id: "t-uuid" },
    });
    const reply = makeReply();

    // Act & Assert — should not throw
    expect(() => hook(req as never, reply as never)).not.toThrow();
    expect(failingAudit).toHaveBeenCalled();
  });

  test("unauthenticated request gets actor_id null", async () => {
    // Arrange
    const auditSpy = vi.fn();
    const hook = auditCapture(auditSpy as AuditLogFn);
    const req = makeRequest({
      method: "POST",
      url: "/api/auth/login",
      body: { username: "admin", password: "xxx" },
      headers: { "x-request-id": "req-noauth" },
      ip: "127.0.0.1",
      user: undefined,
    });
    const reply = makeReply();

    // Act
    await hook(req, reply);

    // Assert
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({ actor_id: null }));
  });

  test("excludes health check endpoints", async () => {
    // Arrange
    const auditSpy = vi.fn();
    const hook = auditCapture(auditSpy as AuditLogFn);
    const req = makeRequest({
      method: "POST",
      url: "/api/health",
      body: {},
      user: { id: "u-uuid", tenant_id: "t-uuid" },
    });
    const reply = makeReply();

    // Act
    await hook(req, reply);

    // Assert
    expect(auditSpy).not.toHaveBeenCalled();
  });

  test("excludes audit-logs endpoint", async () => {
    // Arrange
    const auditSpy = vi.fn();
    const hook = auditCapture(auditSpy as AuditLogFn);
    const req = makeRequest({
      method: "GET",
      url: "/api/audit-logs",
      user: { id: "u-uuid", tenant_id: "t-uuid" },
    });
    const reply = makeReply();

    // Act
    await hook(req, reply);

    // Assert
    expect(auditSpy).not.toHaveBeenCalled();
  });

  test("custom exclude paths", async () => {
    // Arrange
    const auditSpy = vi.fn();
    const hook = auditCapture(auditSpy as AuditLogFn, {
      excludePaths: ["/api/internal"],
    });
    const req = makeRequest({
      method: "POST",
      url: "/api/internal/sync",
      body: {},
      user: { id: "u-uuid", tenant_id: "t-uuid" },
    });
    const reply = makeReply();

    // Act
    await hook(req, reply);

    // Assert
    expect(auditSpy).not.toHaveBeenCalled();
  });

  test("3xx response does not trigger audit", async () => {
    // Arrange
    const auditSpy = vi.fn();
    const hook = auditCapture(auditSpy as AuditLogFn);
    const req = makeRequest({
      method: "POST",
      url: "/api/users",
      body: {},
      user: { id: "u-uuid", tenant_id: "t-uuid" },
    });
    const reply = makeReply({ statusCode: 302 });

    // Act
    await hook(req, reply);

    // Assert
    expect(auditSpy).not.toHaveBeenCalled();
  });
});
