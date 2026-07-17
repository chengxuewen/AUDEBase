import { screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderWithProviders } from '../../../__tests__/helpers/test-utils'
import { AuditLogPage } from '../AuditLogPage'
import { useAuditLogs } from '../hooks/useAuditLogs'

vi.mock('../hooks/useAuditLogs', () => ({
  useAuditLogs: vi.fn(),
}))

const mockAuditLog = {
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
}

beforeEach(() => {
  vi.mocked(useAuditLogs).mockReturnValue({
    data: { data: [mockAuditLog], meta: { count: 1, page: 1, pageSize: 20, totalPages: 1 } },
    isLoading: false,
    isError: false,
  })
})

describe('AuditLogPage', () => {
  it('renders audit log table with entries', () => {
    // Arrange & Act
    renderWithProviders(<AuditLogPage />)

    // Assert
    expect(screen.getByText('create')).toBeInTheDocument()
    expect(screen.getByText('plugin')).toBeInTheDocument()
  })

  it('shows loading state when data is loading', () => {
    // Arrange
    vi.mocked(useAuditLogs).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    })

    // Act
    const { container } = renderWithProviders(<AuditLogPage />)

    // Assert
    expect(container.querySelector('.ant-spin')).not.toBeNull()
  })

  it('shows error message when API returns error', () => {
    // Arrange
    vi.mocked(useAuditLogs).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    })

    // Act
    renderWithProviders(<AuditLogPage />)

    // Assert
    expect(screen.getByText(/加载失败/)).toBeInTheDocument()
  })

  it('renders empty state when no data available', () => {
    // Arrange
    vi.mocked(useAuditLogs).mockReturnValue({
      data: { data: [], meta: { count: 0, page: 1, pageSize: 20, totalPages: 0 } },
      isLoading: false,
      isError: false,
    })

    // Act
    const { container } = renderWithProviders(<AuditLogPage />)

    // Assert
    expect(container.querySelector('.ant-empty')).not.toBeNull()
  })
})
