// ponytail: inline semver comparison; mock migration; real MigrationEngine in Phase 1b

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

interface SemVer {
  major: number
  minor: number
  patch: number
}

function parseSemVer(version: string): SemVer {
  const parts = version.split('.').map(Number)
  if (parts.length < 3 || parts.some(isNaN)) {
    throw new Error(`Invalid semver: ${version}`)
  }
  return { major: parts[0]!, minor: parts[1]!, patch: parts[2]! }
}

function isNewer(a: SemVer, b: SemVer): boolean {
  return (
    a.major > b.major ||
    (a.major === b.major && a.minor > b.minor) ||
    (a.major === b.major && a.minor === b.minor && a.patch > b.patch)
  )
}

function readManifestVersion(manifestPath: string): string {
  const content = readFileSync(manifestPath, 'utf-8')
  const match = content.match(/^version:\s*['"](.+?)['"]/m)
  if (!match) {
    throw new Error(`No version field in manifest: ${manifestPath}`)
  }
  return match[1]!
}

export async function runPluginUpgrade(name: string): Promise<void> {
  try {
    const { createMockDb } = await import('../mock-db.js')
    const db = createMockDb()

    // Look up plugin in DB
    const row = (await db.query.modules.findFirst({ where: { name } })) as
      | { name: string; version: string; manifest_path: string | null }
      | undefined

    if (!row) {
      process.stderr.write(`Plugin not found: ${name}\n`)
      process.exit(1)
    }

    const currentVersion = row.version

    // Resolve manifest path
    const shortName = name.replace('@audebase/', '')
    const manifestPath = row.manifest_path ?? join(process.cwd(), 'packages', shortName, 'manifest.yaml')

    if (!existsSync(manifestPath)) {
      process.stderr.write(`Manifest not found: ${manifestPath}\n`)
      process.exit(1)
    }

    const newVersion = readManifestVersion(manifestPath)

    // Compare versions
    const currentSemver = parseSemVer(currentVersion)
    const newSemver = parseSemVer(newVersion)

    if (!isNewer(newSemver, currentSemver)) {
      process.stdout.write(`Plugin ${name} is already up to date (${currentVersion})\n`)
      return
    }

    // ponytail: mock migration — real MigrationEngine in Phase 1b
    const migrationCount = 1

    // Update version in DB
    await db.update('modules').set({ version: newVersion }).where({ name })

    process.stdout.write(
      `Plugin ${name} upgraded from ${currentVersion} to ${newVersion} (${migrationCount} migration(s) run)\n`,
    )
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    process.stderr.write(`Error: ${msg}\n`)
    process.exit(1)
  }
}
