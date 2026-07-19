/**
 * plugin-example-todo — Example plugin demonstrating the AUDEBase plugin framework.
 *
 * Implements PluginInstance interface and exports a todos CRUD service mock.
 * Category: oa  |  Partition: oa  |  Mode: inline
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A todo item managed by this plugin */
export interface TodoItem {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
  readonly userId: string;
}

/** Input for creating a new todo */
export interface TodoCreateInput {
  title: string;
  userId: string;
}

/** Input for updating an existing todo */
export interface TodoUpdateInput {
  title?: string;
  completed?: boolean;
}

// ---------------------------------------------------------------------------
// TodoService — in-memory CRUD mock
// ---------------------------------------------------------------------------

/**
 * In-memory todo service.
 * Phase 1a mock — uses Map for storage. No persistence.
 */
export class TodoService {
  private todos: Map<string, TodoItem> = new Map();

  /** List all todos (ponytail: no pagination for example plugin) */
  list(): readonly TodoItem[] {
    return [...this.todos.values()];
  }

  /** Get a single todo by id */
  get(id: string): TodoItem | undefined {
    return this.todos.get(id);
  }

  /** Create a new todo */
  create(input: TodoCreateInput): TodoItem {
    const id = crypto.randomUUID();
    const todo: TodoItem = {
      id,
      title: input.title,
      completed: false,
      userId: input.userId,
    };
    this.todos.set(id, todo);
    return todo;
  }

  /** Update an existing todo */
  update(id: string, input: TodoUpdateInput): TodoItem | undefined {
    const existing = this.todos.get(id);
    if (!existing) return undefined;

    const updated: TodoItem = {
      ...existing,
      title: input.title ?? existing.title,
      completed: input.completed ?? existing.completed,
    };
    this.todos.set(id, updated);
    return updated;
  }

  /** Delete a todo */
  delete(id: string): boolean {
    return this.todos.delete(id);
  }

  /** Delete all todos — used in tests */
  clear(): void {
    this.todos.clear();
  }
}

// ---------------------------------------------------------------------------
// ExamplePlugin — implements PluginInstance shape
// ---------------------------------------------------------------------------

/**
 * Example plugin class implementing the PluginInstance contract.
 *
 * The PluginManager calls load() when the plugin is loaded.
 * Phase 1a: only load() is required; other hooks are optional.
 */
export class ExamplePlugin {
  readonly name = "@audebase/plugin-example-todo";
  readonly todos: TodoService = new TodoService();

  private loaded = false;

  /** Required lifecycle hook — loaded by PluginManager */
  load(): Promise<void> {
    this.loaded = true;
  }

  /** Optional install hook */
  async install(): Promise<void> {
    // ponytail: no install steps needed for in-memory mock
  }

  /** Whether the plugin has been loaded */
  get isLoaded(): boolean {
    return this.loaded;
  }
}

// ---------------------------------------------------------------------------
// Exports — plugin contract
// ---------------------------------------------------------------------------

/** Manifest metadata consumed by PluginManager */
export const manifest = {
  name: "@audebase/plugin-example-todo",
  version: "0.1.0",
  displayName: "Example Todo",
  description:
    "Example plugin demonstrating the AUDEBase plugin framework with a simple todo model",
  category: "oa" as const,
  dependencies: [] as string[],
  runtime: {
    mode: "inline" as const,
    partition: "oa" as const,
  },
  lifecycle: {
    autoInstall: false,
    hooks: {
      load: "load",
      install: "install",
    },
  },
};

/**
 * Plugin factory — creates a new instance for the PluginManager.
 * Each plugin gets its own TodoService instance.
 */
export function createPlugin(): ExamplePlugin {
  return new ExamplePlugin();
}
