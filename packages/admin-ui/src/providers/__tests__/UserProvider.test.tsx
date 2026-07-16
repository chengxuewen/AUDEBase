// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect } from 'vitest'
import { renderWithProviders } from '../../__tests__/helpers/test-utils'
import { UserProvider } from '../UserProvider'

describe('UserProvider', () => {
  it('should provide current user to children via context', () => {
    // Arrange
    const mockUser = {
      id: 'user-uuid-1',
      username: 'admin',
      is_active: true,
      token_version: 0,
      must_change_password: false,
      tenant_id: null,
    }

    // Act
    const { container } = renderWithProviders(
      <UserProvider user={mockUser}>
        <div data-testid="child">child</div>
      </UserProvider>,
    )

    // Assert
    expect(container.querySelector('[data-testid="child"]')).toBeTruthy()
  })

  it('should render loading state when user is not yet loaded', () => {
    // Arrange & Act
    const { container } = renderWithProviders(
      <UserProvider user={null} isLoading={true}>
        <div>content</div>
      </UserProvider>,
    )

    // Assert
    expect(container.textContent).not.toContain('content')
  })

  it('should provide logout function', () => {
    // Arrange
    const mockUser = {
      id: 'user-uuid-1',
      username: 'admin',
      is_active: true,
      token_version: 0,
      must_change_password: false,
      tenant_id: null,
    }

    // Act
    const { container } = renderWithProviders(
      <UserProvider user={mockUser} onLogout={() => {}}>
        <div>content</div>
      </UserProvider>,
    )

    // Assert
    expect(container.textContent).toContain('content')
  })

  it('should handle null user (not authenticated)', () => {
    // Arrange & Act
    const { container } = renderWithProviders(
      <UserProvider user={null}>
        <div>guest</div>
      </UserProvider>,
    )

    // Assert
    expect(container.textContent).toContain('guest')
  })
})
