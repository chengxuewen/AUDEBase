import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './packages/admin-ui/__e2e__',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 3 : undefined,
  use: {
    baseURL: 'http://localhost:5173',
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
  webServer: [
    {
      command: 'AUDE_PORT=5110 npx aude dev',
      port: 5110,
      timeout: 30_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npx vite packages/admin-ui --port 5173',
      port: 5173,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
