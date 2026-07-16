// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect } from 'vitest'
import { resolveDependencyOrder } from '../plugin-manager'
import type { PluginDescriptor } from '@audebase/shared-types'

// 辅助函数：创建测试 PluginDescriptor
function createPlugin(
  name: string,
  dependencies: string[] = [],
): PluginDescriptor {
  return {
    id: name,
    name,
    version: '1.0.0',
    display_name: name,
    state: 'discovered',
    category: null,
    description: null,
    author: null,
    license: null,
    dependencies,
    runtime_mode: 'inline',
    runtime_partition: 'SYSTEM',
    auto_install: false,
    installed_at: null,
  }
}

describe('resolveDependencyOrder', () => {
  it('应处理空插件列表', async () => {
    // Arrange
    const plugins: PluginDescriptor[] = []

    // Act
    const result = await resolveDependencyOrder(plugins)

    // Assert
    expect(result).toHaveLength(0)
  })

  it('应正确排序线性依赖链', async () => {
    // Arrange
    // C -> B -> A (A 在最底层，应最先加载)
    const plugins = [
      createPlugin('@audebase/plugin-c', ['@audebase/plugin-b']),
      createPlugin('@audebase/plugin-b', ['@audebase/plugin-a']),
      createPlugin('@audebase/plugin-a'),
    ]

    // Act
    const result = await resolveDependencyOrder(plugins)

    // Assert
    const names = result.map(p => p.name)
    expect(names.indexOf('@audebase/plugin-a'))
      .toBeLessThan(names.indexOf('@audebase/plugin-b'))
    expect(names.indexOf('@audebase/plugin-b'))
      .toBeLessThan(names.indexOf('@audebase/plugin-c'))
  })

  it('应正确排序多依赖（菱形依赖）', async () => {
    // Arrange
    // D -> B + C, B -> A, C -> A
    const plugins = [
      createPlugin('@audebase/plugin-d', ['@audebase/plugin-b', '@audebase/plugin-c']),
      createPlugin('@audebase/plugin-b', ['@audebase/plugin-a']),
      createPlugin('@audebase/plugin-c', ['@audebase/plugin-a']),
      createPlugin('@audebase/plugin-a'),
    ]

    // Act
    const result = await resolveDependencyOrder(plugins)

    // Assert
    const names = result.map(p => p.name)
    expect(names.indexOf('@audebase/plugin-a')).toBe(0)  // A 最先
    expect(names.indexOf('@audebase/plugin-d')).toBe(names.length - 1)  // D 最后
    // B 和 C 的顺序无关紧要（拓扑相邻层级）
  })

  it('应检测循环依赖', async () => {
    // Arrange
    // A -> B -> C -> A (循环)
    const plugins = [
      createPlugin('@audebase/plugin-a', ['@audebase/plugin-b']),
      createPlugin('@audebase/plugin-b', ['@audebase/plugin-c']),
      createPlugin('@audebase/plugin-c', ['@audebase/plugin-a']),
    ]

    // Act & Assert
    await expect(resolveDependencyOrder(plugins))
      .rejects.toThrow('循环依赖')
  })

  it('应检测缺失依赖', async () => {
    // Arrange
    const plugins = [
      createPlugin('@audebase/plugin-a', ['@audebase/plugin-missing']),
    ]

    // Act & Assert
    await expect(resolveDependencyOrder(plugins))
      .rejects.toThrow('缺失依赖')
  })

  it('plugin-core 应始终排在第一位', async () => {
    // Arrange
    // 无论依赖如何声明，plugin-core 都是最先加载的
    const plugins = [
      createPlugin('@audebase/plugin-b'),
      createPlugin('@audebase/plugin-a'),
      createPlugin('@audebase/plugin-core'), // D1.6: dependencies: []
    ]

    // Act
    const result = await resolveDependencyOrder(plugins)

    // Assert
    expect(result[0].name).toBe('@audebase/plugin-core')
  })

  it('应处理自引用依赖（拒绝）', async () => {
    // Arrange
    const plugins = [
      createPlugin('@audebase/plugin-a', ['@audebase/plugin-a']),
    ]

    // Act & Assert
    await expect(resolveDependencyOrder(plugins))
      .rejects.toThrow()
  })

  it('单个无依赖插件应直接返回', async () => {
    // Arrange
    const plugins = [
      createPlugin('@audebase/plugin-standalone'),
    ]

    // Act
    const result = await resolveDependencyOrder(plugins)

    // Assert
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('@audebase/plugin-standalone')
  })
})
