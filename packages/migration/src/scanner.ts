// Migration scanner - discovers migration files in plugin directories

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { MigrationVersion } from './types.js'

const SEMVER_REGEX = /^\d+\.\d+\.\d+(?:-[\w.]+)?$/

export class MigrationScanner {
  private readonly searchPaths: string[]

  constructor(searchPaths: string[]) {
    this.searchPaths = searchPaths
  }

  async discoverMigrations(): Promise<Map<string, MigrationVersion[]>> {
    const result = new Map<string, MigrationVersion[]>()

    for (const basePath of this.searchPaths) {
      let pluginDirs: string[]
      try {
        pluginDirs = await fs.readdir(basePath)
      } catch {
        continue
      }

      for (const pluginDir of pluginDirs) {
        const pluginPath = path.join(basePath, pluginDir)

        // Read plugin directory to find 'migrations' subdirectory
        let pluginContents: string[]
        try {
          pluginContents = await fs.readdir(pluginPath)
        } catch {
          continue
        }

        if (!pluginContents.includes('migrations')) continue

        const migrationsPath = path.join(pluginPath, 'migrations')

        let versionDirs: string[]
        try {
          const stat = await fs.stat(migrationsPath)
          if (!stat.isDirectory()) continue
          versionDirs = await fs.readdir(migrationsPath)
        } catch {
          continue
        }

        const versions: MigrationVersion[] = []

        for (const versionDir of versionDirs) {
          if (!SEMVER_REGEX.test(versionDir)) continue

          const versionPath = path.join(migrationsPath, versionDir)
          try {
            const stat = await fs.stat(versionPath)
            if (!stat.isDirectory()) continue
          } catch {
            continue
          }

          let files: string[]
          try {
            files = await fs.readdir(versionPath)
          } catch {
            continue
          }

          const version: MigrationVersion = {
            version: versionDir,
            path: versionPath,
            files: {},
          }

          for (const file of files) {
            if (file === 'preload.sql') {
              version.files.preload = path.join(versionPath, file)
            } else if (file === 'postsync.sql') {
              version.files.postsync = path.join(versionPath, file)
            } else if (file === 'postload.sql') {
              version.files.postload = path.join(versionPath, file)
            }
          }

          versions.push(version)
        }

        // Sort versions ascending (SemVer)
        versions.sort((a, b) => compareSemVer(a.version, b.version))

        if (versions.length > 0) {
          const pluginName = `@audebase/${pluginDir}`
          result.set(pluginName, versions)
        }
      }
    }

    return result
  }
}

function compareSemVer(a: string, b: string): number {
  const partsA = (a.split('-')[0] ?? '0').split('.').map(Number)
  const partsB = (b.split('-')[0] ?? '0').split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const a = partsA[i] ?? 0
    const b = partsB[i] ?? 0
    const diff = a - b
    if (diff !== 0) return diff
  }
  return 0
}
