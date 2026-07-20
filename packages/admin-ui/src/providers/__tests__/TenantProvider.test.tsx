import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../__tests__/helpers/test-utils'
import { TenantProvider, useTenant } from '../TenantProvider'

// Mock the API client
vi.mock('../../api/client', () => ({
  apiGet: vi.fn(),
  getTenantId: vi.fn(() => 'system'),
  setTenantId: vi.fn(),
}))

import { apiGet, setTenantId } from '../../api/client'

function TenantConsumer(): React.JSX.Element {
  const ctx = useTenant()
  if (!ctx) return <div data-testid="no-ctx" />
  return (
    <div>
      <span data-testid="tenant-id">{ctx.tenantId}</span>
      <span data-testid="tenant-count">{ctx.availableTenants.length}</span>
      <button
        data-testid="switch-btn"
        onClick={() => ctx.switchTenant('tenant-2')}
      >
        switch
      </button>
    </div>
  )
}

describe('TenantProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should provide tenantId from localStorage default', async () => {
    // Arrange
    vi.mocked(apiGet).mockResolvedValue({
      data: [{ id: 'system', name: '系统租户' }],
    })

    // Act
    const { container } = renderWithProviders(
      <TenantProvider>
        <TenantConsumer />
      </TenantProvider>,
    )

    // Assert
    await waitFor(() => {
      expect(container.querySelector('[data-testid="tenant-id"]')).toBeTruthy()
    })
    expect(container.querySelector('[data-testid="tenant-id"]')?.textContent).toBe('system')
  })

  it('should fetch and provide availableTenants from API', async () => {
    // Arrange
    vi.mocked(apiGet).mockResolvedValue({
      data: [
        { id: 'system', name: '系统租户' },
        { id: 'tenant-2', name: '租户二' },
      ],
    })

    // Act
    const { container } = renderWithProviders(
      <TenantProvider>
        <TenantConsumer />
      </TenantProvider>,
    )

    // Assert
    await waitFor(() => {
      expect(container.querySelector('[data-testid="tenant-count"]')?.textContent).toBe('2')
    })
  })

  it('should call setTenantId and redirect on switchTenant', async () => {
    // Arrange
    vi.mocked(apiGet).mockResolvedValue({
      data: [{ id: 'system', name: '系统租户' }],
    })
    const originalHref = window.location.href
    let redirectedHref: string | undefined
    Object.defineProperty(window, 'location', {
      value: {
        get href() { return originalHref },
        set href(val: string) { redirectedHref = val },
      },
      writable: true,
      configurable: true,
    })

    // Act
    const { container } = renderWithProviders(
      <TenantProvider>
        <TenantConsumer />
      </TenantProvider>,
    )

    await waitFor(() => {
      expect(container.querySelector('[data-testid="switch-btn"]')).toBeTruthy()
    })
    container.querySelector('[data-testid="switch-btn"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    )

    // Assert
    expect(setTenantId).toHaveBeenCalledWith('tenant-2')
    expect(redirectedHref).toBe('/')
  })

  it('should render children when API fails', async () => {
    // Arrange
    vi.mocked(apiGet).mockRejectedValue(new Error('Network error'))

    // Act
    const { container } = renderWithProviders(
      <TenantProvider>
        <div data-testid="child">child</div>
      </TenantProvider>,
    )

    // Assert - provider should still render children after error
    await waitFor(() => {
      expect(container.textContent).toContain('child')
    })
  })
})
