import { pgTable, uuid, varchar, boolean, timestamp, index } from "drizzle-orm/pg-core";

/**
 * example_todos — Todo items table for the example plugin.
 *
 * Demonstrates the standard AUDEBase Drizzle schema pattern:
 * uuid PK, tenant_id for multi-tenant isolation, and standard timestamps.
 */
export const exampleTodos = pgTable(
  "example_todos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 255 }).notNull(),
    completed: boolean("completed").default(false),
    user_id: uuid("user_id").notNull(),
    tenant_id: uuid("tenant_id"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_example_todos_tenant").on(table.tenant_id),
    index("idx_example_todos_user").on(table.user_id),
  ],
);

export type Todo = typeof exampleTodos.$inferSelect;
export type NewTodo = typeof exampleTodos.$inferInsert;
