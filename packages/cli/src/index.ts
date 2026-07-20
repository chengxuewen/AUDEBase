#!/usr/bin/env node

// AUDEBase CLI entry point

import { Command } from 'commander'
import { runDev } from './commands/dev.js'
import { runMigrate } from './commands/migrate.js'
import { runPluginCreate } from './commands/plugin-create.js'
import { runBuild } from './commands/build.js'
import { runTest } from './commands/test.js'
import { runLint } from './commands/lint.js'
import { runPluginList } from './commands/plugin-list.js'
import { runPluginInfo } from './commands/plugin-info.js'
import { runPluginEnable } from './commands/plugin-enable.js'
import { runPluginDisable } from './commands/plugin-disable.js'
import { runPluginUpgrade } from './commands/plugin-upgrade.js'
import { runPluginScaffold } from './commands/plugin-scaffold.js'
import { runDoctor } from './commands/doctor.js'
export function createProgram(): Command {
  const program = new Command()

  program
    .name('aude')
    .description('AUDEBase CLI - Enterprise application platform')
    .version('0.1.0')

  program
    .command('dev')
    .description('Start development server (Core + Admin UI)')
    .option('-p, --port <number>', 'server port', '3000')
    .option('--inspect', 'enable Node.js inspector')
    .action(async (options) => {
      try {
        await runDev({ port: options.port, inspect: options.inspect })
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
        process.exit(1)
      }
    })

  program
    .command('db:migrate')
    .description('Run database migrations')
    .option('--dry-run', 'dry-run mode (no SQL executed)')
    .option('-p, --plugin <name>', 'migrate only specified plugin')
    .action(async (options) => {
      try {
        await runMigrate({ dryRun: options.dryRun, plugin: options.plugin })
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
        process.exit(1)
      }
    })

  program
    .command('plugin:create <name>')
    .description('Scaffold a new plugin')
    .action(async (name: string) => {
      try {
        await runPluginCreate(name)
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
        process.exit(1)
      }
    })

  program
    .command('build')
    .description('Build all packages (turbo)')
    .action(async () => {
      try {
        await runBuild()
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
        process.exit(1)
      }
    })

  program
    .command('test')
    .description('Run all tests')
    .option('-w, --watch', 'watch mode')
    .option('--coverage', 'coverage report')
    .action(async (options) => {
      try {
        await runTest({ watch: options.watch, coverage: options.coverage })
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
        process.exit(1)
      }
    })

  program
    .command('lint')
    .description('Run linter (tsc --noEmit)')
    .action(async () => {
      try {
        await runLint()
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
        process.exit(1)
      }
    })

  program
    .command('plugin:list')
    .description('List system plugins')
    .action(async () => {
      try {
        await runPluginList()
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
        process.exit(1)
      }
    })

  program
    .command('plugin:info <name>')
    .description('Show plugin details')
    .action(async (name: string) => {
      try {
        await runPluginInfo(name)
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
        process.exit(1)
      }
    })

  program
    .command('plugin:enable <name>')
    .description('Enable a plugin')
    .action(async (name: string) => {
      try {
        await runPluginEnable(name)
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
        process.exit(1)
      }
    })

  program
    .command('plugin:disable <name>')
    .description('Disable a plugin')
    .action(async (name: string) => {
      try {
        await runPluginDisable(name)
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
        process.exit(1)
      }
    })

  program
    .command('plugin:upgrade <name>')
    .description('Upgrade a plugin (run migrations + update version)')
    .action(async (name: string) => {
      try {
        await runPluginUpgrade(name)
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
        process.exit(1)
      }
    })

  program
    .command('plugin:scaffold <name>')
    .description('Generate plugin skeleton with templates')
    .option('--partition <name>', 'plugin partition', 'oa')
    .option('--mode <mode>', 'runtime mode (inline|process|container)', 'inline')
    .option('--with-models', 'include model migration templates')
    .action(async (name: string, options) => {
      try {
        runPluginScaffold(name, {
          partition: options.partition,
          mode: options.mode,
          withModels: options.withModels,
        })
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
        process.exit(1)
      }
    })

  program
    .command('doctor')
    .description('Run health checks (manifests, tsc, vitest, i18n)')
    .action(async () => {
      try {
        await runDoctor()
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
        process.exit(1)
      }
    })

  return program
}

export const program = createProgram()

// Only parse argv when run directly (not when imported in tests)
const isDirectRun = process.argv[1] !== undefined &&
  (process.argv[1].endsWith('cli/src/index.ts') ||
   process.argv[1].endsWith('cli/src/index.js') ||
   process.argv[1].endsWith('aude'))

if (isDirectRun) {
  program.parse(process.argv)
}
