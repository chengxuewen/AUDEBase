import type { TaskInstance, TaskStatus } from './types.js';

// ponytail: simple in-memory task store; add persistence when needed

const VALID_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  pending: ['in_progress', 'completed', 'rejected', 'cancelled'],
  in_progress: ['completed', 'rejected', 'cancelled'],
  completed: [],
  rejected: [],
  cancelled: [],
};

export class TaskManager {
  private tasks: TaskInstance[] = [];
  private nextId = 1;

  /** Create a new task for a workflow instance node. */
  createTask(
    instanceId: string,
    nodeId: string,
    assignee?: string,
  ): TaskInstance {
    const task: TaskInstance = {
      id: `task-${this.nextId++}`,
      instanceId,
      nodeId,
      status: 'pending',
      assignee,
      data: {},
    };
    this.tasks.push(task);
    return { ...task };
  }

  /** Mark a task as completed. */
  completeTask(taskId: string): TaskInstance {
    return this.updateStatus(taskId, 'completed');
  }

  /** Reject a task with optional reason stored in data. */
  rejectTask(taskId: string, reason?: string): TaskInstance {
    const task = this.updateStatus(taskId, 'rejected');
    if (reason !== undefined) {
      task.data = { ...task.data, rejectReason: reason };
      const idx = this.tasks.findIndex((t) => t.id === taskId);
      if (idx !== -1) {
        this.tasks[idx] = task;
      }
    }
    return task;
  }

  /** Get all tasks for a workflow instance. */
  getInstanceTasks(instanceId: string): TaskInstance[] {
    return this.tasks.filter((t) => t.instanceId === instanceId);
  }

  /** Cancel a task. Only valid for pending or in_progress tasks. */
  cancelTask(taskId: string): TaskInstance {
    return this.updateStatus(taskId, 'cancelled');
  }

  /** Start a pending task (move to in_progress). */
  startTask(taskId: string): TaskInstance {
    return this.updateStatus(taskId, 'in_progress');
  }

  private findTask(taskId: string): TaskInstance {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) {
      throw new Error(`Task "${taskId}" not found`);
    }
    return task;
  }

  private updateStatus(taskId: string, newStatus: TaskStatus): TaskInstance {
    const task = this.findTask(taskId);
    const allowed = VALID_TRANSITIONS[task.status];

    if (!allowed.includes(newStatus)) {
      throw new Error(
        `Cannot transition task "${taskId}" from "${task.status}" to "${newStatus}"`,
      );
    }

    const updated: TaskInstance = { ...task, status: newStatus };
    const idx = this.tasks.findIndex((t) => t.id === taskId);
    this.tasks[idx] = updated;
    return updated;
  }
}
