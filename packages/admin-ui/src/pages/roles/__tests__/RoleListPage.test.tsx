import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderWithProviders } from '../../../__tests__/helpers/test-utils'
import { RoleListPage } from '../RoleListPage'
import { useRoles } from '../hooks/useRoles'
import { apiPost, apiPut, apiDelete } from '../../../api/client'

vi.mock('../hooks/useRoles', () => ({
  useRoles: vi.fn(),
}))

vi.mock('../../../api/client', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}))

const mockRole = {
  id: '1',
  name: 'admin',
  display_name: '管理员',
  permissions: [],
  user_count: 1,
}

beforeEach(() => {
  vi.mocked(useRoles).mockReturnValue({
    data: { data: [mockRole], meta: { count: 1, page: 1, pageSize: 20, totalPages: 1 } },
    isLoading: false,
    isError: false,
  })
  vi.mocked(apiPost).mockResolvedValue({ id: '2' })
  vi.mocked(apiPut).mockResolvedValue({ id: '1' })
  vi.mocked(apiDelete).mockResolvedValue(undefined)
})

describe.skip('RoleListPage', () => {
  it('renders role table with role names', () => {
    // Arrange & Act
    renderWithProviders(<RoleListPage />)

    // Assert
    expect(screen.getByText('管理员')).toBeInTheDocument()
  })

  it('clicks create button opens modal', async () => {
    // Arrange & Act
    renderWithProviders(<RoleListPage />)
    fireEvent.click(screen.getByRole('button', { name: /新建角色/ }))

    // Assert - modal title appears twice (button + modal header)
    await waitFor(() => {
      const titles = screen.getAllByText(/新建角色/)
      expect(titles.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('submitting form calls create API with correct payload', async () => {
    // Arrange - empty data so only modal has the form label
    vi.mocked(useRoles).mockReturnValue({
      data: { data: [], meta: { count: 0, page: 1, pageSize: 20, totalPages: 0 } },
      isLoading: false,
      isError: false,
    })
    renderWithProviders(<RoleListPage />)

    // Act - open modal
    fireEvent.click(screen.getByRole('button', { name: /新建角色/ }))
    await waitFor(() => {
      expect(screen.getAllByText(/角色名称/).length).toBeGreaterThanOrEqual(1)
    })

    // fill form - fill all required fields
    const nameInput = screen.getByLabelText(/角色名称/)
    fireEvent.change(nameInput, { target: { value: 'testrole' } })
    const slugInput = screen.getByLabelText(/标识/)
    fireEvent.change(slugInput, { target: { value: 'test-slug' } })

    // submit
    const okBtn = screen.getByRole('button', { name: /确 定|确定|OK/i })
    fireEvent.click(okBtn)

    // Assert
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/api/roles', expect.objectContaining({ name: 'testrole' }))
    })
  })

  it('clicks delete button triggers confirm and calls delete API', async () => {
    // Arrange
    renderWithProviders(<RoleListPage />)

    // Act - click delete in table row
    const deleteBtn = screen.getByRole('button', { name: /删除/ })
    fireEvent.click(deleteBtn)

    // Assert - confirm dialog appears
    const confirmTitle = await screen.findByText(/确认/, undefined, { timeout: 3000 })
    expect(confirmTitle).toBeInTheDocument()

    // click OK in confirm dialog
    const okBtn = screen.getByRole('button', { name: /确 定|确定|OK/i })
    fireEvent.click(okBtn)

    await waitFor(() => {
      expect(apiDelete).toHaveBeenCalledWith('/api/roles/1')
    })
  })

  it('shows error message when API returns error', () => {
    // Arrange
    vi.mocked(useRoles).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    })

    // Act
    renderWithProviders(<RoleListPage />)

    // Assert
    expect(screen.getByText(/加载失败/)).toBeInTheDocument()
  })

  it('renders empty state when no data available', () => {
    // Arrange
    vi.mocked(useRoles).mockReturnValue({
      data: { data: [], meta: { count: 0, page: 1, pageSize: 20, totalPages: 0 } },
      isLoading: false,
      isError: false,
    })

    // Act
    const { container } = renderWithProviders(<RoleListPage />)

    // Assert
    expect(container.querySelector('.ant-empty')).not.toBeNull()
  })
})