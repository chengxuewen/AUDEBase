// ponytail: in-memory arrays; real DB when available in Phase 1b

interface ModuleRow {
  id: string
  name: string
  version: string
  display_name: string
  state: string
  category: string | null
  description: string | null
  author: string | null
  runtime_mode: string
  runtime_partition: string
  auto_install: boolean
  manifest_path: string | null
  tenant_id: string | null
}

// Seed data: common mock system plugins
const seedModules: ModuleRow[] = [
  {
    id: 'mod-001',
    name: '@audebase/plugin-core',
    version: '1.0.0',
    display_name: 'Core',
    state: 'loaded',
    category: 'system',
    description: 'Core system plugin',
    author: 'AUDEBase Team',
    runtime_mode: 'inline',
    runtime_partition: 'SYSTEM',
    auto_install: true,
    manifest_path: 'packages/core/manifest.yaml',
    tenant_id: null,
  },
  {
    id: 'mod-002',
    name: '@audebase/plugin-rbac',
    version: '1.0.0',
    display_name: 'RBAC',
    state: 'loaded',
    category: 'security',
    description: 'Role-based access control',
    author: 'AUDEBase Team',
    runtime_mode: 'inline',
    runtime_partition: 'SYSTEM',
    auto_install: true,
    manifest_path: 'packages/rbac/manifest.yaml',
    tenant_id: null,
  },
  {
    id: 'mod-003',
    name: '@audebase/plugin-audit',
    version: '0.1.0',
    display_name: 'Audit Log',
    state: 'disabled',
    category: 'security',
    description: 'Audit logging',
    author: 'AUDEBase Team',
    runtime_mode: 'inline',
    runtime_partition: 'SYSTEM',
    auto_install: false,
    manifest_path: 'packages/audit/manifest.yaml',
    tenant_id: null,
  },
]

export interface MockDatabaseProvider {
  execute(sql: string): Promise<unknown>
  insert(table: string, data: Record<string, unknown>): Promise<unknown>
  query: {
    migration_history: {
      findMany(): Promise<Array<{ moduleId: string; version: string }>>
    }
    modules: {
      findMany(opts?: {
        where?: { name?: string; tenant_id?: null }
      }): Promise<ModuleRow[]>
      findFirst(opts: { where: { name: string } }): Promise<ModuleRow | undefined>
    }
  }
  update(table: string): {
    set: (data: Record<string, unknown>) => {
      where: (conditions: Record<string, unknown>) => Promise<ModuleRow[]>
    }
  }
}

export function createMockDb(): MockDatabaseProvider {
  const modules = seedModules.map((m) => ({ ...m }))

  return {
    execute: async (_sql: string) => undefined,
    insert: async (_table: string, _data: Record<string, unknown>) => undefined,
    query: {
      migration_history: {
        findMany: async () => [],
      },
      modules: {
        findMany: async (opts?: { where?: { name?: string; tenant_id?: null } }) => {
          if (opts?.where?.name) {
            return modules.filter((m: ModuleRow) => m.name === opts.where!.name)
          }
          if (opts?.where?.tenant_id === null) {
            return modules.filter((m: ModuleRow) => m.tenant_id === null)
          }
          return modules
        },
        findFirst: async (opts: { where: { name: string } }) => {
          return modules.find((m: ModuleRow) => m.name === opts.where.name)
        },
      },
    },
    update: (table: string) => ({
      set: (data: Record<string, unknown>) => ({
        where: async (conditions: Record<string, unknown>) => {
          if (table !== 'modules') return []
          const matched = modules.filter((m: ModuleRow) =>
            Object.entries(conditions).every(([k, v]) => (m as unknown as Record<string, unknown>)[k] === v),
          )
          for (const mod of matched) {
            Object.assign(mod, data)
          }
          return matched
        },
      }),
    }),
  }
}
