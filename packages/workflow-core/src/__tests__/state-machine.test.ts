import { describe, test, expect } from "vitest";
import { WorkflowStateMachine } from "../state-machine.js";
import type { WorkflowDef, WorkflowInstance } from "../types.js";

function makeDef(overrides?: Partial<WorkflowDef>): WorkflowDef {
  return {
    id: "wf-1",
    name: "Test Workflow",
    version: 1,
    nodes: [
      { id: "start", type: "start", name: "Start" },
      { id: "task1", type: "task", name: "Task 1" },
      { id: "end", type: "end", name: "End" },
    ],
    transitions: [
      { from: "start", to: "task1" },
      { from: "task1", to: "end" },
    ],
    ...overrides,
  };
}

function makeInstance(overrides?: Partial<WorkflowInstance>): WorkflowInstance {
  return {
    id: "inst-1",
    workflowId: "wf-1",
    status: "active",
    currentNodeId: "start",
    context: {},
    ...overrides,
  };
}

describe("WorkflowStateMachine", () => {
  const sm = new WorkflowStateMachine();

  describe("transition", () => {
    test("moves workflow to a new node via defined transition", () => {
      // Arrange
      const def = makeDef();
      const instance = makeInstance({ currentNodeId: "start" });

      // Act
      const result = sm.transition(def, instance, "task1");

      // Assert
      expect(result.currentNodeId).toBe("task1");
      expect(result.status).toBe("active");
    });

    test("throws when transitioning from completed status", () => {
      // Arrange
      const def = makeDef();
      const instance = makeInstance({
        status: "completed",
        currentNodeId: "end",
      });

      // Act & Assert
      expect(() => sm.transition(def, instance, "task1")).toThrow(
        'Cannot transition from terminal status "completed"',
      );
    });

    test("throws when transitioning from cancelled status", () => {
      // Arrange
      const def = makeDef();
      const instance = makeInstance({
        status: "cancelled",
        currentNodeId: "start",
      });

      // Act & Assert
      expect(() => sm.transition(def, instance, "task1")).toThrow(
        'Cannot transition from terminal status "cancelled"',
      );
    });

    test("throws when target node does not exist", () => {
      // Arrange
      const def = makeDef();
      const instance = makeInstance();

      // Act & Assert
      expect(() => sm.transition(def, instance, "nonexistent")).toThrow(
        'Node "nonexistent" not found',
      );
    });

    test("throws when no transition defined between nodes", () => {
      // Arrange
      const def = makeDef();
      const instance = makeInstance({ currentNodeId: "start" });

      // Act & Assert
      expect(() => sm.transition(def, instance, "end")).toThrow(
        'No transition defined from "start" to "end"',
      );
    });

    test("sets status to active when transitioning from suspended", () => {
      // Arrange
      const def = makeDef();
      const instance = makeInstance({
        status: "suspended",
        currentNodeId: "start",
      });

      // Act
      const result = sm.transition(def, instance, "task1");

      // Assert
      expect(result.status).toBe("active");
      expect(result.currentNodeId).toBe("task1");
    });
  });

  describe("complete", () => {
    test("completes workflow when current node is an end node", () => {
      // Arrange
      const def = makeDef();
      const instance = makeInstance({ currentNodeId: "end" });

      // Act
      const result = sm.complete(def, instance);

      // Assert
      expect(result.status).toBe("completed");
    });

    test("throws when current node is not an end node", () => {
      // Arrange
      const def = makeDef();
      const instance = makeInstance({ currentNodeId: "task1" });

      // Act & Assert
      expect(() => sm.complete(def, instance)).toThrow(
        'Cannot complete workflow — current node "task1" is not an end node',
      );
    });

    test("throws when workflow is already completed", () => {
      // Arrange
      const def = makeDef();
      const instance = makeInstance({
        status: "completed",
        currentNodeId: "end",
      });

      // Act & Assert
      expect(() => sm.complete(def, instance)).toThrow(
        'Cannot complete workflow with terminal status "completed"',
      );
    });
  });

  describe("suspend / resume", () => {
    test("suspends an active workflow", () => {
      // Arrange
      const instance = makeInstance({ status: "active" });

      // Act
      const result = sm.suspend(instance);

      // Assert
      expect(result.status).toBe("suspended");
    });

    test("throws when suspending non-active workflow", () => {
      // Arrange
      const instance = makeInstance({ status: "draft" });

      // Act & Assert
      expect(() => sm.suspend(instance)).toThrow('Cannot suspend workflow with status "draft"');
    });

    test("resumes a suspended workflow", () => {
      // Arrange
      const instance = makeInstance({ status: "suspended" });

      // Act
      const result = sm.resume(instance);

      // Assert
      expect(result.status).toBe("active");
    });

    test("throws when resuming non-suspended workflow", () => {
      // Arrange
      const instance = makeInstance({ status: "active" });

      // Act & Assert
      expect(() => sm.resume(instance)).toThrow('Cannot resume workflow with status "active"');
    });
  });

  describe("cancel", () => {
    test("cancels an active workflow", () => {
      // Arrange
      const instance = makeInstance({ status: "active" });

      // Act
      const result = sm.cancel(instance);

      // Assert
      expect(result.status).toBe("cancelled");
    });

    test("cancels a suspended workflow", () => {
      // Arrange
      const instance = makeInstance({ status: "suspended" });

      // Act
      const result = sm.cancel(instance);

      // Assert
      expect(result.status).toBe("cancelled");
    });

    test("cancels a draft workflow", () => {
      // Arrange
      const instance = makeInstance({ status: "draft" });

      // Act
      const result = sm.cancel(instance);

      // Assert
      expect(result.status).toBe("cancelled");
    });

    test("throws when cancelling already completed workflow", () => {
      // Arrange
      const instance = makeInstance({ status: "completed" });

      // Act & Assert
      expect(() => sm.cancel(instance)).toThrow(
        'Cannot cancel workflow with terminal status "completed"',
      );
    });

    test("throws when cancelling already cancelled workflow", () => {
      // Arrange
      const instance = makeInstance({ status: "cancelled" });

      // Act & Assert
      expect(() => sm.cancel(instance)).toThrow(
        'Cannot cancel workflow with terminal status "cancelled"',
      );
    });
  });
});
