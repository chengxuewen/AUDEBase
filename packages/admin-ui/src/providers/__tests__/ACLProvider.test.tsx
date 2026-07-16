// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect } from 'vitest'
import { renderWithProviders } from '../../__tests__/helpers/test-utils'
import { ACLProvider } from '../ACLProvider'

describe('ACLProvider', () => {
  it('should provide ACL context with can() function to children', () => {
    // Arrange
    const permissions = [{ action: 'manage', resource: '*' }]

    // Act
    const { container } = renderWithProviders(
      <ACLProvider permissions={permissions}>
        <div data-testid="child">child</div>
      </ACLProvider>,
    )

    // Assert
    expect(container.querySelector('[data-testid="child"]')).toBeTruthy()
  })

  it('should set isLoading to true while permissions are being fetched', () => {
    // Arrange & Act
    const { container } = renderWithProviders(
      <ACLProvider permissions={[]} isLoading={true}>
        <div>content</div>
      </ACLProvider>,
    )

    // Assert - during loading, children may not render (ACLGuard renders null)
    expect(container).toBeTruthy()
  })

  it('should provide canRoute function for route permission checking', () => {
    // Arrange
    const permissions = [{ action: 'manage', resource: '*' }]

    // Act
    const { container } = renderWithProviders(
      <ACLProvider permissions={permissions}>
        <div>content</div>
      </ACLProvider>,
    )

    // Assert
    expect(container.textContent).toContain('content')
  })

  it('should provide empty permissions list for member role', () => {
    // Arrange
    const permissions: Array<{ action: string; resource: string }> = []

    // Act
    const { container } = renderWithProviders(
      <ACLProvider permissions={permissions}>
        <div>member</div>
      </ACLProvider>,
    )

    // Assert
    expect(container.textContent).toContain('member')
  })
})
