import { describe, test, expect, beforeEach, vi } from "vitest";
import {
  AuditService,
  sanitizeValues,
  mapMethodToAction,
  extractResourceType,
  extractResourceId,
} from "../service";
import type { AuditEvent } from "../types";

// ── Factories ────────────────────────────────────────────────────

function createMockDb() {
  const insert = vi.fn().mockResolvedValue(undefined);
  const findMany = vi.fn().mockResolvedValue([]);
  const deleteFn = vi.fn().mockResolvedValue(0);

  return {
    insert,
    query: { audit_log: { findMany } },
    delete: deleteFn,
  };
}

function makeEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    tenant_id: "t-uuid",
    actor_id: "u-uuid",
    action: "create",
    resource_type: "user",
    resource_id: "r-uuid",
    new_values: { username: "newuser", is_active: true },
    ip: "192.168.1.1",
    user_agent: "test-agent",
    request_id: "req-123",
    ...overrides,
  };
}

// ── sanitizeValues ───────────────────────────────────────────────

describe("sanitizeValues", () => {
  test("redacts default sensitive fields", () => {
    // Arrange
    const input = { username: "alice", password: "secret", token: "abc" };

    // Act
    const result = sanitizeValues(input);

    // Assert
    expect(result.username).toBe("alice");
    expect(result.password).toBe("[REDACTED]");
    expect(result.token).toBe("[REDACTED]");
  });

  test("returns new object — does not mutate input", () => {
    // Arrange
    const input = { password: "secret" };

    // Act
    const result = sanitizeValues(input);

    // Assert
    expect(result).not.toBe(input);
    expect(input.password).toBe("secret");
  });

  test("handles empty object", () => {
    // Arrange
    const input: Record<string, unknown> = {};

    // Act
    const result = sanitizeValues(input);

    // Assert
    expect(Object.keys(result)).toHaveLength(0);
  });

  test("respects custom sensitive fields", () => {
    // Arrange
    const input = { ssn: "123-45-6789", name: "bob" };

    // Act
    const result = sanitizeValues(input, ["ssn"]);

    // Assert
    expect(result.ssn).toBe("[REDACTED]");
    expect(result.name).toBe("bob");
  });
});

// ── mapMethodToAction ────────────────────────────────────────────

describe("mapMethodToAction", () => {
  test("POST → create", () => {
    expect(mapMethodToAction("POST")).toBe("create");
  });

  test("PUT → update", () => {
    expect(mapMethodToAction("PUT")).toBe("update");
  });

  test("PATCH → update", () => {
    expect(mapMethodToAction("PATCH")).toBe("update");
  });

  test("DELETE → delete", () => {
    expect(mapMethodToAction("DELETE")).toBe("delete");
  });

  test("GET falls back to lowercase", () => {
    expect(mapMethodToAction("GET")).toBe("get");
  });
});

// ── extractResourceType ──────────────────────────────────────────

describe("extractResourceType", () => {
  test("/api/users → user", () => {
    expect(extractResourceType("/api/users")).toBe("user");
  });

  test("/api/roles → role", () => {
    expect(extractResourceType("/api/roles")).toBe("role");
  });

  test("/api/health → health", () => {
    expect(extractResourceType("/api/health")).toBe("health");
  });

  test("non-matching path → unknown", () => {
    expect(extractResourceType("/other/path")).toBe("unknown");
  });
});

// ── extractResourceId ────────────────────────────────────────────

describe("extractResourceId", () => {
  test("/api/users/uuid-1 → uuid-1", () => {
    expect(extractResourceId("/api/users/uuid-1")).toBe("uuid-1");
  });

  test("/api/roles/r-123 → r-123", () => {
    expect(extractResourceId("/api/roles/r-123")).toBe("r-123");
  });

  test("no resource id → null", () => {
    expect(extractResourceId("/api/users")).toBeNull();
  });
});

// ── AuditService.log ─────────────────────────────────────────────

describe("AuditService.log", () => {
  let service: AuditService;
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    service = new AuditService(db);
  });

  test("inserts audit event into audit_log", async () => {
    // Arrange
    const event = makeEvent();

    // Act
    await service.log(event);

    // Assert
    expect(db.insert).toHaveBeenCalledTimes(1);
    const inserted = db.insert.mock.calls[0]!;
    expect(inserted[0]).toBe("audit_log");
    expect(inserted[1]).toMatchObject({
      tenant_id: "t-uuid",
      actor_id: "u-uuid",
      action: "create",
      resource_type: "user",
    });
  });

  test("record with old_values + new_values", async () => {
    // Arrange
    const event = makeEvent({
      action: "update",
      old_values: { username: "oldname" },
      new_values: { username: "newname" },
    });

    // Act
    await service.log(event);

    // Assert
    expect(db.insert).toHaveBeenCalled();
    const inserted = db.insert.mock.calls[0]![1] as Record<string, unknown>;
    expect(inserted.old_values).toEqual({ username: "oldname" });
    expect(inserted.new_values).toEqual({ username: "newname" });
  });

  test("delete operation has new_values as null", async () => {
    // Arrange
    const event = makeEvent({
      action: "delete",
      old_values: { username: "deleteduser", is_active: true },
      new_values: null,
    });

    // Act
    await service.log(event);

    // Assert
    expect(db.insert).toHaveBeenCalled();
  });

  test("system operation with actor_id null", async () => {
    // Arrange
    const event = makeEvent({
      actor_id: null,
      action: "system:startup",
      resource_type: "system",
      resource_id: null,
    });

    // Act
    await service.log(event);

    // Assert
    expect(db.insert).toHaveBeenCalled();
    const inserted = db.insert.mock.calls[0]![1] as Record<string, unknown>;
    expect(inserted.actor_id).toBeNull();
  });

  test("RBAC actions are all recorded", async () => {
    // Arrange
    const rbacActions = [
      "rbac:assign_role",
      "rbac:revoke_role",
      "rbac:create_role",
      "rbac:delete_role",
    ];

    // Act
    for (const action of rbacActions) {
      await service.log(makeEvent({ action, resource_type: "role", resource_id: "role-uuid" }));
    }

    // Assert
    expect(db.insert).toHaveBeenCalledTimes(rbacActions.length);
  });

  test("does not throw when DB insert fails", async () => {
    // Arrange
    db.insert.mockRejectedValueOnce(new Error("DB timeout"));
    const event = makeEvent();

    // Act & Assert — should not throw
    await expect(service.log(event)).resolves.toBeUndefined();
  });
});

// ── AuditService.query ──────────────────────────────────────────

describe("AuditService.query", () => {
  let service: AuditService;
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    service = new AuditService(db);
  });

  test("returns empty list when no records", async () => {
    // Arrange
    db.query.audit_log.findMany.mockResolvedValue([]);

    // Act
    const result = await service.query({});

    // Assert
    expect(result.data).toHaveLength(0);
    expect(result.meta.count).toBe(0);
  });

  test("returns data with correct shape", async () => {
    // Arrange
    const row = {
      id: "a1",
      tenant_id: "t-uuid",
      actor_id: "u-uuid",
      action: "create",
      resource_type: "user",
      resource_id: "r-uuid",
      old_values: null,
      new_values: { username: "alice" },
      ip: "192.168.1.1",
      user_agent: "test",
      request_id: "req-1",
      created_at: "2026-01-01T00:00:00Z",
      actor: null,
    };
    db.query.audit_log.findMany.mockResolvedValue([row]);

    // Act
    const result = await service.query({});

    // Assert
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.id).toBe("a1");
    expect(result.data[0]!.action).toBe("create");
    expect(result.meta.page).toBe(1);
    expect(result.meta.pageSize).toBe(20);
  });

  test("applies tenant_id filter", async () => {
    // Arrange
    db.query.audit_log.findMany.mockResolvedValue([]);

    // Act
    await service.query({ tenant_id: "tenant-A" });

    // Assert
    const opts = db.query.audit_log.findMany.mock.calls[0]![0];
    expect(opts.where?.tenant_id).toBe("tenant-A");
  });

  test("applies pagination", async () => {
    // Arrange
    db.query.audit_log.findMany.mockResolvedValue([]);

    // Act
    await service.query({ page: 2, pageSize: 10 });

    // Assert
    const opts = db.query.audit_log.findMany.mock.calls[0]![0];
    expect(opts.limit).toBe(10);
    expect(opts.offset).toBe(10); // (2-1)*10
  });

  test("respects max pageSize of 100", async () => {
    // Arrange
    db.query.audit_log.findMany.mockResolvedValue([]);

    // Act
    await service.query({ pageSize: 200 });

    // Assert
    const opts = db.query.audit_log.findMany.mock.calls[0]![0];
    expect(opts.limit).toBe(100);
  });

  test("default page is 1, pageSize is 20", async () => {
    // Arrange
    db.query.audit_log.findMany.mockResolvedValue([]);

    // Act
    await service.query({});

    // Assert
    const opts = db.query.audit_log.findMany.mock.calls[0]![0];
    expect(opts.limit).toBe(20);
    expect(opts.offset).toBe(0);
  });
});

// ── AuditService.purge ──────────────────────────────────────────

describe("AuditService.purge", () => {
  let service: AuditService;
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    service = new AuditService(db);
  });

  test("purges records before given date", async () => {
    // Arrange
    db.delete.mockResolvedValue(5);
    const beforeDate = new Date("2026-01-01");

    // Act
    const count = await service.purge(beforeDate);

    // Assert
    expect(count).toBe(5);
    expect(db.delete).toHaveBeenCalledWith("audit_log", {
      created_at: { $lt: beforeDate.toISOString() },
    });
  });

  test("returns 0 when delete fails", async () => {
    // Arrange
    db.delete.mockRejectedValue(new Error("DB error"));
    const beforeDate = new Date("2026-01-01");

    // Act
    const count = await service.purge(beforeDate);

    // Assert
    expect(count).toBe(0);
  });
});
