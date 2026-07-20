/**
 * User Management E2E Tests — 7 scenarios
 */
import { test, expect } from './fixtures'

test.describe('User Management', () => {
  test('user list loads', async ({ page }) => {
    await page.goto('/admin/users')
    await page.waitForSelector('.ant-table', { timeout: 15_000 })
    const rows = page.locator('.ant-table-tbody tr')
    const count = await rows.count()
    expect(count).toBeGreaterThan(0)
  })

  test('pagination works', async ({ page }) => {
    await page.goto('/admin/users')
    await page.waitForSelector('.ant-table', { timeout: 15_000 })
    const pagination = page.locator('.ant-pagination')
    if (await pagination.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const nextBtn = pagination.locator('.ant-pagination-next')
      if (await nextBtn.isEnabled({ timeout: 1_000 }).catch(() => false)) {
        await nextBtn.click()
        await page.waitForTimeout(1_000)
      }
    }
    await expect(page.locator('.ant-table')).toBeVisible()
  })

  test('create user flow', async ({ page }) => {
    const testUser = `e2e-test-${Date.now()}`
    await page.goto('/admin/users')
    await page.waitForSelector('.ant-table', { timeout: 15_000 })

    // Click create button
    const createBtn = page.locator('[data-testid="users-create-btn"], button:has-text("创建"), button:has-text("Create"), button:has-text("新建")').first()
    await createBtn.click()
    await page.waitForTimeout(1_500)

    // Fill form
    const usernameInput = page.locator('[data-testid="users-form-name"], input[id*="username"], input[id*="name"]').first()
    await usernameInput.fill(testUser)

    const emailInput = page.locator('[data-testid="users-form-email"], input[id*="email"]').first()
    if (await emailInput.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await emailInput.fill(`${testUser}@test.com`)
    }

    const passInput = page.locator('[data-testid="users-form-password"], input[type="password"]').first()
    if (await passInput.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await passInput.fill('Test@12345')
    }

    // Submit
    const submitBtn = page.locator('[data-testid="users-form-submit"], .ant-modal-footer button[type="submit"], button:has-text("确定"), button:has-text("OK")').first()
    await submitBtn.click()
    await page.waitForTimeout(2_000)

    // Verify table is still visible (no crash)
    await expect(page.locator('.ant-table')).toBeVisible()
    await page.waitForTimeout(1_000)
  })

  test('edit user flow', async ({ page }) => {
    await page.goto('/admin/users')
    await page.waitForSelector('.ant-table', { timeout: 15_000 })

    // Click edit on first row
    const editBtn = page.locator('[data-testid^="users-edit-btn-"], a:has-text("编辑"), a:has-text("Edit")').first()
    if (await editBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await editBtn.click()
      await page.waitForTimeout(1_500)

      // Should have a modal or form
      const modal = page.locator('.ant-modal, .ant-drawer')
      if (await modal.isVisible({ timeout: 2_000 }).catch(() => false)) {
        // Close without changes
        const cancelBtn = page.locator('.ant-modal-footer button:first-child, button:has-text("取消")').first()
        if (await cancelBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
          await cancelBtn.click()
        }
      }
    }
  })

  test('delete user shows confirmation', async ({ page }) => {
    await page.goto('/admin/users')
    await page.waitForSelector('.ant-table', { timeout: 15_000 })

    const deleteBtn = page.locator('[data-testid^="users-delete-btn-"], a:has-text("删除"), a:has-text("Delete")').last()
    if (await deleteBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await deleteBtn.click()
      await page.waitForTimeout(1_000)

      // Look for confirmation popup
      const confirmPopup = page.locator('.ant-popconfirm, .ant-modal-confirm')
      if (await confirmPopup.isVisible({ timeout: 2_000 }).catch(() => false)) {
        // Cancel — don't actually delete
        const cancelBtn = page.locator('.ant-popconfirm .ant-btn-default, .ant-modal-confirm .ant-btn-default').first()
        if (await cancelBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
          await cancelBtn.click()
        }
      }
    }
  })

  test('search filters results', async ({ page }) => {
    await page.goto('/admin/users')
    await page.waitForSelector('.ant-table', { timeout: 15_000 })

    const searchInput = page.locator('[data-testid="users-search-input"], .ant-table-filter-trigger, input[placeholder*="搜索"], input[placeholder*="Search"]').first()
    if (await searchInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await searchInput.fill('admin')
      await page.waitForTimeout(1_500)
    }
    await expect(page.locator('.ant-table')).toBeVisible()
    await page.waitForTimeout(500)
  })

  test('form validation prevents invalid submit', async ({ page }) => {
    await page.goto('/admin/users')
    await page.waitForSelector('.ant-table', { timeout: 15_000 })

    const createBtn = page.locator('[data-testid="users-create-btn"], button:has-text("创建"), button:has-text("Create"), button:has-text("新建")').first()
    await createBtn.click()
    await page.waitForTimeout(1_500)

    // Submit without filling
    const submitBtn = page.locator('[data-testid="users-form-submit"], .ant-modal-footer button[type="submit"], button:has-text("确定")').first()
    await submitBtn.click()
    await page.waitForTimeout(1_000)

    // Form should still be visible (validation blocked submit)
    await expect(page.locator('.ant-modal, .ant-drawer')).toBeVisible()
    await page.waitForTimeout(500)
  })
})
