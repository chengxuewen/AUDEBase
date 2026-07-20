/**
 * plugin-example-todo — Example plugin demonstrating the AUDEBase plugin framework.
 *
 * Implements PluginInstance interface and exports a Drizzle-based todos CRUD service.
 * Category: oa  |  Partition: oa  |  Mode: inline
 */
import { eq } from "drizzle-orm";
import { exampleTodos } from "./db/schema";

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
// TodoService — Drizzle-based CRUD
// ---------------------------------------------------------------------------

/**
 * Todo service backed by Drizzle ORM.
 * Accepts a Drizzle database instance via constructor injection.
 * All methods are async and return Promises.
 */
export class TodoService {
  // ponytail: any type for db — exact Drizzle PgDatabase generic is unwieldy for an example plugin
  private readonly db: any;

  constructor(db: any) {
    this.db = db;
  }

  /** List all todos (ponytail: no pagination for example plugin) */
  async list(): Promise<readonly TodoItem[]> {
    const rows = await this.db.select().from(exampleTodos);
    return rows.map(rowToItem);
  }

  /** Get a single todo by id */
  async get(id: string): Promise<TodoItem | undefined> {
    const rows = await this.db.select().from(exampleTodos).where(eq(exampleTodos.id, id)).limit(1);
    return rows.length > 0 ? rowToItem(rows[0]) : undefined;
  }

  /** Create a new todo */
  async create(input: TodoCreateInput): Promise<TodoItem> {
    const rows = await this.db
      .insert(exampleTodos)
      .values({
        title: input.title,
        user_id: input.userId,
        completed: false,
      })
      .returning();
    return rowToItem(rows[0]);
  }

  /** Update an existing todo */
  async update(id: string, input: TodoUpdateInput): Promise<TodoItem | undefined> {
    const existing = await this.get(id);
    if (!existing) return undefined;

    const updates: Record<string, unknown> = { updated_at: new Date() };
    if (input.title !== undefined) updates.title = input.title;
    if (input.completed !== undefined) updates.completed = input.completed;

    const rows = await this.db
      .update(exampleTodos)
      .set(updates)
      .where(eq(exampleTodos.id, id))
      .returning();
    return rows.length > 0 ? rowToItem(rows[0]) : undefined;
  }

  /** Delete a todo */
  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(exampleTodos).where(eq(exampleTodos.id, id));
    return result.rowCount > 0;
  }

  /** Delete all todos — used in tests */
  async clear(): Promise<void> {
    await this.db.delete(exampleTodos);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map a Drizzle row to a TodoItem interface */
function rowToItem(row: Record<string, unknown>): TodoItem {
  return {
    id: row.id as string,
    title: row.title as string,
    completed: (row.completed as boolean) ?? false,
    userId: row.user_id as string,
  };
}

// ---------------------------------------------------------------------------
// ExamplePlugin — implements PluginInstance shape
// ---------------------------------------------------------------------------

/**
 * Example plugin class implementing the PluginInstance contract.
 *
 * The PluginManager calls load() when the plugin is loaded.
 * Accepts a Drizzle database instance via acceptDb() for DI.
 * Phase 1a: only load() is required; other hooks are optional.
 */
export class ExamplePlugin {
  readonly name = "@audebase/plugin-example-todo";

  private db: any | null = null;
  todos: TodoService | null = null;

  private loaded = false;

  /** Set the database instance (dependency injection) */
  acceptDb(db: any): void {
    this.db = db;
  }

  /** Required lifecycle hook — loaded by PluginManager */
  async load(): Promise<void> {
    if (this.db) {
      this.todos = new TodoService(this.db);
    }
    this.loaded = true;
  }

  /** Optional install hook — runs migration SQL if db is available */
  async install(): Promise<void> {
    if (!this.db) return;

    const migrationSQL = `
      CREATE TABLE IF NOT EXISTS example_todos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(255) NOT NULL,
        completed BOOLEAN NOT NULL DEFAULT FALSE,
        user_id UUID NOT NULL,
        tenant_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_example_todos_tenant ON example_todos (tenant_id);
      CREATE INDEX IF NOT EXISTS idx_example_todos_user ON example_todos (user_id);
    `;
    await this.db.execute(migrationSQL);
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
  version: "0.2.0",
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
 * Optionally accepts a Drizzle database instance for DI.
 */
export function createPlugin(db?: any): ExamplePlugin {
  const plugin = new ExamplePlugin();
  if (db) {
    plugin.acceptDb(db);
  }
  return plugin;
}
