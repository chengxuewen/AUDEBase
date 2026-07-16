/**
 * Local type definitions for @audebase/audit
 *
 * DatabaseProvider is defined locally because @audebase/core is not yet implemented.
 * Once core provides the real DatabaseProvider, this can be swapped.
 */

/** Permissive DB interface matching Drizzle's query API shape used in tests */
export interface DatabaseProvider {
  query: {
    audit_log: {
      findMany: (args?: unknown) => Promise<unknown[]>
    }
  }
  insert: (table: unknown) => { values: (entry: unknown) => Promise<unknown> }
}
