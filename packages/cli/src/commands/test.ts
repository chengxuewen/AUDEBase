// aude test - Run all tests

import { execSync } from 'node:child_process'
import type { TestCommandOptions } from '../types.js'

export async function runTest(options: TestCommandOptions): Promise<void> {
  const args: string[] = ['npx vitest run']

  if (options.watch === true) {
    args[0] = 'npx vitest'
  }

  if (options.coverage === true) {
    args.push('--coverage')
  }

  console.log('Running tests...')
  try {
    execSync(args.join(' '), { stdio: 'inherit', cwd: process.cwd() })
    console.log('Tests passed.')
  } catch (error) {
    throw new Error(`Tests failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
