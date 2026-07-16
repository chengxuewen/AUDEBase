import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './packages/admin-ui/__e2e__',
  globalSetup: './packages/admin-ui/__e2e__/global-setup.ts',
  use: {
    baseURL: 'http://localhost:3000',
    storageState: 'packages/admin-ui/__e2e__/.auth/admin.json',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium' }],
  webServer: {
    command: 'AUDE_DEV=1 npx aude dev --testing',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
})
