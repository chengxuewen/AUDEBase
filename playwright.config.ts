import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './packages/admin-ui/__e2e__',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 3 : undefined,
  use: {
    baseURL: 'http://localhost:5173',
    headless: false,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: {
        storageState: 'packages/admin-ui/__e2e__/.auth/admin.json',
      },
      dependencies: ['setup'],
    },
  ],
  // webServer managed externally during local dev.
  // CI workflow uses GitHub service containers.
})
