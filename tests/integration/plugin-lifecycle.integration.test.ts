/**
 * Phase 1a Integration Test: Plugin Lifecycle
 *
 * Verifies cross-package interaction:
 * - shared-types -> plugin-framework (PluginDescriptor type)
 * - plugin-framework -> plugin-core (PluginHost interface)
 * - manifest-engine -> plugin-framework (manifest validation + dependency resolution)
 * - plugin-core bootstrap data generation
 */

import { describe, it, expect } from 'vitest'
import { resolveDependencyOrder } from '@audebase/plugin-framework'
import { parseManifestYaml } from '@audebase/manifest-engine'
import { generateBootstrapData, isBootstrapComplete, PluginCore } from '@audebase/plugin-core'
import type { PluginDescriptor, PluginHost } from '@audebase/shared-types'

function createMockDb() {
  return {
    query: {
      users: { findFirst: async () => null },
      roles: { findFirst: async () => null },
      tenants: { findFirst: async () => null },
      modules: { findFirst: async () => null },
    },
    insert: () => ({ values: () => Promise.resolve() }),
    update: () => Promise.resolve(),
    delete: () => Promise.resolve(),
  }
}

function createMockPluginHost(): PluginHost {
  return {
    name: '@audebase/plugin-core',
    manifest: {} as never,
    call: async () => undefined,
    on: () => {},
    off: () => {},
  }
}

describe('Plugin Lifecycle Integration', () => {
  it('should resolve dependency order with plugin-core first', async () => {
    // Arrange
    const plugins: PluginDescriptor[] = [
      {
        name: '@audebase/plugin-rbac',
        version: '0.1.0',
        display_name: 'RBAC',
        dependencies: ['@audebase/plugin-core'],
      },
      {
        name: '@audebase/plugin-core',
        version: '0.1.0',
        display_name: 'Core',
        dependencies: [],
      },
      {
        name: '@audebase/plugin-audit',
        version: '0.1.0',
        display_name: 'Audit',
        dependencies: ['@audebase/plugin-core', '@audebase/plugin-rbac'],
      },
    ]

    // Act
    const order = await resolveDependencyOrder(plugins)

    // Assert
    expect(order[0]!.name).toBe('@audebase/plugin-core')
    expect(order[1]!.name).toBe('@audebase/plugin-rbac')
    expect(order[2]!.name).toBe('@audebase/plugin-audit')
  })

  it('should parse YAML manifest and resolve dependencies in order', async () => {
    // Arrange
    const manifestYaml = `
name: '@audebase/plugin-test'
version: '0.1.0'
display_name: 'Test Plugin'
dependencies:
  - '@audebase/plugin-core'
`

    // Act
    const manifest = parseManifestYaml(manifestYaml)
    const order = await resolveDependencyOrder([
      { name: '@audebase/plugin-core', version: '0.1.0', display_name: 'Core', dependencies: [] },
      { name: manifest.name, version: manifest.version, display_name: manifest.display_name, dependencies: manifest.dependencies },
    ])

    // Assert
    expect(manifest.name).toBe('@audebase/plugin-test')
    expect(order[0]!.name).toBe('@audebase/plugin-core')
    expect(order[1]!.name).toBe('@audebase/plugin-test')
  })

  it('should generate bootstrap data and check completion', async () => {
    // Arrange
    const mockDb = createMockDb()
    const host = createMockPluginHost()

    // Act
    const plugin = new PluginCore()
    plugin.injectHost(host)
    const data = generateBootstrapData()

    // Assert
    expect(data.adminUser.username).toBe('admin')
    expect(data.adminUser.mustChangePassword).toBe(true)
    expect(data.defaultRoles).toHaveLength(2)
    expect(data.defaultRoles[0]!.slug).toBe('admin')
    expect(data.defaultRoles[1]!.slug).toBe('member')
    expect(data.corePermissions.length).toBeGreaterThan(0)

    // Assert - bootstrap check returns false for empty DB
    expect(await isBootstrapComplete(mockDb)).toBe(false)
  })
})