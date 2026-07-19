import { describe, test, expect, beforeEach } from 'vitest';
import { TaskManager } from '../task-manager.js';
import type { TaskInstance } from '../types.js';

describe('TaskManager', () => {
  let tm: TaskManager;

  beforeEach(() => {
    tm = new TaskManager();
  });

  describe('createTask', () => {
    test('creates a task with pending status', () => {
      // Arrange & Act
      const task = tm.createTask('inst-1', 'node-1');

      // Assert
      expect(task.status).toBe('pending');
      expect(task.instanceId).toBe('inst-1');
      expect(task.nodeId).toBe('node-1');
      expect(task.id).toBeTruthy();
    });

    test('assigns unique IDs to tasks', () => {
      // Arrange & Act
      const t1 = tm.createTask('inst-1', 'node-1');
      const t2 = tm.createTask('inst-1', 'node-2');

      // Assert
      expect(t1.id).not.toBe(t2.id);
    });

    test('creates task with optional assignee', () => {
      // Arrange & Act
      const task = tm.createTask('inst-1', 'node-1', 'user-1');

      // Assert
      expect(task.assignee).toBe('user-1');
    });

    test('creates task with empty data object', () => {
      // Arrange & Act
      const task = tm.createTask('inst-1', 'node-1');

      // Assert
      expect(task.data).toEqual({});
    });
  });

  describe('completeTask', () => {
    test('completes a pending task', () => {
      // Arrange
      const task = tm.createTask('inst-1', 'node-1');

      // Act
      const result = tm.completeTask(task.id);

      // Assert
      expect(result.status).toBe('completed');
    });

    test('completes an in-progress task', () => {
      // Arrange
      const task = tm.createTask('inst-1', 'node-1');
      tm.startTask(task.id);

      // Act
      const result = tm.completeTask(task.id);

      // Assert
      expect(result.status).toBe('completed');
    });

    test('throws when completing an already completed task', () => {
      // Arrange
      const task = tm.createTask('inst-1', 'node-1');
      tm.completeTask(task.id);

      // Act & Assert
      expect(() => tm.completeTask(task.id)).toThrow(
        `Cannot transition task "${task.id}" from "completed" to "completed"`,
      );
    });

    test('throws when completing a cancelled task', () => {
      // Arrange
      const task = tm.createTask('inst-1', 'node-1');
      tm.cancelTask(task.id);

      // Act & Assert
      expect(() => tm.completeTask(task.id)).toThrow(
        `Cannot transition task "${task.id}" from "cancelled" to "completed"`,
      );
    });
  });

  describe('rejectTask', () => {
    test('rejects a pending task with reason', () => {
      // Arrange
      const task = tm.createTask('inst-1', 'node-1');

      // Act
      const result = tm.rejectTask(task.id, 'Not needed');

      // Assert
      expect(result.status).toBe('rejected');
      expect(result.data.rejectReason).toBe('Not needed');
    });

    test('rejects a task without reason', () => {
      // Arrange
      const task = tm.createTask('inst-1', 'node-1');

      // Act
      const result = tm.rejectTask(task.id);

      // Assert
      expect(result.status).toBe('rejected');
      expect(result.data.rejectReason).toBeUndefined();
    });

    test('throws when rejecting a non-existent task', () => {
      // Act & Assert
      expect(() => tm.rejectTask('nonexistent')).toThrow(
        'Task "nonexistent" not found',
      );
    });
  });

  describe('getInstanceTasks', () => {
    test('returns all tasks for a specific instance', () => {
      // Arrange
      tm.createTask('inst-1', 'node-1');
      tm.createTask('inst-1', 'node-2');
      tm.createTask('inst-2', 'node-1');

      // Act
      const tasks = tm.getInstanceTasks('inst-1');

      // Assert
      expect(tasks).toHaveLength(2);
      expect(tasks.every((t) => t.instanceId === 'inst-1')).toBe(true);
    });

    test('returns empty array when instance has no tasks', () => {
      // Arrange & Act
      const tasks = tm.getInstanceTasks('nonexistent');

      // Assert
      expect(tasks).toHaveLength(0);
    });
  });

  describe('cancelTask', () => {
    test('cancels a pending task', () => {
      // Arrange
      const task = tm.createTask('inst-1', 'node-1');

      // Act
      const result = tm.cancelTask(task.id);

      // Assert
      expect(result.status).toBe('cancelled');
    });

    test('cancels an in-progress task', () => {
      // Arrange
      const task = tm.createTask('inst-1', 'node-1');
      tm.startTask(task.id);

      // Act
      const result = tm.cancelTask(task.id);

      // Assert
      expect(result.status).toBe('cancelled');
    });

    test('throws when cancelling an already cancelled task', () => {
      // Arrange
      const task = tm.createTask('inst-1', 'node-1');
      tm.cancelTask(task.id);

      // Act & Assert
      expect(() => tm.cancelTask(task.id)).toThrow(
        `Cannot transition task "${task.id}" from "cancelled" to "cancelled"`,
      );
    });
  });

  describe('startTask', () => {
    test('starts a pending task', () => {
      // Arrange
      const task = tm.createTask('inst-1', 'node-1');

      // Act
      const result = tm.startTask(task.id);

      // Assert
      expect(result.status).toBe('in_progress');
    });

    test('throws when starting a completed task', () => {
      // Arrange
      const task = tm.createTask('inst-1', 'node-1');
      tm.completeTask(task.id);

      // Act & Assert
      expect(() => tm.startTask(task.id)).toThrow(
        `Cannot transition task "${task.id}" from "completed" to "in_progress"`,
      );
    });
  });
});
