import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './packages/admin-ui/__e2e__',
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium' }],
  webServer: {
    command: 'npx vite packages/admin-ui --port 5173',
    port: 5173,
    reuseExistingServer: !process.env.CI,
  },
})
