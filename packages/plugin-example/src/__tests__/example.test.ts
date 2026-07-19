import { describe, test, expect, beforeEach } from "vitest";
import type { ExamplePlugin } from "../index";
import { createPlugin, TodoService } from "../index";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ExamplePlugin", () => {
  let plugin: ExamplePlugin;

  beforeEach(() => {
    plugin = createPlugin();
  });

  describe("load()", () => {
    test("plugin is not loaded before load()", () => {
      // Arrange + Act (no load call)
      // Assert
      expect(plugin.isLoaded).toBe(false);
    });

    test("plugin is loaded after load()", async () => {
      // Arrange
      // Act
      await plugin.load();
      // Assert
      expect(plugin.isLoaded).toBe(true);
    });

    test("load() resolves successfully", async () => {
      // Act
      await expect(plugin.load()).resolves.toBeUndefined();
    });
  });

  describe("name", () => {
    test("has correct plugin name", () => {
      // Assert
      expect(plugin.name).toBe("@audebase/plugin-example-todo");
    });
  });

  describe("todos property", () => {
    test("has TodoService instance", () => {
      // Assert
      expect(plugin.todos).toBeInstanceOf(TodoService);
      expect(plugin.todos.list()).toEqual([]);
    });
  });
});

describe("TodoService", () => {
  let service: TodoService;

  beforeEach(() => {
    service = new TodoService();
  });

  describe("list()", () => {
    test("returns empty array when no todos exist", () => {
      const result = service.list();
      expect(result).toEqual([]);
    });

    test("returns created todos", () => {
      service.create({ title: "Buy milk", userId: "user-1" });
      service.create({ title: "Write tests", userId: "user-1" });
      const result = service.list();
      expect(result).toHaveLength(2);
    });
  });

  describe("create()", () => {
    test("creates a todo with default completed=false", () => {
      const todo = service.create({ title: "Buy milk", userId: "user-1" });
      expect(todo.title).toBe("Buy milk");
      expect(todo.userId).toBe("user-1");
      expect(todo.completed).toBe(false);
      expect(todo.id).toBeDefined();
      expect(typeof todo.id).toBe("string");
    });

    test("creates todos with unique ids", () => {
      const a = service.create({ title: "A", userId: "user-1" });
      const b = service.create({ title: "B", userId: "user-1" });
      expect(a.id).not.toBe(b.id);
    });
  });

  describe("get()", () => {
    test("returns undefined for unknown id", () => {
      expect(service.get("nonexistent")).toBeUndefined();
    });

    test("returns created todo by id", () => {
      const created = service.create({ title: "Test", userId: "user-1" });
      const found = service.get(created.id);
      expect(found).toBeDefined();
      expect(found!.title).toBe("Test");
    });
  });

  describe("update()", () => {
    test("returns undefined for unknown id", () => {
      expect(service.update("nonexistent", { title: "X" })).toBeUndefined();
    });

    test("updates todo title", () => {
      const created = service.create({ title: "Old title", userId: "user-1" });
      const updated = service.update(created.id, { title: "New title" });
      expect(updated).toBeDefined();
      expect(updated!.title).toBe("New title");
      // Verify in-place
      expect(service.get(created.id)!.title).toBe("New title");
    });

    test("updates todo completed status", () => {
      const created = service.create({ title: "Task", userId: "user-1" });
      expect(created.completed).toBe(false);
      const updated = service.update(created.id, { completed: true });
      expect(updated!.completed).toBe(true);
    });

    test("partial update preserves existing fields", () => {
      const created = service.create({ title: "Task", userId: "user-1" });
      const updated = service.update(created.id, { completed: true });
      expect(updated!.title).toBe("Task");
      expect(updated!.completed).toBe(true);
    });
  });

  describe("delete()", () => {
    test("returns false for unknown id", () => {
      expect(service.delete("nonexistent")).toBe(false);
    });

    test("removes todo and returns true", () => {
      const created = service.create({ title: "Task", userId: "user-1" });
      expect(service.delete(created.id)).toBe(true);
      expect(service.get(created.id)).toBeUndefined();
      expect(service.list()).toHaveLength(0);
    });
  });

  describe("clear()", () => {
    test("removes all todos", () => {
      service.create({ title: "A", userId: "user-1" });
      service.create({ title: "B", userId: "user-1" });
      expect(service.list()).toHaveLength(2);
      service.clear();
      expect(service.list()).toEqual([]);
    });
  });
});

describe("createPlugin()", () => {
  test("creates independent instances", () => {
    const a = createPlugin();
    const b = createPlugin();
    a.todos.create({ title: "In A", userId: "user-1" });
    expect(a.todos.list()).toHaveLength(1);
    expect(b.todos.list()).toHaveLength(0);
  });
});

describe("manifest", () => {
  test("has required fields", async () => {
    const { manifest } = await import("../index");
    expect(manifest.name).toBe("@audebase/plugin-example-todo");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.category).toBe("oa");
    expect(manifest.runtime.mode).toBe("inline");
    expect(manifest.runtime.partition).toBe("oa");
    expect(manifest.dependencies).toEqual([]);
    expect(manifest.lifecycle.autoInstall).toBe(false);
    expect(manifest.lifecycle.hooks.load).toBe("load");
  });
});
