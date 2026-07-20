import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderWithProviders } from '../../../__tests__/helpers/test-utils'
import { PluginListPage } from '../PluginListPage'
import { usePlugins } from '../hooks/usePlugins'
import { apiPost } from '../../../api/client'

vi.mock('../hooks/usePlugins', () => ({
  usePlugins: vi.fn(),
}))

vi.mock('../../../api/client', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}))

const mockPlugin = {
  id: '1',
  name: '@audebase/plugin-core',
  display_name: '内核插件',
  version: '0.1.0',
  state: 'enabled',
  category: 'system',
}

beforeEach(() => {
  vi.mocked(usePlugins).mockReturnValue({
    data: { data: [mockPlugin] },
    isLoading: false,
    isError: false,
  })
  vi.mocked(apiPost).mockResolvedValue(undefined)
})

describe('PluginListPage', () => {
  it('renders plugin table with plugin names', () => {
    // Arrange & Act
    renderWithProviders(<PluginListPage />)

    // Assert
    expect(screen.getByText('内核插件')).toBeInTheDocument()
  })

  it('clicks enable button calls enable API', async () => {
    // Arrange
    renderWithProviders(<PluginListPage />)

    // Act
    const enableBtn = screen.getByRole('button', { name: /启用/ })
    fireEvent.click(enableBtn)

    // Assert
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/api/plugins/1/enable')
    })
  })

  it('clicks disable button calls disable API', async () => {
    // Arrange
    renderWithProviders(<PluginListPage />)

    // Act
    const disableBtn = screen.getByRole('button', { name: /禁用/ })
    fireEvent.click(disableBtn)

    // Assert
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/api/plugins/1/disable')
    })
  })

  it('shows loading state when data is loading', () => {
    // Arrange
    vi.mocked(usePlugins).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    })

    // Act
    const { container } = renderWithProviders(<PluginListPage />)

    // Assert
    expect(container.querySelector('.ant-spin')).not.toBeNull()
  })

  it('shows error message when API returns error', () => {
    // Arrange
    vi.mocked(usePlugins).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    })

    // Act
    renderWithProviders(<PluginListPage />)

    // Assert
    expect(screen.getByText(/加载失败/)).toBeInTheDocument()
  })

  it('renders empty state when no data available', () => {
    // Arrange
    vi.mocked(usePlugins).mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    })

    // Act
    const { container } = renderWithProviders(<PluginListPage />)

    // Assert
    expect(container.querySelector('.ant-empty')).not.toBeNull()
  })
})
