// aude lint - Run linter (tsc --noEmit)

import { execSync } from 'node:child_process'

export async function runLint(): Promise<void> {
  console.log('Running linter...')
  try {
    execSync('npx tsc --noEmit', { stdio: 'inherit', cwd: process.cwd() })
    console.log('Lint complete.')
  } catch (error) {
    throw new Error(`Lint failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
