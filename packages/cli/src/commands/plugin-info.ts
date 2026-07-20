// aude plugin:info <name> - Show plugin details
// ponytail: uses mock-db, real DB when available in Phase 1b

interface PluginRow {
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
}

export async function runPluginInfo(name: string): Promise<void> {
  try {
    const { createMockDb } = await import('../mock-db.js')
    const db = createMockDb()

    const row = await db.query.modules.findFirst({ where: { name } }) as PluginRow | undefined

    if (!row) {
      process.stderr.write(`Plugin not found: ${name}\n`)
      process.exit(1)
    }

    process.stdout.write(`Name:        ${row.name}\n`)
    process.stdout.write(`Version:     ${row.version}\n`)
    process.stdout.write(`Display:     ${row.display_name}\n`)
    process.stdout.write(`State:       ${row.state}\n`)
    process.stdout.write(`Category:    ${row.category ?? '-'}\n`)
    process.stdout.write(`Mode:        ${row.runtime_mode}\n`)
    process.stdout.write(`Partition:   ${row.runtime_partition}\n`)
    process.stdout.write(`Auto-Install: ${row.auto_install ? 'yes' : 'no'}\n`)
    process.stdout.write(`Manifest:    ${row.manifest_path ?? '-'}\n`)
    if (row.description) {
      process.stdout.write(`Description: ${row.description}\n`)
    }
    if (row.author) {
      process.stdout.write(`Author:      ${row.author}\n`)
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    process.stderr.write(`Error: ${msg}\n`)
    process.exit(1)
  }
}
