// Mock DatabaseProvider for CLI usage (no real DB connection in Phase 1a)

import type { DatabaseProvider } from '@audebase/migration'

export function createMockDb(): DatabaseProvider {
  return {
    execute: async (_sql: string) => undefined,
    insert: async (_table: string, _data: Record<string, unknown>) => undefined,
    query: {
      migration_history: {
        findMany: async () => [],
      },
    },
  }
}
