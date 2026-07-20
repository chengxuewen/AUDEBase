/**
 * E2E Test Fixtures
 *
 * Custom fixtures for the AUDEBase admin E2E test suite.
 * Provides authenticated page helper with convenience methods.
 */
import { test as base, type Page } from '@playwright/test'

export class AdminPage {
  constructor(public page: Page) {}

  /** Navigate to a page in the admin area */
  async goto(path: string) {
    await this.page.goto(path)
    await this.page.waitForLoadState('networkidle')
  }

  /** Wait for an Ant Design table to render */
  async waitForTable() {
    await this.page.waitForSelector('.ant-table', { timeout: 10_000 })
  }

  /** Wait for a success toast/message */
  async waitForSuccessToast() {
    await this.page.waitForSelector('.ant-message-success, .ant-notification-success', {
      timeout: 10_000,
    })
  }

  /** Click a button by data-testid */
  async clickTestId(testId: string) {
    await this.page.getByTestId(testId).click()
  }

  /** Fill a form field by data-testid */
  async fillTestId(testId: string, value: string) {
    await this.page.getByTestId(testId).fill(value)
  }

  /** Assert that a data-testid element is visible */
  async expectVisible(testId: string) {
    await this.page.getByTestId(testId).waitFor({ state: 'visible', timeout: 5_000 })
  }
}

export type AdminFixtures = {
  adminPage: AdminPage
}

export const test = base.extend<AdminFixtures>({
  adminPage: async ({ page }, use) => {
    const admin = new AdminPage(page)
    await use(admin)
  },
})

export { expect } from '@playwright/test'
