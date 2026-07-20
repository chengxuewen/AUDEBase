// aude plugin:list - List system plugins from DB
// ponytail: uses mock-db, real DB when available in Phase 1b

interface PluginRow {
  id: string
  name: string
  version: string
  display_name: string
  state: string
}

export async function runPluginList(): Promise<void> {
  try {
    const { createMockDb } = await import('../mock-db.js')
    const db = createMockDb()

    const rows = await db.query.modules.findMany({ where: { tenant_id: null } }) as PluginRow[]

    if (rows.length === 0) {
      process.stdout.write('No system plugins found.\n')
      return
    }

    // Header
    process.stdout.write('ID'.padEnd(38) + '  ' + 'Name'.padEnd(32) + '  State\n')
    process.stdout.write('─'.repeat(80) + '\n')

    for (const row of rows) {
      process.stdout.write(`${row.id}  ${row.name.padEnd(32)}  ${row.state}\n`)
    }

    process.stdout.write(`\n${rows.length} plugin(s) total.\n`)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    process.stderr.write(`Error: ${msg}\n`)
    process.exit(1)
  }
}
