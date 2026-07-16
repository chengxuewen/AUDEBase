// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect } from 'vitest'
import { SlotRegistry } from '../SlotRegistry'

describe('SlotRegistry', () => {
  it('should register and retrieve components at a named slot', () => {
    // Arrange
    const registry = new SlotRegistry()

    // Act
    registry.add('header.actions.right', {
      component: () => null,
      order: 10,
    })
    const components = registry.get('header.actions.right')

    // Assert
    expect(components).toHaveLength(1)
    expect(components[0].order).toBe(10)
  })

  it('should override when same key is registered twice', () => {
    // Arrange
    const registry = new SlotRegistry()

    // Act
    registry.add('header.actions.right', {
      component: () => null,
      key: 'notifications',
    })
    registry.add('header.actions.right', {
      component: () => null,
      key: 'notifications',
    })
    const components = registry.get('header.actions.right')

    // Assert
    expect(components).toHaveLength(1)
  })

  it('should return empty array for unregistered slot', () => {
    // Arrange
    const registry = new SlotRegistry()

    // Act
    const components = registry.get('sidebar.bottom')

    // Assert
    expect(components).toHaveLength(0)
  })

  it('should sort components by order property', () => {
    // Arrange
    const registry = new SlotRegistry()

    // Act
    registry.add('header.actions.right', { component: () => null, order: 20, key: 'b' })
    registry.add('header.actions.right', { component: () => null, order: 10, key: 'a' })
    const components = registry.get('header.actions.right')

    // Assert
    expect(components).toHaveLength(2)
    expect(components[0].order).toBeLessThanOrEqual(components[1].order)
  })
})
