export type WorkflowStatus = "draft" | "active" | "suspended" | "completed" | "cancelled";
export type NodeType =
  "start" | "end" | "task" | "approval" | "condition" | "parallel" | "script" | "notification";
export type TaskStatus = "pending" | "in_progress" | "completed" | "rejected" | "cancelled";

export interface WorkflowDef {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly nodes: readonly WorkflowNode[];
  readonly transitions: readonly Transition[];
}

export interface WorkflowNode {
  readonly id: string;
  readonly type: NodeType;
  readonly name: string;
  readonly config?: Record<string, unknown>;
}

export interface Transition {
  readonly from: string;
  readonly to: string;
  readonly condition?: string;
}

export interface WorkflowInstance {
  readonly id: string;
  readonly workflowId: string;
  readonly status: WorkflowStatus;
  readonly currentNodeId: string;
  readonly context: Record<string, unknown>;
}

export interface TaskInstance {
  readonly id: string;
  readonly instanceId: string;
  readonly nodeId: string;
  readonly status: TaskStatus;
  readonly assignee?: string;
  readonly data: Record<string, unknown>;
}
