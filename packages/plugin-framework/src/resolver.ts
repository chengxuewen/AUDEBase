/**
 * Dependency resolution via Kahn topological sort.
 *
 * Handles:
 * - Linear chains
 * - Diamond dependencies
 * - Circular dep detection → throws
 * - Missing dep detection → throws
 * - SYSTEM partition loads first (stable sort post-topo)
 */
import type { Manifest } from "@audebase/manifest-engine";
import { ErrorCode, UserError } from "@audebase/shared-types";

// ── Public API ─────────────────────────────────────────────────

/**
 * Topologically sort manifests by their `dependencies` field.
 * SYSTEM partition plugins are placed first.
 *
 * @throws UserError with PLUGIN_CIRCULAR_DEPENDENCY on cycles
 * @throws UserError with PLUGIN_DEPENDENCY_MISSING on missing deps
 */
export function resolveDependencies(manifests: readonly Manifest[]): Manifest[] {
  const sorted = kahnSort(manifests);
  // Stable sort: SYSTEM comes first, preserving topo order within groups
  return stableSortByPartition(sorted);
}

// ── Kahn Algorithm ────────────────────────────────────────────

function kahnSort(manifests: readonly Manifest[]): Manifest[] {
  const nameToManifest = new Map<string, Manifest>();
  // indegree: how many unmet dependencies this plugin has
  const indegree = new Map<string, number>();
  // adj: plugin name → plugins that depend on it
  const adj = new Map<string, string[]>();

  for (const m of manifests) {
    nameToManifest.set(m.name, m);
    indegree.set(m.name, 0);
    adj.set(m.name, []);
  }

  // Build graph
  for (const m of manifests) {
    const deps = m.dependencies ?? [];
    for (const dep of deps) {
      if (!nameToManifest.has(dep)) {
        throw new UserError(
          ErrorCode.PLUGIN_DEPENDENCY_MISSING,
          `Plugin "${m.name}" depends on "${dep}" which is not in the available manifests`,
          { plugin: m.name, missing: dep },
        );
      }
      // dep → m (m depends on dep, so dep must come first)
      const adjList = adj.get(dep);
      if (adjList) {
        adjList.push(m.name);
      }
      indegree.set(m.name, (indegree.get(m.name) ?? 0) + 1);
    }
  }

  // Queue: nodes with indegree 0
  const queue: string[] = [];
  for (const [name, deg] of indegree) {
    if (deg === 0) {
      queue.push(name);
    }
  }

  const result: Manifest[] = [];

  while (queue.length > 0) {
    // ponytail: array.shift() is O(n), but Phase 1a has <100 plugins
    const current = queue.shift()!;
    const manifest = nameToManifest.get(current);
    if (manifest) {
      result.push(manifest);
    }

    for (const neighbor of adj.get(current) ?? []) {
      const newDeg = (indegree.get(neighbor) ?? 1) - 1;
      indegree.set(neighbor, newDeg);
      if (newDeg === 0) {
        queue.push(neighbor);
      }
    }
  }

  // If not all plugins were sorted, there's a cycle
  if (result.length !== manifests.length) {
    const unresolved = manifests
      .filter((m) => !result.some((r) => r.name === m.name))
      .map((m) => m.name);
    throw new UserError(
      ErrorCode.PLUGIN_CIRCULAR_DEPENDENCY,
      `Circular dependency detected involving: ${unresolved.join(", ")}`,
      { plugins: unresolved },
    );
  }

  return result;
}

// ── Partition Sorting ─────────────────────────────────────────

function stableSortByPartition(manifests: Manifest[]): Manifest[] {
  // ponytail: stable sort by partition priority
  // SYSTEM first, then everything else, preserving topo order within groups
  const system: Manifest[] = [];
  const others: Manifest[] = [];

  for (const m of manifests) {
    if (m.runtime?.partition === "SYSTEM") {
      system.push(m);
    } else {
      others.push(m);
    }
  }

  return [...system, ...others];
}
