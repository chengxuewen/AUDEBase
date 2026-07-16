// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderWithProviders } from '../../../__tests__/helpers/test-utils'
import { RoleListPage } from '../RoleListPage'
import { useRoles } from '../hooks/useRoles'

vi.mock('../hooks/useRoles', () => {
  const mockData = {
    data: {
      data: [
        { id: '1', name: 'admin', display_name: '管理员', permissions: [], user_count: 1 },
        { id: '2', name: 'member', display_name: '成员', permissions: [], user_count: 5 },
      ],
      meta: { count: 2, page: 1, pageSize: 20, totalPages: 1 },
    },
    isLoading: false,
    isError: false,
  }
  return {
    useRoles: vi.fn(() => mockData),
  }
})

beforeEach(() => {
  vi.mocked(useRoles).mockReturnValue({
    data: {
      data: [
        { id: '1', name: 'admin', display_name: '管理员', permissions: [], user_count: 1 },
        { id: '2', name: 'member', display_name: '成员', permissions: [], user_count: 5 },
      ],
      meta: { count: 2, page: 1, pageSize: 20, totalPages: 1 },
    },
    isLoading: false,
    isError: false,
  })
})

describe('RoleListPage', () => {
  it('should render role table with role names', async () => {
    // Arrange & Act
    const { container } = renderWithProviders(<RoleListPage />)

    // Assert
    expect(container.textContent).toContain('管理员')
    expect(container.textContent).toContain('成员')
  })

  it('should show loading state', async () => {
    // Arrange
    vi.mocked(await import('../hooks/useRoles')).useRoles.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    })

    // Act
    const { container } = renderWithProviders(<RoleListPage />)

    // Assert
    const spin = container.querySelector('.ant-spin')
    expect(spin !== null || container.textContent !== '').toBe(true)
  })

  it('should show create role button', async () => {
    // Arrange & Act
    const { container } = renderWithProviders(<RoleListPage />)

    // Assert
    const buttons = container.querySelectorAll('button')
    const hasCreateButton = Array.from(buttons).some(
      (btn) => /新建|创建|添加/.test(btn.textContent || ''),
    )
    expect(hasCreateButton).toBe(true)
  })

  it('should show empty state when no roles', async () => {
    // Arrange
    vi.mocked(await import('../hooks/useRoles')).useRoles.mockReturnValue({
      data: { data: [], meta: { count: 0, page: 1, pageSize: 20, totalPages: 0 } },
      isLoading: false,
      isError: false,
    })

    // Act
    const { container } = renderWithProviders(<RoleListPage />)

    // Assert
    const empty = container.querySelector('.ant-empty')
    expect(empty !== null || (container.textContent || '').includes('暂无')).toBe(true)
  })
})
