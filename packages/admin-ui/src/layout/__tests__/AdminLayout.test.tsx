// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect } from 'vitest'
import { renderWithProviders } from '../../__tests__/helpers/test-utils'
import { AdminLayout } from '../AdminLayout'

describe('AdminLayout - menu permission filtering', () => {
  it('should show all menu items for admin user', async () => {
    // Arrange & Act
    const { container } = renderWithProviders(<AdminLayout />)

    // Assert
    const text = container.textContent || ''
    expect(text).toContain('插件管理')
    expect(text).toContain('用户管理')
  })

  it('should hide menu items user lacks permission for', async () => {
    // Arrange & Act - render with restricted ACL
    const { container } = renderWithProviders(
      <AdminLayout canRoute={(snippet: string) => !snippet.includes('plugin')} />,
    )

    // Assert
    const text = container.textContent || ''
    expect(text).not.toContain('插件管理')
    expect(text).toContain('用户管理')
  })

  it('should render ProLayout structure with sider and header', async () => {
    // Arrange & Act
    const { container } = renderWithProviders(<AdminLayout />)

    // Assert
    const layout = container.querySelector('.ant-pro-layout')
    expect(layout !== null || container.querySelector('.ant-layout') !== null).toBe(true)
  })
})
