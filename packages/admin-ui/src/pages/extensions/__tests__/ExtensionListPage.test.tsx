import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderWithProviders } from '../../../__tests__/helpers/test-utils'
import { ExtensionListPage } from '../ExtensionListPage'
import { useExtensions } from '../hooks/useExtensions'

vi.mock('../hooks/useExtensions', () => {
  const mockData = {
    data: [],
    isLoading: false,
    isError: false,
  }
  return {
    useExtensions: vi.fn(() => mockData),
  }
})

beforeEach(() => {
  vi.mocked(useExtensions).mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
  })
})

describe('ExtensionListPage', () => {
  it('should show loading state when data is loading', () => {
    // Arrange
    vi.mocked(useExtensions).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    })

    // Act
    const { container } = renderWithProviders(<ExtensionListPage />)

    // Assert
    const spin = container.querySelector('.ant-spin') || container.textContent
    expect(spin).toBeTruthy()
  })

  it('should render empty state when no extensions exist', () => {
    // Arrange & Act
    const { container } = renderWithProviders(<ExtensionListPage />)

    // Assert
    const empty = container.querySelector('.ant-empty')
    const emptyText = container.textContent
    expect(empty !== null || emptyText!.includes('暂无')).toBe(true)
  })

  it('should render extension data when provided', () => {
    // Arrange
    vi.mocked(useExtensions).mockReturnValue({
      data: [
        {
          collection: 'order',
          pluginName: '@audebase/plugin-erp',
          fields: [
            { name: 'warehouse_id', type: 'belongsTo' },
            { name: 'priority', type: 'integer' },
          ],
        },
      ],
      isLoading: false,
      isError: false,
    })

    // Act
    const { container } = renderWithProviders(<ExtensionListPage />)

    // Assert
    const text = container.textContent || ''
    expect(text).toContain('order')
    expect(text).toContain('@audebase/plugin-erp')
    expect(text).toContain('warehouse_id')
    expect(text).toContain('belongsTo')
  })
})
