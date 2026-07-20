import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export interface ScaffoldOptions {
  readonly partition?: string
  readonly mode?: string
  readonly withModels?: boolean
}

function toClassName(name: string): string {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

export function runPluginScaffold(name: string, options?: ScaffoldOptions): void {
  if (!name || !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(name)) {
    process.stderr.write(
      'Invalid plugin name. Use lowercase letters, digits, and hyphens. Must start and end with alphanumeric.\n',
    )
    process.exit(1)
  }

  const partition = options?.partition ?? 'oa'
  const mode = options?.mode ?? 'inline'
  const withModels = options?.withModels ?? false
  const pkgName = `@audebase/plugin-${name}`
  const dir = join(process.cwd(), 'packages', name)

  if (existsSync(dir)) {
    process.stderr.write(`ERROR: directory already exists: ${dir}\n`)
    process.exit(1)
  }

  mkdirSync(join(dir, 'src'), { recursive: true })
  mkdirSync(join(dir, 'locale'), { recursive: true })

  const manifest = [
    `name: "${pkgName}"`,
    `version: "0.1.0"`,
    `display_name: "${name}"`,
    `description: "Plugin: ${name}"`,
    `category: "${partition}"`,
    `license: "Apache-2.0"`,
    '',
    'application:',
    '  entry: "./src/index.ts"',
    '  author: "AUDEBase Team"',
    '',
    'dependencies: []',
    '',
    'lifecycle:',
    '  auto_install: false',
    '',
    'runtime:',
    `  mode: ${mode}`,
    `  partition: ${partition}`,
    '  crash_policy: restart',
    '',
    'security:',
    '  db_namespace: "public"',
    '',
    'permissions: []',
  ].join('\n') + '\n'

  const pkgJson = JSON.stringify(
    {
      name: pkgName,
      version: '0.1.0',
      private: true,
      type: 'module',
      main: './src/index.ts',
      types: './src/index.ts',
      exports: { '.': './src/index.ts' },
      scripts: {
        build: 'tsc --noEmit',
        'type-check': 'tsc --noEmit',
        test: 'vitest run',
        'test:watch': 'vitest',
        'test:coverage': 'vitest run --coverage',
        clean: 'rm -rf dist',
      },
      dependencies: {
        '@audebase/plugin-framework': 'workspace:*',
        '@audebase/shared-types': 'workspace:*',
      },
      devDependencies: {
        '@types/node': '^22.0.0',
        typescript: '^5.7.0',
        vitest: '^3.0.0',
      },
    },
    null,
    2,
  ) + '\n'

  const tsconfig = JSON.stringify(
    {
      extends: '../../tsconfig.base.json',
      compilerOptions: { outDir: './dist', rootDir: './src' },
      include: ['src'],
    },
    null,
    2,
  ) + '\n'

  const vitestConfig = [
    'import { defineConfig } from "vitest/config";',
    '',
    'export default defineConfig({',
    '  test: {',
    `    name: "${name}",`,
    '    globals: true,',
    '    environment: "node",',
    '    include: ["src/**/*.test.ts"],',
    '    coverage: {',
    '      provider: "v8",',
    '      reporter: ["text", "json", "html", "lcov"],',
    '      include: ["src/**/*.ts"],',
    '      exclude: ["src/**/*.test.ts", "src/__tests__/**"],',
    '      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },',
    '    },',
    '  },',
    '});',
    '',
  ].join('\n')

  const className = toClassName(name) + 'Plugin'

  const indexTs = [
    `/**`,
    ` * ${pkgName} — Generated plugin.`,
    ` *`,
    ` * Category: ${partition}  |  Partition: ${partition}  |  Mode: ${mode}`,
    ` */`,
    '',
    'export class ' + className + ' {',
    `  readonly name = "${pkgName}";`,
    '',
    '  private loaded = false;',
    '  private installed = false;',
    '  private enabled = false;',
    '',
    '  async afterAdd(): Promise<void> {}',
    '  async beforeLoad(): Promise<void> {}',
    '',
    '  async load(): Promise<void> {',
    '    this.loaded = true;',
    '  }',
    '',
    '  async install(): Promise<void> {',
    '    this.installed = true;',
    '  }',
    '',
    '  async afterEnable(): Promise<void> {',
    '    this.enabled = true;',
    '  }',
    '',
    '  async afterDisable(): Promise<void> {',
    '    this.enabled = false;',
    '  }',
    '',
    '  async preUninstall(): Promise<void> {}',
    '',
    '  get isLoaded(): boolean { return this.loaded; }',
    '  get isInstalled(): boolean { return this.installed; }',
    '  get isEnabled(): boolean { return this.enabled; }',
    '}',
    '',
    'export function createPlugin(): ' + className + ' {',
    '  return new ' + className + '();',
    '}',
    '',
  ].join('\n')

  writeFileSync(join(dir, 'manifest.yaml'), manifest)
  writeFileSync(join(dir, 'package.json'), pkgJson)
  writeFileSync(join(dir, 'tsconfig.json'), tsconfig)
  writeFileSync(join(dir, 'vitest.config.ts'), vitestConfig)
  writeFileSync(join(dir, 'src', 'index.ts'), indexTs)
  writeFileSync(join(dir, 'locale', 'zh-CN.json'), '{}\n')
  writeFileSync(join(dir, 'locale', 'en-US.json'), '{}\n')

  if (withModels) {
    const migrationsDir = join(dir, 'migrations', '0.1.0')
    mkdirSync(migrationsDir, { recursive: true })
    writeFileSync(join(migrationsDir, 'preload.sql'), '-- Migration: 0.1.0 preload\n\n')
  }

  process.stdout.write(`Plugin scaffolded: ${dir}\n`)
}
