// aude plugin:create <name> - Scaffold a new plugin

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

const PLUGIN_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/

const MANIFEST_TEMPLATE = `# Plugin manifest for {NAME}
name: '@audebase/plugin-{NAME}'
version: '0.1.0'
display_name: '{DISPLAY_NAME}'
description: '{DISPLAY_NAME} plugin'
category: general
license: Apache-2.0
application: false
entry: './src/index.ts'
author:
  name: ''

dependencies: []

runtime:
  mode: inline
  partition: isolated

lifecycle:
  crash_policy: disable
  migration_version: '0.1.0'

security:
  db_namespace: '{NAME}'

exports: []
provides: []
permissions: []
models: []
locale:
  path: './locale'
data: []
auto_install: false
`

const PACKAGE_JSON_TEMPLATE = `{
  "name": "@audebase/plugin-{NAME}",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "build": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@audebase/shared-types": "workspace:*",
    "@audebase/core": "workspace:*"
  }
}
`

const ENTRY_TEMPLATE = `// Plugin entry point for {NAME}

import type { Plugin, PluginContext } from '@audebase/shared-types'

export class Plugin{name} implements Plugin {
  readonly name = '@audebase/plugin-{NAME}'
  readonly version = '0.1.0'

  async load(_ctx: PluginContext): Promise<void> {
    // Plugin load logic
  }

  async unload(): Promise<void> {
    // Plugin unload logic
  }
}
`

function toPascalCase(name: string): string {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

function toDisplayName(name: string): string {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export async function runPluginCreate(name: string, baseDir?: string): Promise<void> {
  // Validate plugin name
  if (!PLUGIN_NAME_PATTERN.test(name)) {
    throw new Error(
      `Invalid plugin name: "${name}". Only lowercase letters, digits, and hyphens are allowed. Must start and end with alphanumeric.`,
    )
  }

  const root = baseDir ?? process.cwd()
  const pluginDir = join(root, 'plugins', name)

  if (existsSync(pluginDir)) {
    throw new Error(`Plugin directory already exists: ${pluginDir}`)
  }

  // Create directory structure
  await mkdir(join(pluginDir, 'src'), { recursive: true })
  await mkdir(join(pluginDir, 'migrations'), { recursive: true })
  await mkdir(join(pluginDir, 'locale'), { recursive: true })

  // Write manifest.yaml
  const manifest = MANIFEST_TEMPLATE
    .replaceAll('{NAME}', name)
    .replaceAll('{DISPLAY_NAME}', toDisplayName(name))
  await writeFile(join(pluginDir, 'manifest.yaml'), manifest, 'utf-8')

  // Write package.json
  const pkgJson = PACKAGE_JSON_TEMPLATE.replaceAll('{NAME}', name)
  await writeFile(join(pluginDir, 'package.json'), pkgJson, 'utf-8')

  // Write src/index.ts
  const entry = ENTRY_TEMPLATE
    .replaceAll('{NAME}', name)
    .replaceAll('{name}', toPascalCase(name))
  await writeFile(join(pluginDir, 'src', 'index.ts'), entry, 'utf-8')

  console.log(`Plugin scaffolded: plugins/${name}/`)
  console.log('  manifest.yaml')
  console.log('  package.json')
  console.log('  src/index.ts')
  console.log('  migrations/')
  console.log('  locale/')
}
