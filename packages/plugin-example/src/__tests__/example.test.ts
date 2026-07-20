import { describe, test, expect, beforeEach, vi } from 'vitest';
import type { ExamplePlugin } from "../index";
import { createPlugin, TodoService } from "../index";

// ---------------------------------------------------------------------------
// Minimal mock Drizzle database for testing
// ponytail: in-memory mock — avoids real PostgreSQL dependency in unit tests
// ---------------------------------------------------------------------------

interface StoredRow {
  id: string;
  title: string;
  completed: boolean;
  user_id: string;
}

/**
 * Creates a thenable query result — acts like a Promise that resolves to rows
 * while also exposing .where() and .limit() for chaining.
 */
function createQueryThenable(
  resolveRows: () => StoredRow[],
): Promise<StoredRow[]> & { where: () => unknown; limit: () => unknown } {
  const promise = Promise.resolve(resolveRows());
  return Object.assign(promise, {
    where: () => promise,
    limit: () => promise,
  }) as unknown as Promise<StoredRow[]> & { where: () => unknown; limit: () => unknown };
}

function createMockDb(): any {
  const store: Map<string, StoredRow> = new Map();

  return {
    select() {
      return {
        from() {
          return createQueryThenable(() => [...store.values()]);
        },
      };
    },
    insert() {
      return {
        values(data: Record<string, unknown>) {
          const id = (data.id as string) ?? crypto.randomUUID();
          const row: StoredRow = {
            id,
            title: (data.title as string) ?? "",
            completed: (data.completed as boolean) ?? false,
            user_id: (data.user_id as string) ?? "",
          };
          store.set(id, row);
          return {
            returning: async () => [row],
          };
        },
      };
    },
    update() {
      let updateData: Record<string, unknown> = {};
      const self = {
        set(data: Record<string, unknown>) {
          updateData = data;
          return self;
        },
        where() {
          return self;
        },
        returning: async () => {
          const all = [...store.values()];
          for (const row of all) {
            if (updateData.title !== undefined) row.title = updateData.title as string;
            if (updateData.completed !== undefined) row.completed = updateData.completed as boolean;
          }
          return all as unknown as Record<string, unknown>[];
        },
      };
      return self;
    },
    delete() {
      const exec = async (): Promise<{ rowCount: number }> => {
        const count = store.size;
        store.clear();
        return { rowCount: count };
      };
      const result = exec();
      return Object.assign(result, {
        where: () => result,
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ExamplePlugin", () => {
  let plugin: ExamplePlugin;
  let db: any;

  beforeEach(() => {
    db = createMockDb();
    plugin = createPlugin(db);
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
      await plugin.load();
      // Assert
      expect(plugin.isLoaded).toBe(true);
    });

    test("todos service is created after load() with db", async () => {
      // Arrange
      expect(plugin.todos).toBeNull();
      // Act
      await plugin.load();
      // Assert
      expect(plugin.todos).toBeInstanceOf(TodoService);
    });
  });

  describe("name", () => {
    test("has correct plugin name", () => {
      // Assert
      expect(plugin.name).toBe("@audebase/plugin-example-todo");
    });
  });

  describe("todos property", () => {
    test("has TodoService instance after load", async () => {
      // Arrange
      await plugin.load();
      // Act
      const todos = await plugin.todos!.list();
      // Assert
      expect(plugin.todos).toBeInstanceOf(TodoService);
      expect(todos).toEqual([]);
    });
  });

  describe('install()', () => {
    test('does nothing when db is null', async () => {
      // Arrange
      const pluginNoDb = createPlugin();

      // Act
      await pluginNoDb.install();

      // Assert — no error thrown, db remains null
      expect(pluginNoDb.isLoaded).toBe(false);
    });

    test('executes migration SQL when db is available', async () => {
      // Arrange
      const executeSpy = vi.fn().mockResolvedValue(undefined);
      const dbWithExecute = { ...createMockDb(), execute: executeSpy };
      const pluginWithDb = createPlugin(dbWithExecute);

      // Act
      await pluginWithDb.install();

      // Assert
      expect(executeSpy).toHaveBeenCalledTimes(1);
      const sql = executeSpy.mock.calls[0][0] as string;
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS example_todos');
      expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_example_todos_tenant');
      expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_example_todos_user');
    });
  });

  describe('acceptDb()', () => {
    test('sets db and allows load() to create TodoService', async () => {
      // Arrange
      const pluginNoDb = createPlugin();
      const db = createMockDb();

      // Act
      pluginNoDb.acceptDb(db);
      await pluginNoDb.load();

      // Assert
      expect(pluginNoDb.isLoaded).toBe(true);
      expect(pluginNoDb.todos).toBeInstanceOf(TodoService);
    });
  });
});

describe("TodoService", () => {
  let service: TodoService;
  let db: any;

  beforeEach(() => {
    db = createMockDb();
    service = new TodoService(db);
  });

  describe("list()", () => {
    test("returns empty array when no todos exist", async () => {
      const result = await service.list();
      expect(result).toEqual([]);
    });

    test("returns created todos", async () => {
      await service.create({ title: "Buy milk", userId: "user-1" });
      await service.create({ title: "Write tests", userId: "user-1" });
      const result = await service.list();
      expect(result).toHaveLength(2);
    });
  });

  describe("create()", () => {
    test("creates a todo with default completed=false", async () => {
      const todo = await service.create({ title: "Buy milk", userId: "user-1" });
      expect(todo.title).toBe("Buy milk");
      expect(todo.userId).toBe("user-1");
      expect(todo.completed).toBe(false);
      expect(todo.id).toBeDefined();
      expect(typeof todo.id).toBe("string");
    });

    test("creates todos with unique ids", async () => {
      const a = await service.create({ title: "A", userId: "user-1" });
      const b = await service.create({ title: "B", userId: "user-1" });
      expect(a.id).not.toBe(b.id);
    });
  });

  describe("get()", () => {
    test("returns undefined for unknown id", async () => {
      expect(await service.get("nonexistent")).toBeUndefined();
    });

    test("returns created todo by id", async () => {
      const created = await service.create({ title: "Test", userId: "user-1" });
      const found = await service.get(created.id);
      expect(found).toBeDefined();
      expect(found!.title).toBe("Test");
    });
  });

  describe("update()", () => {
    test("returns undefined for unknown id", async () => {
      expect(await service.update("nonexistent", { title: "X" })).toBeUndefined();
    });

    test("updates todo title", async () => {
      const created = await service.create({ title: "Old title", userId: "user-1" });
      const updated = await service.update(created.id, { title: "New title" });
      expect(updated).toBeDefined();
      expect(updated!.title).toBe("New title");
    });

    test("updates todo completed status", async () => {
      const created = await service.create({ title: "Task", userId: "user-1" });
      expect(created.completed).toBe(false);
      const updated = await service.update(created.id, { completed: true });
      expect(updated!.completed).toBe(true);
    });

    test("partial update preserves existing fields", async () => {
      const created = await service.create({ title: "Task", userId: "user-1" });
      const updated = await service.update(created.id, { completed: true });
      expect(updated!.title).toBe("Task");
      expect(updated!.completed).toBe(true);
    });
  });

  describe("delete()", () => {
    test("returns false for unknown id", async () => {
      expect(await service.delete("nonexistent")).toBe(false);
    });

    test("removes todo and returns true", async () => {
      const created = await service.create({ title: "Task", userId: "user-1" });
      expect(await service.delete(created.id)).toBe(true);
      expect(await service.get(created.id)).toBeUndefined();
    });
  });

  describe("clear()", () => {
    test("removes all todos", async () => {
      await service.create({ title: "A", userId: "user-1" });
      await service.create({ title: "B", userId: "user-1" });
      expect(await service.list()).toHaveLength(2);
      await service.clear();
      expect(await service.list()).toEqual([]);
    });
  });
});

describe("createPlugin()", () => {
  test("creates independent instances with separate db", async () => {
    const dbA = createMockDb();
    const dbB = createMockDb();
    const a = createPlugin(dbA);
    const b = createPlugin(dbB);
    await a.load();
    await b.load();
    await a.todos!.create({ title: "In A", userId: "user-1" });
    expect(await a.todos!.list()).toHaveLength(1);
    expect(await b.todos!.list()).toHaveLength(0);
  });
});

describe("manifest", () => {
  test("has required fields", async () => {
    const { manifest } = await import("../index");
    expect(manifest.name).toBe("@audebase/plugin-example-todo");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.category).toBe("oa");
    expect(manifest.runtime.mode).toBe("inline");
    expect(manifest.runtime.partition).toBe("oa");
    expect(manifest.dependencies).toEqual([]);
    expect(manifest.lifecycle.autoInstall).toBe(false);
    expect(manifest.lifecycle.hooks.load).toBe("load");
  });
});
