// ponytail: types defined locally until @audebase/workflow-core is ready

export type WorkflowNodeType =
  | "start"
  | "end"
  | "task"
  | "approval"
  | "condition"
  | "parallel"
  | "script"
  | "notification";

export interface WorkflowTransition {
  id: string;
  from: string;
  to: string;
  condition?: string;
  label?: string;
}

export interface WorkflowCondition {
  id: string;
  expression: string;
  transitionId: string;
}

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  label?: string;
  config?: Record<string, unknown>;
  conditions?: WorkflowCondition[];
}

export interface WorkflowDef {
  id: string;
  name: string;
  version: string;
  nodes: WorkflowNode[];
  transitions: WorkflowTransition[];
}

export interface TaskInstance {
  id: string;
  workflowInstanceId: string;
  nodeId: string;
  type: "task" | "approval";
  status: "pending" | "in_progress" | "completed" | "rejected";
  assignedTo?: string;
  result?: Record<string, unknown>;
  createdAt: Date;
  completedAt?: Date;
}

export interface WorkflowInstance {
  id: string;
  workflowId: string;
  workflowVersion: string;
  state: "running" | "completed" | "rejected" | "error";
  currentNodeId: string;
  context: Record<string, unknown>;
  taskInstances: TaskInstance[];
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowStateMachine {
  getCurrentNode(instance: WorkflowInstance): WorkflowNode | undefined;
  transition(
    instance: WorkflowInstance,
    transitionId: string,
  ): WorkflowInstance;
  getAvailableTransitions(
    instance: WorkflowInstance,
  ): WorkflowTransition[];
}

export interface TaskManager {
  createTask(
    instance: WorkflowInstance,
    node: WorkflowNode,
  ): Promise<TaskInstance>;
  completeTask(
    taskId: string,
    result?: Record<string, unknown>,
  ): Promise<TaskInstance>;
  rejectTask(taskId: string, reason?: string): Promise<TaskInstance>;
  getTask(taskId: string): Promise<TaskInstance | undefined>;
}
