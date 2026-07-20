// aude plugin:disable <name> - Disable plugin (state=disabled)
// ponytail: uses mock-db, real DB when available in Phase 1b

export async function runPluginDisable(name: string): Promise<void> {
  try {
    const { createMockDb } = await import('../mock-db.js')
    const db = createMockDb()

    const result = await db.update('modules').set({ state: 'disabled' }).where({ name })

    if (result.length === 0) {
      process.stderr.write(`Plugin not found: ${name}\n`)
      process.exit(1)
    }

    process.stdout.write(`Plugin ${name} disabled (state: disabled)\n`)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    process.stderr.write(`Error: ${msg}\n`)
    process.exit(1)
  }
}
