/**
 * Plugin Manager - dependency resolution (Phase 1a)
 *
 * Kahn's algorithm topological sort.
 * D1.6: @audebase/plugin-core always first.
 */

import type { PluginDescriptor } from '@audebase/shared-types'

const PLUGIN_CORE = '@audebase/plugin-core'

/**
 * Resolve plugin load order via topological sort (Kahn's algorithm).
 *
 * @throws Error('循环依赖: ...') on circular dependency
 * @throws Error('缺失依赖: ...') on missing dependency
 * @throws Error on self-referencing dependency
 */
export async function resolveDependencyOrder(
  plugins: PluginDescriptor[],
): Promise<PluginDescriptor[]> {
  if (plugins.length === 0) {
    return []
  }

  const pluginMap = new Map<string, PluginDescriptor>()
  for (const p of plugins) {
    pluginMap.set(p.name, p)
  }

  // Detect self-reference
  for (const p of plugins) {
    if (p.dependencies.includes(p.name)) {
      throw new Error(`循环依赖: ${p.name} depends on itself`)
    }
  }

  // Detect missing dependencies
  for (const p of plugins) {
    for (const dep of p.dependencies) {
      if (!pluginMap.has(dep)) {
        throw new Error(`缺失依赖: ${p.name} requires ${dep}`)
      }
    }
  }

  // Build adjacency list: dep -> [plugins that depend on dep]
  // in-degree: number of unsatisfied dependencies per plugin
  const inDegree = new Map<string, number>()
  const dependents = new Map<string, string[]>() // dep -> plugins depending on dep

  for (const p of plugins) {
    inDegree.set(p.name, p.dependencies.length)
    for (const dep of p.dependencies) {
      const list = dependents.get(dep) ?? []
      list.push(p.name)
      dependents.set(dep, list)
    }
  }

  // Initialize queue with zero-in-degree nodes
  // plugin-core gets priority (D1.6)
  const queue: string[] = []
  for (const p of plugins) {
    if ((inDegree.get(p.name) ?? 0) === 0) {
      queue.push(p.name)
    }
  }

  // Sort queue so plugin-core is always first
  queue.sort((a, b) => {
    if (a === PLUGIN_CORE) return -1
    if (b === PLUGIN_CORE) return 1
    return 0
  })

  const result: string[] = []

  while (queue.length > 0) {
    const name = queue.shift()!
    result.push(name)

    // Get dependents and sort for deterministic plugin-core priority
    const deps = dependents.get(name) ?? []
    const newlyReady: string[] = []

    for (const depName of deps) {
      const newDegree = (inDegree.get(depName) ?? 1) - 1
      inDegree.set(depName, newDegree)
      if (newDegree === 0) {
        newlyReady.push(depName)
      }
    }

    // Sort newly ready nodes for plugin-core priority
    newlyReady.sort((a, b) => {
      if (a === PLUGIN_CORE) return -1
      if (b === PLUGIN_CORE) return 1
      return 0
    })

    // Append newly ready to queue, maintaining sort
    // Merge sorted newlyReady into queue (which stays sorted by core-priority + original order)
    for (const nr of newlyReady) {
      queue.push(nr)
    }
  }

  // Cycle detection: if not all nodes processed, there's a cycle
  if (result.length !== plugins.length) {
    const unresolved = plugins
      .filter((p) => !result.includes(p.name))
      .map((p) => p.name)
    throw new Error(`循环依赖: ${unresolved.join(' -> ')}`)
  }

  // Map back to descriptors
  return result.map((name) => pluginMap.get(name)!)
}
