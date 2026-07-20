import { test, expect } from '@playwright/test'

const ADMIN_USERNAME = 'admin'
const ADMIN_PASSWORD = 'Admin@123'

async function login(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/')
  await page.getByPlaceholder('用户名').fill(ADMIN_USERNAME)
  await page.getByPlaceholder('密码').fill(ADMIN_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await expect(page.locator('.ant-layout-sider')).toBeVisible({ timeout: 10_000 })
}

test.describe('MVP Smoke Tests', () => {
  test('login with valid credentials shows admin UI', async ({ page }) => {
    await login(page)
  })

  test('login with wrong password stays on login page', async ({ page }) => {
    await page.goto('/')
    await page.getByPlaceholder('用户名').fill(ADMIN_USERNAME)
    await page.getByPlaceholder('密码').fill('wrongpassword')
    await page.locator('button[type="submit"]').click()
    // Should still be on login page (no admin sidebar appears)
    await page.waitForTimeout(2000)
    await expect(page.locator('.ant-layout-sider')).not.toBeVisible()
  })

  test('plugin list displays after login', async ({ page }) => {
    await login(page)
    await expect(page.locator('.ant-table')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.ant-table-tbody tr')).toHaveCount(1, { timeout: 10_000 })
  })

  test('sidebar menu has expected items', async ({ page }) => {
    await login(page)
    const menuItems = page.locator('.ant-menu-item')
    await expect(menuItems).toHaveCount(5, { timeout: 10_000 })
    const texts = await menuItems.allTextContents()
    expect(texts.join(',')).toContain('插件')
    expect(texts.join(',')).toContain('审计')
  })

  test('menu navigation switches pages', async ({ page }) => {
    await login(page)
    // Click "用户管理" menu item
    await page.locator('.ant-menu-item', { hasText: '用户' }).click()
    await page.waitForTimeout(1000)
    // User table should appear
    await expect(page.locator('.ant-table')).toBeVisible({ timeout: 10_000 })
    // Click back to "插件管理"
    await page.locator('.ant-menu-item', { hasText: '插件' }).click()
    await page.waitForTimeout(1000)
    await expect(page.locator('.ant-table')).toBeVisible({ timeout: 10_000 })
  })

  test('logout returns to login page', async ({ page }) => {
    await login(page)
    await page.locator('button', { hasText: /退出|Logout/ }).click()
    await expect(page.getByPlaceholder('用户名')).toBeVisible({ timeout: 10_000 })
  })
})
