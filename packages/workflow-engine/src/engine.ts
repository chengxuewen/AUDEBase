import type {
  WorkflowDef,
  WorkflowInstance,
  WorkflowNode,
  WorkflowStateMachine,
  TaskManager,
  TaskInstance,
} from "./types.js";

export class WorkflowEngine {
  private readonly instances = new Map<string, WorkflowInstance>();

  constructor(
    private readonly workflow: WorkflowDef,
    private readonly stateMachine: WorkflowStateMachine,
    private readonly taskManager: TaskManager,
  ) {}

  async start(context: Record<string, unknown>): Promise<WorkflowInstance> {
    const startNode = this.workflow.nodes.find((n) => n.type === "start");
    if (!startNode) {
      throw new Error(
        `Workflow "${this.workflow.id}" has no start node`,
      );
    }

    const instance: WorkflowInstance = {
      id: crypto.randomUUID(),
      workflowId: this.workflow.id,
      workflowVersion: this.workflow.version,
      state: "running",
      currentNodeId: startNode.id,
      context,
      taskInstances: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.instances.set(instance.id, instance);

    return this.advance(instance.id);
  }

  async advance(instanceId: string): Promise<WorkflowInstance> {
    const instance = this.getInstance(instanceId);
    const maxIter = 100;
    let iter = 0;

    while (instance.state === "running" && iter++ < maxIter) {
      const node = this.getWorkflowNode(instance.currentNodeId);
      if (!node) {
        throw new Error(
          `Node "${instance.currentNodeId}" not found in workflow "${this.workflow.id}"`,
        );
      }

      const prevNodeId = instance.currentNodeId;
      await this.executeNode(instance, node);

      if (instance.state !== "running") break;

      if (
        (node.type === "task" || node.type === "approval") &&
        instance.currentNodeId === prevNodeId
      ) {
        break;
      }

      // ponytail: prevent infinite loop if node doesn't advance
      if (instance.currentNodeId === prevNodeId) break;
    }

    return instance;
  }

  async executeNode(
    instance: WorkflowInstance,
    node: WorkflowNode,
  ): Promise<void> {
    switch (node.type) {
      case "start":
      case "script":
      case "notification":
        this.moveToNextNode(instance, node);
        break;

      case "end":
        instance.state = "completed";
        instance.updatedAt = new Date();
        break;

      case "task":
      case "approval": {
        const task = await this.taskManager.createTask(instance, node);
        instance.taskInstances.push(task);
        instance.updatedAt = new Date();
        break;
      }

      case "condition": {
        const conditions = node.conditions ?? [];
        let matched = false;
        for (const condition of conditions) {
          if (this.evaluateCondition(condition.expression, instance.context)) {
            const transition = this.workflow.transitions.find(
              (t) => t.id === condition.transitionId,
            );
            if (!transition) {
              throw new Error(
                `Condition transition "${condition.transitionId}" not found`,
              );
            }
            this.applyTransition(instance, transition);
            matched = true;
            break;
          }
        }
        if (!matched) {
          this.applyDefaultTransition(instance, node);
        }
        break;
      }

      case "parallel": {
        const outgoing = this.workflow.transitions.filter(
          (t) => t.from === node.id,
        );
        for (const transition of outgoing) {
          const nextNode = this.workflow.nodes.find(
            (n) => n.id === transition.to,
          );
          if (nextNode && nextNode.type !== "end") {
            await this.taskManager.createTask(instance, nextNode);
          }
        }
        this.applyDefaultTransition(instance, node);
        break;
      }
    }
  }

  async onTaskCompleted(
    taskId: string,
    result?: Record<string, unknown>,
  ): Promise<WorkflowInstance> {
    const task = await this.taskManager.completeTask(taskId, result);
    const instance = this.getInstance(task.workflowInstanceId);
    this.updateTaskInInstance(instance, task);

    const currentNode = this.getWorkflowNode(instance.currentNodeId);
    if (currentNode) {
      this.moveToNextNode(instance, currentNode);
    }

    return this.advance(instance.id);
  }

  async onTaskRejected(
    taskId: string,
    reason?: string,
  ): Promise<WorkflowInstance> {
    await this.taskManager.rejectTask(taskId, reason);
    const task = await this.taskManager.getTask(taskId);
    if (!task) {
      throw new Error(`Task "${taskId}" not found`);
    }
    const instance = this.getInstance(task.workflowInstanceId);
    this.updateTaskInInstance(instance, task);

    instance.updatedAt = new Date();
    return instance;
  }

  getInstance(instanceId: string): WorkflowInstance {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Workflow instance "${instanceId}" not found`);
    }
    return instance;
  }

  // --- private helpers ---

  private getWorkflowNode(nodeId: string): WorkflowNode | undefined {
    return this.workflow.nodes.find((n) => n.id === nodeId);
  }

  private moveToNextNode(
    instance: WorkflowInstance,
    currentNode: WorkflowNode,
  ): void {
    const transition = this.findDefaultTransition(currentNode);
    if (transition) {
      this.applyTransition(instance, transition);
    }
  }

  private findDefaultTransition(
    node: WorkflowNode,
  ): WorkflowDef["transitions"][number] | undefined {
    return this.workflow.transitions.find((t) => t.from === node.id);
  }

  private applyTransition(
    instance: WorkflowInstance,
    transition: WorkflowDef["transitions"][number],
  ): void {
    const nextNode = this.workflow.nodes.find(
      (n) => n.id === transition.to,
    );
    if (!nextNode) {
      throw new Error(
        `Transition target "${transition.to}" not found in workflow`,
      );
    }

    instance.currentNodeId = nextNode.id;
    instance.updatedAt = new Date();

    if (nextNode.type === "end") {
      instance.state = "completed";
    }
  }

  private applyDefaultTransition(
    instance: WorkflowInstance,
    node: WorkflowNode,
  ): void {
    const transition = this.findDefaultTransition(node);
    if (!transition) {
      throw new Error(
        `No default transition found from node "${node.id}"`,
      );
    }
    this.applyTransition(instance, transition);
  }

  private updateTaskInInstance(
    instance: WorkflowInstance,
    task: TaskInstance,
  ): void {
    const idx = instance.taskInstances.findIndex((t) => t.id === task.id);
    if (idx !== -1) {
      instance.taskInstances[idx] = task;
    }
  }

  private evaluateCondition(
    expression: string,
    context: Record<string, unknown>,
  ): boolean {
    const [key, value] = expression.split("=").map((s) => s.trim());
    if (!key || value === undefined) return false;
    return String(context[key]) === value;
  }
}
