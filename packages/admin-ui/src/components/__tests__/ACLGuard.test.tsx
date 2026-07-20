// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect } from 'vitest'
import { renderWithProviders } from '../../__tests__/helpers/test-utils'
import { ACLGuard } from '../ACLGuard'

describe('ACLGuard', () => {
  it('should render children when user has permission', () => {
    // Arrange & Act
    const { getByText } = renderWithProviders(
      <ACLGuard action="read" resource="user">
        <button>删除用户</button>
      </ACLGuard>,
    )

    // Assert
    expect(getByText('删除用户')).toBeTruthy()
  })

  it('should not render children when user lacks permission (render null)', () => {
    // Arrange & Act
    const { queryByText } = renderWithProviders(
      <ACLGuard action="delete" resource="user" can={false}>
        <button>删除用户</button>
      </ACLGuard>,
    )

    // Assert
    expect(queryByText('删除用户')).toBeNull()
  })

  it('should render null while ACL is loading (no flicker)', () => {
    // Arrange & Act
    const { container } = renderWithProviders(
      <ACLGuard action="read" resource="user" isLoading={true}>
        <span>content</span>
      </ACLGuard>,
    )

    // Assert
    expect(container.textContent).toBe('')
  })

  it('should render fallback content when permission denied and fallback provided', () => {
    // Arrange & Act
    const { getByText } = renderWithProviders(
      <ACLGuard action="delete" resource="user" can={false} fallback={<span>无权限</span>}>
        <button>删除用户</button>
      </ACLGuard>,
    )

    // Assert
    expect(getByText('无权限')).toBeTruthy()
  })
})
