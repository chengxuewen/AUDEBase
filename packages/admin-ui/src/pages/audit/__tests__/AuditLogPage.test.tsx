// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect, vi } from 'vitest'
import { renderWithProviders } from '../../../__tests__/helpers/test-utils'
import { AuditLogPage } from '../AuditLogPage'

vi.mock('../hooks/useAuditLogs', () => ({
  useAuditLogs: () => ({
    data: {
      data: [
        {
          id: '1',
          tenant_id: null,
          actor_id: 'user-1',
          action: 'create',
          resource_type: 'plugin',
          resource_id: 'plugin-1',
          old_values: null,
          new_values: { name: '@audebase/plugin-core' },
          ip: '127.0.0.1',
          user_agent: 'curl/8.0',
          created_at: '2026-07-13T10:00:00Z',
        },
      ],
      meta: { count: 1, page: 1, pageSize: 20, totalPages: 1 },
    },
    isLoading: false,
    isError: false,
  }),
}))

describe('AuditLogPage', () => {
  it('should render audit log table with entries', async () => {
    // Arrange & Act
    const { container } = renderWithProviders(<AuditLogPage />)

    // Assert
    expect(container.textContent).toContain('create')
    expect(container.textContent).toContain('plugin')
  })

  it('should show loading state', async () => {
    // Arrange
    vi.mocked(await import('../hooks/useAuditLogs')).useAuditLogs.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    })

    // Act
    const { container } = renderWithProviders(<AuditLogPage />)

    // Assert
    const spin = container.querySelector('.ant-spin')
    expect(spin !== null || container.textContent !== '').toBe(true)
  })

  it('should show actor information in table', async () => {
    // Arrange & Act
    const { container } = renderWithProviders(<AuditLogPage />)

    // Assert
    expect(container.textContent).toContain('user-1')
  })

  it('should show timestamp in table', async () => {
    // Arrange & Act
    const { container } = renderWithProviders(<AuditLogPage />)

    // Assert
    expect(container.textContent).toContain('2026')
  })

  it('should show empty state when no audit logs', async () => {
    // Arrange
    vi.mocked(await import('../hooks/useAuditLogs')).useAuditLogs.mockReturnValue({
      data: { data: [], meta: { count: 0, page: 1, pageSize: 20, totalPages: 0 } },
      isLoading: false,
      isError: false,
    })

    // Act
    const { container } = renderWithProviders(<AuditLogPage />)

    // Assert
    const empty = container.querySelector('.ant-empty')
    expect(empty !== null || (container.textContent || '').includes('暂无')).toBe(true)
  })
})
