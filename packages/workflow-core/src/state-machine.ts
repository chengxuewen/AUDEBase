import type { WorkflowDef, WorkflowInstance, WorkflowNode, WorkflowStatus } from './types.js';

// ponytail: simple in-memory state machine; add persistence layer when needed

export class WorkflowStateMachine {
  /** Find a node by ID within a workflow definition. */
  private findNode(def: WorkflowDef, nodeId: string): WorkflowNode {
    const node = def.nodes.find((n) => n.id === nodeId);
    if (!node) {
      throw new Error(`Node "${nodeId}" not found in workflow "${def.id}"`);
    }
    return node;
  }

  /** Check if a transition exists from one node to another. */
  private hasTransition(def: WorkflowDef, from: string, to: string): boolean {
    return def.transitions.some((t) => t.from === from && t.to === to);
  }

  /** Check if a node is a valid terminal node (type === 'end'). */
  private isEndNode(def: WorkflowDef, nodeId: string): boolean {
    const node = this.findNode(def, nodeId);
    return node.type === 'end';
  }

  /**
   * Transition the workflow instance to a new node.
   * Validates: terminal statuses block transitions, destination must exist,
   * transition must be defined.
   */
  transition(
    def: WorkflowDef,
    instance: WorkflowInstance,
    targetNodeId: string,
  ): WorkflowInstance {
    if (instance.status === 'completed' || instance.status === 'cancelled') {
      throw new Error(
        `Cannot transition from terminal status "${instance.status}"`,
      );
    }

    this.findNode(def, targetNodeId);

    if (!this.hasTransition(def, instance.currentNodeId, targetNodeId)) {
      throw new Error(
        `No transition defined from "${instance.currentNodeId}" to "${targetNodeId}"`,
      );
    }

    return {
      ...instance,
      currentNodeId: targetNodeId,
      status: 'active',
    };
  }

  /**
   * Complete the workflow. Only valid when current node is an 'end' node.
   */
  complete(def: WorkflowDef, instance: WorkflowInstance): WorkflowInstance {
    if (instance.status === 'completed' || instance.status === 'cancelled') {
      throw new Error(
        `Cannot complete workflow with terminal status "${instance.status}"`,
      );
    }

    if (!this.isEndNode(def, instance.currentNodeId)) {
      throw new Error(
        `Cannot complete workflow — current node "${instance.currentNodeId}" is not an end node`,
      );
    }

    return {
      ...instance,
      status: 'completed',
    };
  }

  /** Suspend an active workflow. */
  suspend(instance: WorkflowInstance): WorkflowInstance {
    if (instance.status !== 'active') {
      throw new Error(
        `Cannot suspend workflow with status "${instance.status}". Only active workflows can be suspended.`,
      );
    }

    return {
      ...instance,
      status: 'suspended',
    };
  }

  /** Resume a suspended workflow. */
  resume(instance: WorkflowInstance): WorkflowInstance {
    if (instance.status !== 'suspended') {
      throw new Error(
        `Cannot resume workflow with status "${instance.status}". Only suspended workflows can be resumed.`,
      );
    }

    return {
      ...instance,
      status: 'active',
    };
  }

  /** Cancel a workflow. Valid for active, suspended, or draft statuses. */
  cancel(instance: WorkflowInstance): WorkflowInstance {
    if (instance.status === 'completed' || instance.status === 'cancelled') {
      throw new Error(
        `Cannot cancel workflow with terminal status "${instance.status}"`,
      );
    }

    return {
      ...instance,
      status: 'cancelled',
    };
  }
}
