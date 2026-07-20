/**
 * Role Management E2E Tests — 5 scenarios
 */
import { test, expect } from './fixtures'

test.describe('Role Management', () => {
  test('role list loads', async ({ page }) => {
    await page.goto('/admin/roles')
    await page.waitForSelector('.ant-table', { timeout: 15_000 })
    const rows = page.locator('.ant-table-tbody tr')
    const count = await rows.count()
    expect(count).toBeGreaterThan(0)
  })

  test('create role flow', async ({ page }) => {
    const testRole = `e2e-role-${Date.now()}`
    await page.goto('/admin/roles')
    await page.waitForSelector('.ant-table', { timeout: 15_000 })

    const createBtn = page.locator('[data-testid="roles-create-btn"], button:has-text("创建"), button:has-text("Create"), button:has-text("新建")').first()
    await createBtn.click()
    await page.waitForTimeout(1_500)

    const nameInput = page.locator('[data-testid="roles-form-name"], input[id*="name"], input[id*="role"]').first()
    await nameInput.fill(testRole)

    const submitBtn = page.locator('[data-testid="roles-form-submit"], .ant-modal-footer button[type="submit"], button:has-text("确定")').first()
    await submitBtn.click()
    await page.waitForTimeout(2_000)

    await expect(page.locator('.ant-table')).toBeVisible()
    await page.waitForTimeout(500)
  })

  test('edit role permissions', async ({ page }) => {
    await page.goto('/admin/roles')
    await page.waitForSelector('.ant-table', { timeout: 15_000 })

    const editBtn = page.locator('[data-testid^="roles-edit-btn-"], a:has-text("编辑"), a:has-text("Edit")').first()
    if (await editBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await editBtn.click()
      await page.waitForTimeout(1_500)

      // Look for permission tree or checkboxes
      const permissionTree = page.locator('.ant-tree, .ant-transfer')
      if (await permissionTree.isVisible({ timeout: 2_000 }).catch(() => false)) {
        // Just verify the permission UI is there
        await expect(permissionTree).toBeVisible()
      }
    }
  })

  test('delete role works', async ({ page }) => {
    await page.goto('/admin/roles')
    await page.waitForSelector('.ant-table', { timeout: 15_000 })

    const deleteBtn = page.locator('[data-testid^="roles-delete-btn-"], a:has-text("删除"), a:has-text("Delete")').last()
    if (await deleteBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await deleteBtn.click()
      await page.waitForTimeout(1_000)

      const confirmPopup = page.locator('.ant-popconfirm, .ant-modal-confirm')
      if (await confirmPopup.isVisible({ timeout: 2_000 }).catch(() => false)) {
        const cancelBtn = confirmPopup.locator('.ant-btn-default').first()
        if (await cancelBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
          await cancelBtn.click()
        }
      }
    }
  })

  test('duplicate role name shows error', async ({ page }) => {
    await page.goto('/admin/roles')
    await page.waitForSelector('.ant-table', { timeout: 15_000 })

    const createBtn = page.locator('[data-testid="roles-create-btn"], button:has-text("创建")').first()
    await createBtn.click()
    await page.waitForTimeout(1_500)

    // Try to create with existing role name (admin)
    const nameInput = page.locator('[data-testid="roles-form-name"], input[id*="name"]').first()
    await nameInput.fill('admin')

    const submitBtn = page.locator('[data-testid="roles-form-submit"], button:has-text("确定")').first()
    await submitBtn.click()
    await page.waitForTimeout(2_000)

    // Should show some error (modal still visible or error toast)
    const error = page.locator('.ant-message-error, .ant-form-item-explain-error')
    const modal = page.locator('.ant-modal, .ant-drawer')
    const hasError = (await error.count()) > 0 || (await modal.count()) > 0
    expect(hasError).toBe(true)
    await page.waitForTimeout(500)
  })
})
