// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect } from 'vitest'
import { resolveDependencyOrder } from '../index.js'

const baseManifest = {
  version: '1.0.0',
  display_name: 'Test',
  application: { entry: 'src/index.ts' },
  runtime: { mode: 'inline' as const, partition: 'SYSTEM' },
}

describe('依赖解析 - resolveDependencyOrder', () => {
  it('线性依赖排序: plugin-c -> plugin-b -> plugin-a -> [a, b, c]', () => {
    // Arrange
    const manifests = [
      { ...baseManifest, name: '@audebase/plugin-c', dependencies: ['@audebase/plugin-b'] },
      { ...baseManifest, name: '@audebase/plugin-b', dependencies: ['@audebase/plugin-a'] },
      { ...baseManifest, name: '@audebase/plugin-a', dependencies: [] },
    ]

    // Act
    const result = resolveDependencyOrder(manifests)

    // Assert
    const names = result.map(m => m.name)
    expect(names[0]).toBe('@audebase/plugin-a')
    expect(names[1]).toBe('@audebase/plugin-b')
    expect(names[2]).toBe('@audebase/plugin-c')
  })

  it('零依赖 plugin-core 排首位', () => {
    // Arrange
    const manifests = [
      { ...baseManifest, name: '@audebase/plugin-rbac', dependencies: ['@audebase/plugin-core'] },
      { ...baseManifest, name: '@audebase/plugin-core', dependencies: [] },
      { ...baseManifest, name: '@audebase/plugin-audit', dependencies: ['@audebase/plugin-core'] },
    ]

    // Act
    const result = resolveDependencyOrder(manifests)

    // Assert
    expect(result[0].name).toBe('@audebase/plugin-core')
  })

  it('循环依赖应抛出 ManifestValidationError', () => {
    // Arrange
    const manifests = [
      { ...baseManifest, name: '@audebase/plugin-a', dependencies: ['@audebase/plugin-b'] },
      { ...baseManifest, name: '@audebase/plugin-b', dependencies: ['@audebase/plugin-a'] },
    ]

    // Act & Assert
    expect(() => resolveDependencyOrder(manifests)).toThrow(/循环依赖/i)
  })

  it('无依赖的多个插件应全部返回', () => {
    // Arrange
    const manifests = [
      { ...baseManifest, name: '@audebase/plugin-x', dependencies: [] },
      { ...baseManifest, name: '@audebase/plugin-y', dependencies: [] },
    ]

    // Act
    const result = resolveDependencyOrder(manifests)

    // Assert
    expect(result).toHaveLength(2)
  })

  it('缺失依赖不阻塞加载（依赖可能在后续阶段安装）', () => {
    // Arrange
    const manifests = [
      { ...baseManifest, name: '@audebase/plugin-a', dependencies: ['@audebase/plugin-missing'] },
    ]

    // Act
    const result = resolveDependencyOrder(manifests)

    // Assert - should still return the manifest
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('@audebase/plugin-a')
  })
})
