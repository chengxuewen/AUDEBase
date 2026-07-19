/**
 * Workflow task node handlers.
 * Phase 4 — approval, task, notification, script, and condition nodes.
 *
 * @module workflow-tasks
 */

import type { NotificationProvider } from "@audebase/notification";
import { z } from "zod";
import type {
  ApprovalNodeConfig,
  ConditionNodeConfig,
  NodeHandler,
  NodeResult,
  NotificationNodeConfig,
  ScriptNodeConfig,
  TaskNodeConfig,
  WorkflowContext,
} from "./types";

// ── Helpers ─────────────────────────────────────────────────────────

function success(data?: Record<string, unknown>, nextAction?: string): NodeResult {
  return { success: true, data, nextAction };
}

function assigneeSuccess(assignee: string, data?: Record<string, unknown>): NodeResult {
  return { success: true, data, assignee };
}

// ── Approval Node ───────────────────────────────────────────────────

/**
 * Creates an approval node handler.
 * Records the assignee and creates an approval task in the workflow context.
 */
export function createApprovalNode(config: ApprovalNodeConfig = {}): NodeHandler {
  return {
    async execute(context: WorkflowContext): Promise<NodeResult> {
      const assignee = (context.data.assignee as string) || config.defaultAssignee || "admin";
      return assigneeSuccess(assignee, {
        ...context.data,
        taskType: "approval",
        status: "pending",
        createdAt: new Date().toISOString(),
      });
    },
  };
}

// ── Task Node ───────────────────────────────────────────────────────

/**
 * Creates a simple task node handler.
 */
export function createTaskNode(_config: TaskNodeConfig = {}): NodeHandler {
  return {
    async execute(context: WorkflowContext): Promise<NodeResult> {
      return success({
        ...context.data,
        taskType: "task",
        status: "completed",
        completedAt: new Date().toISOString(),
      });
    },
  };
}

// ── Notification Node ───────────────────────────────────────────────

/**
 * Creates a notification node handler.
 * Calls the given notification provider to deliver a message.
 */
export function createNotificationNode(
  provider: NotificationProvider,
  config: NotificationNodeConfig,
): NodeHandler {
  return {
    async execute(context: WorkflowContext): Promise<NodeResult> {
      const recipient =
        config.recipient ?? (context.variables.userId as string) ?? "system";

      await provider.send(recipient, config.template, {
        ...context.data,
        ...context.variables,
        channel: config.channel,
      });

      return success({
        channel: config.channel,
        recipient,
        template: config.template,
        sentAt: new Date().toISOString(),
      });
    },
  };
}

// ── Script Node ─────────────────────────────────────────────────────

/**
 * Creates a script node handler.
 * Executes a sandboxed script function, or a no-op if none provided.
 */
export function createScriptNode(config: ScriptNodeConfig = {}): NodeHandler {
  return {
    async execute(context: WorkflowContext): Promise<NodeResult> {
      if (config.scriptFn) {
        return config.scriptFn(context);
      }

      // ponytail: no-op for Phase 4 — sandboxed script execution is Phase 4.1
      return success({ executed: false, reason: "no-op" });
    },
  };
}

// ── Condition Node ──────────────────────────────────────────────────

const conditionSchema = z.string().min(1);

const conditionVarsSchema = z.record(z.unknown());

/**
 * Evaluates a simple condition expression against the workflow context.
 *
 * Supported expressions:
 *   - `"variableName"` — truthiness check
 *   - `"variableName === value"` — equality (supports string, number, boolean)
 *   - `"variableName !== value"` — inequality
 */
function evaluateCondition(expression: string, variables: Record<string, unknown>): boolean {
  const trimmed = expression.trim();

  // Equality / inequality: "key === value" or "key !== value"
  const eqMatch = /^(\w+)\s*(===?|!==?)\s*(.+)$/.exec(trimmed);
  if (eqMatch) {
    const [, key, op, rawValue] = eqMatch;
    const actual = variables[key];
    const expected = parseLiteral(rawValue.trim());

    if (op === "===" || op === "==") {
      return actual === expected;
    }
    return actual !== expected;
  }

  // Truthiness check: just a variable name
  return Boolean(variables[trimmed]);
}

function parseLiteral(raw: string): unknown {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  if (raw === "undefined") return undefined;

  // Number
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    return Number(raw);
  }

  // Quoted string
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1);
  }

  // Unquoted string
  return raw;
}

/**
 * Creates a condition node handler.
 * Evaluates `config.expression` against the context variables
 * and returns success with the result in `data.result`.
 */
export function createConditionNode(config: ConditionNodeConfig): NodeHandler {
  conditionSchema.parse(config.expression);

  return {
    async execute(context: WorkflowContext): Promise<NodeResult> {
      conditionVarsSchema.parse(context.variables);

      const result = evaluateCondition(config.expression, context.variables);
      return success({ result }, result ? "true" : "false");
    },
  };
}
