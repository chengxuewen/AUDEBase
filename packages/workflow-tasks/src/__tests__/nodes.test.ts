import { describe, test, expect, vi } from "vitest";
import type { NotificationProvider, NotificationService } from "@audebase/notification";
import {
  createApprovalNode,
  createConditionNode,
  createNotificationNode,
  createScriptNode,
  createTaskNode,
} from "../nodes";
import type { NodeHandler, WorkflowContext } from "../types";

// ── Helpers ─────────────────────────────────────────────────────────

function makeContext(overrides: Partial<WorkflowContext> = {}): WorkflowContext {
  return {
    instanceId: "inst-1",
    nodeId: "node-1",
    data: {},
    variables: {},
    ...overrides,
  };
}

function makeMockNotificationProvider(): NotificationProvider {
  return {
    send: vi.fn().mockResolvedValue(undefined),
    getChannels: () => ["email"],
  };
}

// ── Approval Node ───────────────────────────────────────────────────

describe("createApprovalNode", () => {
  test("creates approval task with default assignee when no data assignee", async () => {
    // Arrange
    const handler = createApprovalNode();
    const ctx = makeContext();

    // Act
    const result = await handler.execute(ctx);

    // Assert
    expect(result.success).toBe(true);
    expect(result.assignee).toBe("admin");
    expect(result.data).toMatchObject({
      taskType: "approval",
      status: "pending",
    });
    expect(result.data?.createdAt).toBeTypeOf("string");
  });

  test("uses data.assignee when provided", async () => {
    // Arrange
    const handler = createApprovalNode();
    const ctx = makeContext({ data: { assignee: "bob" } });

    // Act
    const result = await handler.execute(ctx);

    // Assert
    expect(result.success).toBe(true);
    expect(result.assignee).toBe("bob");
  });

  test("uses config defaultAssignee when no data assignee", async () => {
    // Arrange
    const handler = createApprovalNode({ defaultAssignee: "alice" });
    const ctx = makeContext();

    // Act
    const result = await handler.execute(ctx);

    // Assert
    expect(result.success).toBe(true);
    expect(result.assignee).toBe("alice");
  });
});

// ── Task Node ───────────────────────────────────────────────────────

describe("createTaskNode", () => {
  test("completes task and records completion timestamp", async () => {
    // Arrange
    const handler = createTaskNode();
    const ctx = makeContext({ data: { title: "Review document" } });

    // Act
    const result = await handler.execute(ctx);

    // Assert
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      taskType: "task",
      status: "completed",
      title: "Review document",
    });
    expect(result.data?.completedAt).toBeTypeOf("string");
  });

  test("works with empty context", async () => {
    // Arrange
    const handler = createTaskNode();
    const ctx = makeContext();

    // Act
    const result = await handler.execute(ctx);

    // Assert
    expect(result.success).toBe(true);
    expect(result.data?.taskType).toBe("task");
  });
});

// ── Notification Node ───────────────────────────────────────────────

describe("createNotificationNode", () => {
  test("calls provider.send with correct arguments", async () => {
    // Arrange
    const provider = makeMockNotificationProvider();
    const handler = createNotificationNode(provider, {
      channel: "email",
      template: "order-shipped",
    });
    const ctx = makeContext({
      variables: { orderId: "ORD-42", userId: "user-1" },
      data: { trackingNumber: "ZXY-99" },
    });

    // Act
    const result = await handler.execute(ctx);

    // Assert
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect(provider.send).toHaveBeenCalledWith(
      "user-1",
      "order-shipped",
      expect.objectContaining({
        orderId: "ORD-42",
        trackingNumber: "ZXY-99",
        channel: "email",
      }),
    );
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      channel: "email",
      recipient: "user-1",
      template: "order-shipped",
    });
    expect(result.data?.sentAt).toBeTypeOf("string");
  });

  test("falls back to config.recipient when variables.userId is absent", async () => {
    // Arrange
    const provider = makeMockNotificationProvider();
    const handler = createNotificationNode(provider, {
      channel: "sms",
      template: "reminder",
      recipient: "555-0199",
    });
    const ctx = makeContext();

    // Act
    const result = await handler.execute(ctx);

    // Assert
    expect(provider.send).toHaveBeenCalledWith(
      "555-0199",
      "reminder",
      expect.objectContaining({ channel: "sms" }),
    );
    expect(result.data?.recipient).toBe("555-0199");
  });
});

// ── Script Node ─────────────────────────────────────────────────────

describe("createScriptNode", () => {
  test("executes the provided script function", async () => {
    // Arrange
    const scriptFn = vi.fn().mockResolvedValue({ success: true, data: { custom: "done" } });
    const handler = createScriptNode({ scriptFn });
    const ctx = makeContext({ variables: { x: 1 } });

    // Act
    const result = await handler.execute(ctx);

    // Assert
    expect(scriptFn).toHaveBeenCalledTimes(1);
    expect(scriptFn).toHaveBeenCalledWith(ctx);
    expect(result).toEqual({ success: true, data: { custom: "done" } });
  });

  test("returns no-op result when no scriptFn is provided", async () => {
    // Arrange
    const handler = createScriptNode();
    const ctx = makeContext();

    // Act
    const result = await handler.execute(ctx);

    // Assert
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ executed: false, reason: "no-op" });
  });
});

// ── Condition Node ──────────────────────────────────────────────────

describe("createConditionNode", () => {
  test("evaluates truthy variable to true", async () => {
    // Arrange
    const handler = createConditionNode({ expression: "isReady" });
    const ctx = makeContext({ variables: { isReady: true } });

    // Act
    const result = await handler.execute(ctx);

    // Assert
    expect(result.success).toBe(true);
    expect(result.data?.result).toBe(true);
  });

  test("evaluates falsy variable to false", async () => {
    // Arrange
    const handler = createConditionNode({ expression: "isReady" });
    const ctx = makeContext({ variables: { isReady: false } });

    // Act
    const result = await handler.execute(ctx);

    // Assert
    expect(result.success).toBe(true);
    expect(result.data?.result).toBe(false);
  });

  test("evaluates missing variable to false", async () => {
    // Arrange
    const handler = createConditionNode({ expression: "missingVar" });
    const ctx = makeContext({ variables: {} });

    // Act
    const result = await handler.execute(ctx);

    // Assert
    expect(result.success).toBe(true);
    expect(result.data?.result).toBe(false);
  });

  test("evaluates equality expression 'amount === 100'", async () => {
    // Arrange
    const handler = createConditionNode({ expression: "amount === 100" });
    const ctx1 = makeContext({ variables: { amount: 100 } });
    const ctx2 = makeContext({ variables: { amount: 200 } });

    // Act & Assert — match
    const r1 = await handler.execute(ctx1);
    expect(r1.data?.result).toBe(true);

    // Act & Assert — no match
    const r2 = await handler.execute(ctx2);
    expect(r2.data?.result).toBe(false);
  });

  test("evaluates inequality expression 'status !== draft'", async () => {
    // Arrange
    const handler = createConditionNode({ expression: 'status !== "draft"' });
    const ctx = makeContext({ variables: { status: "published" } });

    // Act
    const result = await handler.execute(ctx);

    // Assert
    expect(result.success).toBe(true);
    expect(result.data?.result).toBe(true);
  });

  test("supports boolean literal comparison 'isEnabled === true'", async () => {
    // Arrange
    const handler = createConditionNode({ expression: "isEnabled === true" });
    const ctx = makeContext({ variables: { isEnabled: true } });

    // Act
    const result = await handler.execute(ctx);

    // Assert
    expect(result.data?.result).toBe(true);
  });

  test("throws for empty expression", () => {
    // Arrange, Act, Assert
    expect(() => createConditionNode({ expression: "" })).toThrow();
  });
});
