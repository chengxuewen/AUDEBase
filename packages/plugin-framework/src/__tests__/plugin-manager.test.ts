/**
 * Tests for PluginManager — orchestration layer.
 *
 * SKIPPED: PluginManager class was never implemented.
 * `packages/plugin-framework/src/plugin-manager.ts` only exports `resolveDependencyOrder`.
 * Re-enable these tests when PluginManager class is implemented.
 */
import { describe, it, expect } from "vitest";

describe.skip("PluginManager", () => {
  it.todo("loads plugins in dependency order");
  it.todo("enables and disables plugins");
  it.todo("fires lifecycle hooks in correct order");
  it.todo("handles load errors with skip policy");
  it.todo("handles load errors with abort policy");
  it.todo("handles install errors");
  it.todo("tracks plugin states correctly");
  it.todo("resolves dependencies before load");
  it.todo("rejects plugins with unresolved deps");
  it.todo("calls beforeLoad before load");
  it.todo("calls afterEnable when plugin loaded");
  it.todo("calls afterDisable when plugin disabled");
  it.todo("calls preUninstall before removal");
  it.todo("handles missing manifest gracefully");
  it.todo("provides PluginHost context to plugins");
});
