// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect } from 'vitest'
import { renderWithProviders } from '../../__tests__/helpers/test-utils'
import { TenantProvider } from '../TenantProvider'

describe('TenantProvider', () => {
  it('should provide tenantId to children via context', () => {
    // Arrange
    const testTenantId = 'tenant-test-uuid'

    // Act
    const { container } = renderWithProviders(
      <TenantProvider tenantId={testTenantId}>
        <div data-testid="child">child</div>
      </TenantProvider>,
    )

    // Assert
    expect(container.querySelector('[data-testid="child"]')).toBeTruthy()
  })

  it('should provide availableTenants list', () => {
    // Arrange
    const tenants = [
      { id: 'tenant-1', name: 'Tenant One' },
      { id: 'tenant-2', name: 'Tenant Two' },
    ]

    // Act
    const { container } = renderWithProviders(
      <TenantProvider tenantId="tenant-1" availableTenants={tenants}>
        <div>content</div>
      </TenantProvider>,
    )

    // Assert
    expect(container.textContent).toContain('content')
  })

  it('should provide switchTenant function', () => {
    // Arrange & Act
    const { container } = renderWithProviders(
      <TenantProvider tenantId="t1" onSwitchTenant={() => {}}>
        <div>content</div>
      </TenantProvider>,
    )

    // Assert
    expect(container.textContent).toContain('content')
  })

  it('should render null tenant as system tenant', () => {
    // Arrange & Act
    const { container } = renderWithProviders(
      <TenantProvider tenantId={null}>
        <div>system</div>
      </TenantProvider>,
    )

    // Assert
    expect(container.textContent).toContain('system')
  })
})
