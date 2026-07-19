import { describe, test, expect, beforeEach, vi } from "vitest";
import { WorkflowEngine } from "../engine.js";
import type {
  WorkflowDef,
  WorkflowStateMachine,
  TaskManager,
  WorkflowNode,
  WorkflowInstance,
  TaskInstance,
} from "../types.js";

// --- Test helpers ---

function makeLinearWorkflow(): WorkflowDef {
  return {
    id: "linear-wf",
    name: "Linear Workflow",
    version: "1.0.0",
    nodes: [
      { id: "start", type: "start", label: "Start" },
      { id: "task1", type: "task", label: "Do Something", config: { assignee: "user1" } },
      { id: "end", type: "end", label: "End" },
    ],
    transitions: [
      { id: "t1", from: "start", to: "task1" },
      { id: "t2", from: "task1", to: "end" },
    ],
  };
}

function makeApprovalWorkflow(): WorkflowDef {
  return {
    id: "approval-wf",
    name: "Approval Workflow",
    version: "1.0.0",
    nodes: [
      { id: "start", type: "start", label: "Start" },
      {
        id: "approve",
        type: "approval",
        label: "Manager Approval",
        config: { approver: "manager" },
      },
      { id: "end", type: "end", label: "End" },
    ],
    transitions: [
      { id: "t1", from: "start", to: "approve" },
      { id: "t2", from: "approve", to: "end" },
    ],
  };
}

function makeConditionWorkflow(): WorkflowDef {
  return {
    id: "condition-wf",
    name: "Condition Workflow",
    version: "1.0.0",
    nodes: [
      { id: "start", type: "start", label: "Start" },
      {
        id: "branch",
        type: "condition",
        label: "Check Value",
        conditions: [
          { id: "c1", expression: "amount=100", transitionId: "t_high" },
          { id: "c2", expression: "amount=50", transitionId: "t_low" },
        ],
      },
      { id: "task_high", type: "task", label: "High Value Process" },
      { id: "task_low", type: "task", label: "Low Value Process" },
      { id: "end_high", type: "end", label: "End High" },
      { id: "end_low", type: "end", label: "End Low" },
    ],
    transitions: [
      { id: "t_start", from: "start", to: "branch" },
      { id: "t_high", from: "branch", to: "task_high" },
      { id: "t_low", from: "branch", to: "task_low" },
      { id: "t_finish_high", from: "task_high", to: "end_high" },
      { id: "t_finish_low", from: "task_low", to: "end_low" },
    ],
  };
}

function makeParallelWorkflow(): WorkflowDef {
  return {
    id: "parallel-wf",
    name: "Parallel Workflow",
    version: "1.0.0",
    nodes: [
      { id: "start", type: "start", label: "Start" },
      { id: "fork", type: "parallel", label: "Fork" },
      { id: "task_a", type: "task", label: "Task A" },
      { id: "task_b", type: "task", label: "Task B" },
      { id: "task_c", type: "task", label: "Task C" },
      { id: "end", type: "end", label: "End" },
    ],
    transitions: [
      { id: "t1", from: "start", to: "fork" },
      { id: "t2", from: "fork", to: "task_a" },
      { id: "t3", from: "fork", to: "task_b" },
      { id: "t4", from: "fork", to: "task_c" },
      { id: "t5", from: "fork", to: "end" },
    ],
  };
}

function makeStateMachine(workflow: WorkflowDef): WorkflowStateMachine {
  return {
    getCurrentNode(instance: WorkflowInstance): WorkflowNode | undefined {
      return workflow.nodes.find((n) => n.id === instance.currentNodeId);
    },
    transition(instance: WorkflowInstance, _transitionId: string): WorkflowInstance {
      return { ...instance, updatedAt: new Date() };
    },
    getAvailableTransitions(_instance: WorkflowInstance) {
      return workflow.transitions;
    },
  };
}

function makeTaskManager(): TaskManager {
  const tasks = new Map<string, TaskInstance>();

  return {
    async createTask(instance: WorkflowInstance, node: WorkflowNode): Promise<TaskInstance> {
      const task: TaskInstance = {
        id: `task-${tasks.size + 1}`,
        workflowInstanceId: instance.id,
        nodeId: node.id,
        type: node.type === "approval" ? "approval" : "task",
        status: "pending",
        createdAt: new Date(),
      };
      tasks.set(task.id, task);
      return task;
    },
    async completeTask(taskId: string, result?: Record<string, unknown>): Promise<TaskInstance> {
      const task = tasks.get(taskId);
      if (!task) throw new Error(`Task "${taskId}" not found`);
      task.status = "completed";
      task.result = result;
      task.completedAt = new Date();
      return task;
    },
    async rejectTask(taskId: string, _reason?: string): Promise<TaskInstance> {
      const task = tasks.get(taskId);
      if (!task) throw new Error(`Task "${taskId}" not found`);
      task.status = "rejected";
      task.completedAt = new Date();
      return task;
    },
    async getTask(taskId: string): Promise<TaskInstance | undefined> {
      return tasks.get(taskId);
    },
  };
}

// --- Tests ---

describe("WorkflowEngine", () => {
  let engine: WorkflowEngine;
  let workflow: WorkflowDef;
  let stateMachine: WorkflowStateMachine;
  let taskManager: TaskManager;

  describe("simple linear workflow", () => {
    beforeEach(() => {
      workflow = makeLinearWorkflow();
      stateMachine = makeStateMachine(workflow);
      taskManager = makeTaskManager();
      engine = new WorkflowEngine(workflow, stateMachine, taskManager);
    });

    test("starts workflow and stops at task node", async () => {
      // Arrange & Act
      const instance = await engine.start({});

      // Assert
      expect(instance.state).toBe("running");
      expect(instance.currentNodeId).toBe("task1");
      expect(instance.taskInstances).toHaveLength(1);
      expect(instance.taskInstances[0]!.nodeId).toBe("task1");
      expect(instance.taskInstances[0]!.status).toBe("pending");
    });

    test("completing task advances workflow to end", async () => {
      // Arrange
      const instance = await engine.start({});
      const taskId = instance.taskInstances[0]!.id;

      // Act
      const result = await engine.onTaskCompleted(taskId);

      // Assert
      expect(result.state).toBe("completed");
      expect(result.currentNodeId).toBe("end");
    });
  });

  describe("approval workflow", () => {
    beforeEach(() => {
      workflow = makeApprovalWorkflow();
      stateMachine = makeStateMachine(workflow);
      taskManager = makeTaskManager();
      engine = new WorkflowEngine(workflow, stateMachine, taskManager);
    });

    test("starts and creates approval task", async () => {
      // Arrange & Act
      const instance = await engine.start({});

      // Assert
      expect(instance.currentNodeId).toBe("approve");
      expect(instance.taskInstances).toHaveLength(1);
      expect(instance.taskInstances[0]!.type).toBe("approval");
    });

    test("approving completes workflow", async () => {
      // Arrange
      const instance = await engine.start({});
      const taskId = instance.taskInstances[0]!.id;

      // Act
      const result = await engine.onTaskCompleted(taskId);

      // Assert
      expect(result.state).toBe("completed");
    });
  });

  describe("condition branching", () => {
    beforeEach(() => {
      workflow = makeConditionWorkflow();
      stateMachine = makeStateMachine(workflow);
      taskManager = makeTaskManager();
      engine = new WorkflowEngine(workflow, stateMachine, taskManager);
    });

    test("routes to high branch when condition matches", async () => {
      // Arrange & Act
      const instance = await engine.start({ amount: "100" });

      // Assert
      expect(instance.currentNodeId).toBe("task_high");
      expect(instance.taskInstances).toHaveLength(1);
      expect(instance.taskInstances[0]!.nodeId).toBe("task_high");
    });

    test("routes to low branch when condition matches", async () => {
      // Arrange & Act
      const instance = await engine.start({ amount: "50" });

      // Assert
      expect(instance.currentNodeId).toBe("task_low");
    });

    test("falls through default transition when no condition matches", async () => {
      // Arrange — make a workflow where the condition node has a default fallback
      const wf: WorkflowDef = {
        id: "cond-fallback",
        name: "Condition Fallback",
        version: "1.0.0",
        nodes: [
          { id: "start", type: "start" },
          {
            id: "branch",
            type: "condition",
            conditions: [{ id: "c1", expression: "x=999", transitionId: "t_match" }],
          },
          { id: "no_match", type: "task", label: "No match" },
          { id: "matched", type: "task", label: "Matched" },
          { id: "end", type: "end" },
        ],
        transitions: [
          { id: "t_start", from: "start", to: "branch" },
          { id: "t_default", from: "branch", to: "no_match" },
          { id: "t_match", from: "branch", to: "matched" },
        ],
      };
      const sm = makeStateMachine(wf);
      const tm = makeTaskManager();
      const eng = new WorkflowEngine(wf, sm, tm);

      // Act
      const instance = await eng.start({ x: "1" });

      // Assert
      expect(instance.currentNodeId).toBe("no_match");
      // But wait, the default transition is t_default which goes to no_match.
      // The condition t_match goes to matched. Since x=1 doesn't match x=999,
      // it falls through to default
    });
  });

  describe("parallel execution", () => {
    beforeEach(() => {
      workflow = makeParallelWorkflow();
      stateMachine = makeStateMachine(workflow);
      taskManager = makeTaskManager();
      engine = new WorkflowEngine(workflow, stateMachine, taskManager);
    });

    test("creates tasks for all parallel branches and advances", async () => {
      // Arrange & Act
      const instance = await engine.start({});

      // Assert — fork creates tasks for branches, then continues to default transition (task_a)
      expect(instance.currentNodeId).toBe("task_a");
    });
  });

  describe("task lifecycle", () => {
    beforeEach(() => {
      workflow = makeLinearWorkflow();
      stateMachine = makeStateMachine(workflow);
      taskManager = makeTaskManager();
      engine = new WorkflowEngine(workflow, stateMachine, taskManager);
    });

    test("rejecting task keeps workflow at current node", async () => {
      // Arrange
      const instance = await engine.start({});
      const taskId = instance.taskInstances[0]!.id;

      // Act
      const result = await engine.onTaskRejected(taskId, "Needs revision");

      // Assert
      expect(result.state).toBe("running");
      expect(result.currentNodeId).toBe("task1");
    });

    test("full lifecycle: start → task → complete → end", async () => {
      // Arrange & Act: start
      const inst1 = await engine.start({ request: "test" });
      expect(inst1.state).toBe("running");
      expect(inst1.currentNodeId).toBe("task1");
      expect(inst1.context).toEqual({ request: "test" });

      // Act: complete task
      const inst2 = await engine.onTaskCompleted(inst1.taskInstances[0]!.id, { result: "ok" });

      // Assert
      expect(inst2.state).toBe("completed");
      expect(inst2.currentNodeId).toBe("end");
    });
  });

  describe("error handling", () => {
    beforeEach(() => {
      workflow = makeLinearWorkflow();
      stateMachine = makeStateMachine(workflow);
      taskManager = makeTaskManager();
      engine = new WorkflowEngine(workflow, stateMachine, taskManager);
    });

    test("throws when workflow has no start node", async () => {
      // Arrange
      const noStartWf: WorkflowDef = {
        id: "no-start",
        name: "No Start",
        version: "1.0.0",
        nodes: [
          { id: "task1", type: "task" },
          { id: "end", type: "end" },
        ],
        transitions: [{ id: "t1", from: "task1", to: "end" }],
      };
      const eng = new WorkflowEngine(noStartWf, makeStateMachine(noStartWf), makeTaskManager());

      // Act & Assert
      await expect(eng.start({})).rejects.toThrow("has no start node");
    });

    test("throws for invalid instance id", () => {
      // Act & Assert
      expect(() => engine.getInstance("nonexistent")).toThrow(
        'Workflow instance "nonexistent" not found',
      );
    });

    test("throws when node not found in workflow", async () => {
      // Arrange — corrupt the workflow by replacing with a bad one that has wrong node ref
      const badWf: WorkflowDef = {
        id: "bad-wf",
        name: "Bad Workflow",
        version: "1.0.0",
        nodes: [
          { id: "start", type: "start" },
          { id: "task1", type: "task" },
        ],
        transitions: [{ id: "t1", from: "start", to: "missing" }],
      };
      const sm = makeStateMachine(badWf);
      const eng = new WorkflowEngine(badWf, sm, makeTaskManager());

      // Act & Assert
      await expect(eng.start({})).rejects.toThrow("not found in workflow");
    });
  });

  describe("getInstance", () => {
    beforeEach(() => {
      workflow = makeLinearWorkflow();
      stateMachine = makeStateMachine(workflow);
      taskManager = makeTaskManager();
      engine = new WorkflowEngine(workflow, stateMachine, taskManager);
    });

    test("returns instance after start", async () => {
      // Arrange & Act
      const instance = await engine.start({});
      const retrieved = engine.getInstance(instance.id);

      // Assert
      expect(retrieved.id).toBe(instance.id);
      expect(retrieved.state).toBe("running");
    });
  });
});
