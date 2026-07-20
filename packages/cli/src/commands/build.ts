// aude build - Build all packages (turbo)

import { execSync } from 'node:child_process'

export async function runBuild(): Promise<void> {
  console.log('Building all packages...')
  try {
    execSync('npx turbo build', { stdio: 'inherit', cwd: process.cwd() })
    console.log('Build complete.')
  } catch (error) {
    throw new Error(`Build failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
