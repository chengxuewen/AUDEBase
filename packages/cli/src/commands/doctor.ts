// aude doctor - Health checks (manifests, tsc, vitest, i18n)
// ponytail: direct fs/execSync checks, no deps needed

import * as fs from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

interface DoctorResult {
  readonly label: string
  readonly ok: boolean
  readonly detail: string
}

function checkManifests(): DoctorResult {
  const packagesDir = join(process.cwd(), 'packages')
  const errors: string[] = []

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(packagesDir, { withFileTypes: true })
  } catch {
    return { label: 'manifests', ok: false, detail: 'cannot read packages directory' }
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const manifestPath = join(packagesDir, entry.name, 'manifest.yaml')
    if (!fs.existsSync(manifestPath)) continue

    try {
      const content = fs.readFileSync(manifestPath, 'utf-8')
      if (!content.includes('name:') || !content.includes('version:')) {
        errors.push(`${entry.name}: missing required fields (name, version)`)
      }
    } catch {
      errors.push(`${entry.name}: cannot read`)
    }
  }

  if (errors.length > 0) {
    return { label: 'manifests', ok: false, detail: errors.join('; ') }
  }
  return { label: 'manifests', ok: true, detail: 'all valid' }
}

function checkI18n(): DoctorResult {
  const packagesDir = join(process.cwd(), 'packages')
  const errors: string[] = []

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(packagesDir, { withFileTypes: true })
  } catch {
    return { label: 'i18n', ok: true, detail: 'no locale files to check' }
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const localeDir = join(packagesDir, entry.name, 'locale')
    if (!fs.existsSync(localeDir)) continue

    const files = fs.readdirSync(localeDir).filter((f) => f.endsWith('.json'))
    if (files.length < 2) continue

    const keysPerFile = new Map<string, Set<string>>()
    for (const f of files) {
      try {
        const data = JSON.parse(fs.readFileSync(join(localeDir, f), 'utf-8')) as Record<string, unknown>
        keysPerFile.set(f, new Set(Object.keys(data)))
      } catch {
        errors.push(`${entry.name}: cannot parse ${f}`)
      }
    }

    if (keysPerFile.size < 2) continue

    const allKeys = [...keysPerFile.entries()]
    const [, refKeys] = allKeys[0]!
    for (let i = 1; i < allKeys.length; i++) {
      const [currentFile, currentKeys] = allKeys[i]!

      const missingInCurrent = [...refKeys].filter((k) => !currentKeys.has(k))
      const extraInCurrent = [...currentKeys].filter((k) => !refKeys.has(k))

      if (missingInCurrent.length > 0) {
        errors.push(`${entry.name}/${currentFile}: missing keys [${missingInCurrent.join(', ')}]`)
      }
      if (extraInCurrent.length > 0) {
        errors.push(`${entry.name}/${currentFile}: extra keys [${extraInCurrent.join(', ')}]`)
      }
    }
  }

  if (errors.length > 0) {
    return { label: 'i18n', ok: false, detail: errors.join('; ') }
  }
  return { label: 'i18n', ok: true, detail: 'keys match' }
}

export async function runDoctor(): Promise<void> {
  const results: DoctorResult[] = []

  // a) manifest check
  results.push(checkManifests())

  // b) TypeScript check
  try {
    execSync('npx tsc --noEmit', {
      cwd: process.cwd(),
      stdio: 'pipe',
      encoding: 'utf-8',
    })
    results.push({ label: 'typescript', ok: true, detail: 'no errors' })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const short = msg.slice(0, 200).replace(/\n/g, ' ')
    results.push({ label: 'typescript', ok: false, detail: short })
  }

  // c) Test check
  try {
    execSync('npx vitest run', {
      cwd: process.cwd(),
      stdio: 'pipe',
      encoding: 'utf-8',
      timeout: 120_000,
    })
    results.push({ label: 'tests', ok: true, detail: 'all passing' })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const short = msg.slice(0, 200).replace(/\n/g, ' ')
    results.push({ label: 'tests', ok: false, detail: short })
  }

  // d) i18n check
  results.push(checkI18n())

  // Report
  let hasFailure = false
  for (const r of results) {
    const mark = r.ok ? '\u2713' : '\u2717'
    process.stdout.write(`  ${mark} ${r.label}: ${r.detail}\n`)
    if (!r.ok) hasFailure = true
  }

  if (hasFailure) {
    process.stdout.write('\nDoctor checks failed.\n')
    process.exit(1)
  }

  process.stdout.write('\nAll checks passed.\n')
}
