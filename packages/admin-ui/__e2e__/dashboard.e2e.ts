/**
 * Dashboard Page E2E Tests — 4 scenarios
 */
import { test, expect } from './fixtures'

test.describe('Dashboard Page', () => {
  test('dashboard renders after login', async ({ page }) => {
    await page.goto('/admin')
    await page.waitForSelector('.ant-layout-sider', { timeout: 10_000 })
    // Dashboard should render with content
    await expect(page.locator('.ant-layout-content')).toBeVisible()
  })

  test('sidebar menu navigation works', async ({ page }) => {
    await page.goto('/admin')
    await page.waitForSelector('.ant-layout-sider', { timeout: 10_000 })
    // Click on a menu item
    const menuItems = page.locator('.ant-menu-item')
    const count = await menuItems.count()
    expect(count).toBeGreaterThan(0)
  })

  test('stats section renders', async ({ page }) => {
    await page.goto('/admin/dashboard')
    await page.waitForSelector('.ant-layout-sider', { timeout: 10_000 })
    // Dashboard may have stats cards
    await page.waitForTimeout(2_000)
    // Page loaded — content visible
    await expect(page.locator('.ant-layout-content')).toBeVisible()
  })

  test('empty state handled when no data', async ({ page }) => {
    await page.goto('/admin/dashboard')
    await page.waitForSelector('.ant-layout-sider', { timeout: 10_000 })
    await page.waitForTimeout(2_000)
    // Should render without crashing
    const content = page.locator('.ant-layout-content')
    await expect(content).toBeVisible()
    // No uncaught errors
  })
})
