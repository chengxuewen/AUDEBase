// aude plugin:enable <name> - Enable plugin (state=loaded)
// ponytail: uses mock-db, real DB when available in Phase 1b

export async function runPluginEnable(name: string): Promise<void> {
  try {
    const { createMockDb } = await import('../mock-db.js')
    const db = createMockDb()

    const result = await db.update('modules').set({ state: 'loaded' }).where({ name })

    if (result.length === 0) {
      process.stderr.write(`Plugin not found: ${name}\n`)
      process.exit(1)
    }

    process.stdout.write(`Plugin ${name} enabled (state: loaded)\n`)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    process.stderr.write(`Error: ${msg}\n`)
    process.exit(1)
  }
}
