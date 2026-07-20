/**
 * Local type definitions for @audebase/plugin-core
 *
 * DatabaseProvider is defined locally because @audebase/core is not yet implemented.
 * Once core provides the real DatabaseProvider, this can be swapped.
 */

/** Permissive DB interface matching Drizzle's query API shape used in tests */
export interface DatabaseProvider {
  query: {
    users: {
      findFirst: (args?: unknown) => Promise<unknown>
    }
    roles: {
      findFirst: (args?: unknown) => Promise<unknown>
    }
    tenants: {
      findFirst: (args?: unknown) => Promise<unknown>
    }
    modules: {
      findFirst: (args?: unknown) => Promise<unknown>
    }
  }
  insert: (args: unknown) => unknown
  update: (args: unknown) => unknown
  delete: (args: unknown) => unknown
}
