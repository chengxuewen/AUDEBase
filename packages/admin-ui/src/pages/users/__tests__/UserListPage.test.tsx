import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderWithProviders } from '../../../__tests__/helpers/test-utils'
import { UserListPage } from '../UserListPage'
import { useUsers } from '../hooks/useUsers'
import { apiPost, apiPut, apiDelete } from '../../../api/client'

vi.mock('../hooks/useUsers', () => ({
  useUsers: vi.fn(),
}))

vi.mock('../../../api/client', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}))

const mockUser = {
  id: '1',
  username: 'admin',
  is_active: true,
  tenant_id: null,
  created_at: '2026-07-01T00:00:00Z',
}

beforeEach(() => {
  vi.mocked(useUsers).mockReturnValue({
    data: { data: [mockUser], meta: { count: 1, page: 1, pageSize: 20, totalPages: 1 } },
    isLoading: false,
    isError: false,
  })
  vi.mocked(apiPost).mockResolvedValue({ id: '2' })
  vi.mocked(apiPut).mockResolvedValue({ id: '1' })
  vi.mocked(apiDelete).mockResolvedValue(undefined)
})

describe('UserListPage', () => {
  it('renders user table with usernames', () => {
    // Arrange & Act
    renderWithProviders(<UserListPage />)

    // Assert
    expect(screen.getByText('admin')).toBeInTheDocument()
  })

  it('clicks create button opens modal', async () => {
    // Arrange & Act
    renderWithProviders(<UserListPage />)
    fireEvent.click(screen.getByRole('button', { name: /新建用户/ }))

    // Assert - modal title "新建用户" appears in modal header (unique vs button text)
    await waitFor(() => {
      const titles = screen.getAllByText(/新建用户/)
      expect(titles.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('submitting form calls create API with correct payload', async () => {
    // Arrange - empty data so create button is the only "新建用户" before click
    vi.mocked(useUsers).mockReturnValue({
      data: { data: [], meta: { count: 0, page: 1, pageSize: 20, totalPages: 0 } },
      isLoading: false,
      isError: false,
    })
    renderWithProviders(<UserListPage />)

    // Act - open modal
    fireEvent.click(screen.getByRole('button', { name: /新建用户/ }))
    await waitFor(() => {
      // modal has form with label "用户名" - in empty state only modal has it
      expect(screen.getAllByText(/用户名/).length).toBeGreaterThanOrEqual(1)
    })

    // fill form - fill all required fields
    const usernameInput = screen.getByLabelText(/用户名/)
    fireEvent.change(usernameInput, { target: { value: 'testuser' } })
    const emailInput = screen.getByLabelText(/Email/)
    fireEvent.change(emailInput, { target: { value: 'test@test.com' } })

    // submit - find the modal OK button (has text "确 定" in antd)
    const okBtn = screen.getByRole('button', { name: /确 定|确定|OK/i })
    fireEvent.click(okBtn)

    // Assert
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/api/users', expect.objectContaining({ username: 'testuser' }))
    })
  })

  it('clicks delete button triggers confirm and calls delete API', async () => {
    // Arrange
    renderWithProviders(<UserListPage />)

    // Act - click delete in table row
    const deleteBtn = screen.getByRole('button', { name: /删除/ })
    fireEvent.click(deleteBtn)

    // Assert - confirm dialog appears with "确认" title
    const confirmTitle = await screen.findByText(/确认/, undefined, { timeout: 3000 })
    expect(confirmTitle).toBeInTheDocument()

    // click OK in confirm dialog
    const okBtn = screen.getByRole('button', { name: /确 定|确定|OK/i })
    fireEvent.click(okBtn)

    await waitFor(() => {
      expect(apiDelete).toHaveBeenCalledWith('/api/users/1')
    })
  })

  it('shows error message when API returns error', () => {
    // Arrange
    vi.mocked(useUsers).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    })

    // Act
    renderWithProviders(<UserListPage />)

    // Assert
    expect(screen.getByText(/加载失败/)).toBeInTheDocument()
  })

  it('renders empty state when no data available', () => {
    // Arrange
    vi.mocked(useUsers).mockReturnValue({
      data: { data: [], meta: { count: 0, page: 1, pageSize: 20, totalPages: 0 } },
      isLoading: false,
      isError: false,
    })

    // Act
    const { container } = renderWithProviders(<UserListPage />)

    // Assert
    expect(container.querySelector('.ant-empty')).not.toBeNull()
  })
})
