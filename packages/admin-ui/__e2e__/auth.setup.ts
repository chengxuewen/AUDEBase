/**
 * Auth Setup — Login → Save StorageState
 *
 * Runs once before the 'chromium' project (declared as dependency in playwright.config.ts).
 * Saves the authenticated browser state so all test files skip login.
 */
import { test as setup } from '@playwright/test'

const AUTH_FILE = 'packages/admin-ui/__e2e__/.auth/admin.json'
const ADMIN_USERNAME = 'admin'
const ADMIN_PASSWORD = 'Admin@123'

setup('authenticate', async ({ page }) => {
  // Navigate to login page
  await page.goto('/login')

  // Wait for the login form to be visible
  await page.waitForSelector('button[type="submit"]', { timeout: 10_000 })

  // Fill credentials using data-testid
  await page.getByTestId('login-username-input').fill(ADMIN_USERNAME)
  await page.getByTestId('login-password-input').fill(ADMIN_PASSWORD)

  // Submit
  await page.getByTestId('login-submit-btn').click()

  // Wait for redirect to admin dashboard
  await page.waitForURL('**/admin/**', { timeout: 15_000 })

  // Verify we're logged in — sidebar menu should be visible
  await page.waitForSelector('.ant-layout-sider', { timeout: 5_000 })

  // Save authentication state
  await page.context().storageState({ path: AUTH_FILE })
})
