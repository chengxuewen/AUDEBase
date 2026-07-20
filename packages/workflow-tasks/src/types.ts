/**
 * Workflow task node type definitions.
 * Phase 4 — task node implementations for the workflow engine.
 */

/**
 * Context passed to every node handler during execution.
 * Carries the instance identifier, current node ID, runtime data,
 * and accumulated workflow variables.
 */
export interface WorkflowContext {
  readonly instanceId: string;
  readonly nodeId: string;
  readonly data: Record<string, unknown>;
  readonly variables: Record<string, unknown>;
}

/**
 * Result returned by a node handler after execution.
 * The `nextAction` field allows nodes to direct the engine
 * to a specific outgoing edge (e.g. "approved" / "rejected").
 */
export interface NodeResult {
  readonly success: boolean;
  readonly nextAction?: string;
  readonly data?: Record<string, unknown>;
  readonly assignee?: string;
}

/**
 * A task node handler. Every node type (approval, task, notification,
 * script, condition) implements this interface.
 */
export interface NodeHandler {
  execute(context: WorkflowContext): Promise<NodeResult>;
}

/**
 * Configuration for creating node handlers.
 */
export interface ApprovalNodeConfig {
  readonly defaultAssignee?: string;
}

export interface TaskNodeConfig {
  readonly label?: string;
}

export interface NotificationNodeConfig {
  readonly channel: string;
  readonly template: string;
  readonly recipient?: string;
}

export interface ScriptNodeConfig {
  readonly scriptFn?: (context: WorkflowContext) => Promise<NodeResult>;
}

export interface ConditionNodeConfig {
  readonly expression: string;
}
