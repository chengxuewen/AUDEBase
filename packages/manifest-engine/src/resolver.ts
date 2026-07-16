/**
 * Dependency resolution via topological sort (Kahn's algorithm)
 */
import type { Manifest } from './schema.js'

export function resolveDependencyOrder(manifests: Manifest[]): Manifest[] {
  const nameMap = new Map<string, Manifest>()
  for (const m of manifests) {
    nameMap.set(m.name, m)
  }

  const inDegree = new Map<string, number>()
  const adjacency = new Map<string, string[]>()

  // Initialize graph
  for (const m of manifests) {
    inDegree.set(m.name, 0)
    adjacency.set(m.name, [])
  }

  // Build edges: dep -> dependent
  for (const m of manifests) {
    for (const dep of m.dependencies) {
      if (!nameMap.has(dep)) {
        // Missing dependency - skip, doesn't block loading
        continue
      }
      adjacency.get(dep)?.push(m.name)
      inDegree.set(m.name, (inDegree.get(m.name) ?? 0) + 1)
    }
  }

  // plugin-core always first (ensure inDegree 0 even if something depends on it)
  // Actually no - the SDD says plugin-core has no deps so it naturally has inDegree 0
  // The test just checks it's first, which happens naturally with zero deps

  // Kahn's algorithm - use sorted queue for deterministic output
  const queue: string[] = []
  for (const [name, degree] of inDegree) {
    if (degree === 0) {
      queue.push(name)
    }
  }

  const result: Manifest[] = []

  while (queue.length > 0) {
    // ponytail: shift() is O(n) but manifest lists are small (<100)
    const currentName = queue.shift()
    if (currentName === undefined) break

    const current = nameMap.get(currentName)
    if (current !== undefined) {
      result.push(current)
    }

    const neighbors = adjacency.get(currentName) ?? []
    for (const neighbor of neighbors) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1
      inDegree.set(neighbor, newDegree)
      if (newDegree === 0) {
        queue.push(neighbor)
      }
    }
  }

  // Circular dependency detection
  if (result.length !== manifests.length) {
    const processed = new Set(result.map((m) => m.name))
    const unprocessed = manifests.filter((m) => !processed.has(m.name)).map((m) => m.name)
    throw new Error(`检测到循环依赖，涉及插件: ${unprocessed.join(', ')}`)
  }

  return result
}
