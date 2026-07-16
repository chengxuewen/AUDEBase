// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderWithProviders } from '../../../__tests__/helpers/test-utils'
import { UserListPage } from '../UserListPage'
import { useUsers } from '../hooks/useUsers'

vi.mock('../hooks/useUsers', () => {
  const mockData = {
    data: {
      data: [
        { id: '1', username: 'admin', is_active: true, tenant_id: null, created_at: '2026-07-01T00:00:00Z' },
        { id: '2', username: 'user1', is_active: true, tenant_id: 'tenant-1', created_at: '2026-07-02T00:00:00Z' },
      ],
      meta: { count: 2, page: 1, pageSize: 20, totalPages: 1 },
    },
    isLoading: false,
    isError: false,
  }
  return {
    useUsers: vi.fn(() => mockData),
  }
})

beforeEach(() => {
  vi.mocked(useUsers).mockReturnValue({
    data: {
      data: [
        { id: '1', username: 'admin', is_active: true, tenant_id: null, created_at: '2026-07-01T00:00:00Z' },
        { id: '2', username: 'user1', is_active: true, tenant_id: 'tenant-1', created_at: '2026-07-02T00:00:00Z' },
      ],
      meta: { count: 2, page: 1, pageSize: 20, totalPages: 1 },
    },
    isLoading: false,
    isError: false,
  })
})

describe('UserListPage', () => {
  it('should render user table with usernames', async () => {
    // Arrange & Act
    const { container } = renderWithProviders(<UserListPage />)

    // Assert
    expect(container.textContent).toContain('admin')
    expect(container.textContent).toContain('user1')
  })

  it('should show loading state', async () => {
    // Arrange
    vi.mocked(await import('../hooks/useUsers')).useUsers.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    })

    // Act
    const { container } = renderWithProviders(<UserListPage />)

    // Assert
    const spin = container.querySelector('.ant-spin')
    expect(spin !== null || container.textContent !== '').toBe(true)
  })

  it('should show empty state when no users', async () => {
    // Arrange
    vi.mocked(await import('../hooks/useUsers')).useUsers.mockReturnValue({
      data: { data: [], meta: { count: 0, page: 1, pageSize: 20, totalPages: 0 } },
      isLoading: false,
      isError: false,
    })

    // Act
    const { container } = renderWithProviders(<UserListPage />)

    // Assert
    const empty = container.querySelector('.ant-empty')
    expect(empty !== null || (container.textContent || '').includes('暂无')).toBe(true)
  })

  it('should show create user button for admin', async () => {
    // Arrange & Act
    const { container } = renderWithProviders(<UserListPage />)

    // Assert
    const buttons = container.querySelectorAll('button')
    const hasCreateButton = Array.from(buttons).some(
      (btn) => /新建|创建|添加/.test(btn.textContent || ''),
    )
    expect(hasCreateButton).toBe(true)
  })

  it('should display user active status', async () => {
    // Arrange & Act
    const { container } = renderWithProviders(<UserListPage />)

    // Assert - table should contain status indicator (Switch or Badge)
    const switches = container.querySelectorAll('.ant-switch')
    const badges = container.querySelectorAll('.ant-badge')
    expect(switches.length + badges.length).toBeGreaterThan(0)
  })
})
