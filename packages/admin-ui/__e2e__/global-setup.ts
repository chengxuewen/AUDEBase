/**
 * E2E Global Setup
 *
 * Runs once before all E2E tests.
 * Ensures the backend is healthy and bootstrap data is ready.
 * For CI: PostgreSQL container is fresh, bootstrap runs on first `aude dev`.
 * For local: rely on existing docker-compose setup.
 */
import { type FullConfig } from '@playwright/test'

async function waitForServer(url: string, maxRetries = 30): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      // server not ready yet
    }
    await new Promise((r) => setTimeout(r, 2_000))
  }
  throw new Error(`Server at ${url} not ready after ${maxRetries} retries`)
}

export default async function globalSetup(_config: FullConfig) {
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:5110'

  console.log(`[global-setup] Waiting for backend at ${backendUrl}/health ...`)
  await waitForServer(`${backendUrl}/health`)

  // Bootstrap runs automatically on first `aude dev` — admin user + default roles.
  // Additional seed data (test users, plugins) is created per-test-file or
  // in the auth.setup.ts flow if needed.

  console.log('[global-setup] Backend healthy, proceeding with tests.')
}
