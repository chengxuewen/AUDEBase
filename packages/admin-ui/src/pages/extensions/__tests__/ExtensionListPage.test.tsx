import { screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderWithProviders } from '../../../__tests__/helpers/test-utils'
import { ExtensionListPage } from '../ExtensionListPage'
import { useExtensions } from '../hooks/useExtensions'

vi.mock('../hooks/useExtensions', () => ({
  useExtensions: vi.fn(),
}))

const mockExtension = {
  collection: 'order',
  pluginName: '@audebase/plugin-erp',
  fields: [
    { name: 'warehouse_id', type: 'belongsTo' },
    { name: 'priority', type: 'integer' },
  ],
}

beforeEach(() => {
  vi.mocked(useExtensions).mockReturnValue({
    data: [mockExtension],
    isLoading: false,
    isError: false,
  })
})

describe.skip('ExtensionListPage', () => {
  it('renders extension table with data', () => {
    // Arrange & Act
    renderWithProviders(<ExtensionListPage />)

    // Assert
    expect(screen.getByText('order')).toBeInTheDocument()
    expect(screen.getByText('@audebase/plugin-erp')).toBeInTheDocument()
    expect(screen.getByText(/warehouse_id/)).toBeInTheDocument()
  })

  it('shows loading state when data is loading', () => {
    // Arrange
    vi.mocked(useExtensions).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    })

    // Act
    const { container } = renderWithProviders(<ExtensionListPage />)

    // Assert
    expect(container.querySelector('.ant-spin')).not.toBeNull()
  })

  it('shows error message when API returns error', () => {
    // Arrange
    vi.mocked(useExtensions).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    })

    // Act
    renderWithProviders(<ExtensionListPage />)

    // Assert
    expect(screen.getByText(/加载失败/)).toBeInTheDocument()
  })

  it('renders empty state when no data available', () => {
    // Arrange
    vi.mocked(useExtensions).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    })

    // Act
    const { container } = renderWithProviders(<ExtensionListPage />)

    // Assert
    expect(container.querySelector('.ant-empty')).not.toBeNull()
  })
})
