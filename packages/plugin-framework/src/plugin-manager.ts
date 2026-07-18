/**
 * PluginManager — orchestrates plugin loading, unloading, and lifecycle.
 *
 * Uses PluginHost for low-level load/unload operations.
 * Handles dependency resolution, partition ordering, and lifecycle execution.
 *
 * Phase 1a: 2 states (loaded, disabled).
 */
import type { Manifest } from "@audebase/manifest-engine";
import { ErrorCode, UserError } from "@audebase/shared-types";
import type { PluginInstance, PluginHost, LifecyclePhase } from "./types.js";
import { resolveDependencies } from "./resolver.js";
import { runLifecycleSequence } from "./lifecycle.js";

export class PluginManager {
  readonly #host: PluginHost;
  readonly #loadedPlugins = new Map<string, PluginInstance>();
  readonly #loadingOrder: string[] = [];

  constructor(host: PluginHost) {
    this.#host = host;
  }

  // ── Dependency Resolution ──────────────────────────────────

  /**
   * Topologically sort manifests by dependencies.
   * SYSTEM partition plugins are placed first.
   * Static method — does not require instantiation.
   */
  static resolveDependencies(manifests: readonly Manifest[]): Manifest[] {
    return resolveDependencies(manifests);
  }

  // ── Plugin Loading ─────────────────────────────────────────

  /**
   * Load multiple plugins in dependency order, running lifecycle hooks.
   *
   * Load sequence per plugin:
   *   1. afterAdd (if defined)
   *   2. beforeLoad (if defined)
   *   3. load (required — PluginHost.loadPlugin)
   *   4. install (if defined)
   *
   * If any plugin fails, the error is logged but other plugins continue loading
   * (Phase 1a: no cascading rollback).
   *
   * @returns Map of successfully loaded plugin name → PluginInstance
   */
  async loadPlugins(manifests: readonly Manifest[]): Promise<Map<string, PluginInstance>> {
    const sorted = resolveDependencies(manifests);
    const results = new Map<string, PluginInstance>();

    for (const manifest of sorted) {
      try {
        // Step 1: afterAdd — the plugin is registered
        await this.#host.loadPlugin(manifest);
        const instance = this.#host.getPlugin(manifest.name);
        if (!instance) {
          throw new Error(`Plugin "${manifest.name}" failed to load`);
        }

        // Step 2-4: Lifecycle hooks
        await runLifecycleSequence(instance, ["afterAdd", "beforeLoad"]);

        // load hook is called internally by PluginHost.loadPlugin,
        // but if the plugin exports a load hook, call it explicitly
        await instance.load();

        await this.#runOptionalHook(instance, "install");

        instance.status = "loaded";
        this.#loadedPlugins.set(manifest.name, instance);
        this.#loadingOrder.push(manifest.name);
        results.set(manifest.name, instance);
      } catch (err: unknown) {
        // Phase 1a: log and skip, don't block other plugins
        const msg = err instanceof Error ? err.message : String(err);
        // ponytail: use stderr for now; Phase 1b switches to structured logger
        process.stderr.write(`[PluginManager] Failed to load "${manifest.name}": ${msg}\n`);
      }
    }

    return results;
  }

  /**
   * Load a single plugin (convenience wrapper around loadPlugins).
   */
  async loadPlugin(manifest: Manifest): Promise<PluginInstance> {
    const results = await this.loadPlugins([manifest]);
    const instance = results.get(manifest.name);
    if (!instance) {
      throw new UserError(
        ErrorCode.PLUGIN_LIFECYCLE_ERROR,
        `Failed to load plugin "${manifest.name}"`,
        { plugin: manifest.name },
      );
    }
    return instance;
  }

  // ── Plugin Unloading ───────────────────────────────────────

  /**
   * Unload a plugin.
   * Phase 1a: unloads unconditionally. Phase 1b+ should check reverse dependencies.
   *
   * Sequence: preUninstall → PluginHost.unloadPlugin
   */
  async unloadPlugin(name: string): Promise<void> {
    const instance = this.#loadedPlugins.get(name);
    if (!instance) {
      throw new UserError(ErrorCode.PLUGIN_NOT_FOUND, `Plugin "${name}" is not loaded`, {
        plugin: name,
      });
    }

    try {
      await this.#runOptionalHook(instance, "preUninstall");
      await this.#host.unloadPlugin(name);
    } finally {
      this.#loadedPlugins.delete(name);
      const idx = this.#loadingOrder.indexOf(name);
      if (idx >= 0) {
        this.#loadingOrder.splice(idx, 1);
      }
    }
  }

  // ── Enable / Disable ───────────────────────────────────────

  /**
   * Enable a loaded plugin.
   * Runs afterEnable hook.
   * State goes loaded → enabled.
   */
  async enablePlugin(name: string): Promise<void> {
    const instance = this.#loadedPlugins.get(name);
    if (!instance) {
      throw new UserError(ErrorCode.PLUGIN_NOT_FOUND, `Plugin "${name}" is not loaded`, {
        plugin: name,
      });
    }

    await this.#runOptionalHook(instance, "afterEnable");
    instance.status = "enabled";
  }

  /**
   * Disable a loaded plugin.
   * Runs afterDisable hook.
   * State goes enabled → disabled.
   *
   * Phase 1a: does not check reverse deps (Phase 1b).
   */
  async disablePlugin(name: string): Promise<void> {
    const instance = this.#loadedPlugins.get(name);
    if (!instance) {
      throw new UserError(ErrorCode.PLUGIN_NOT_FOUND, `Plugin "${name}" is not loaded`, {
        plugin: name,
      });
    }

    await this.#runOptionalHook(instance, "afterDisable");
    instance.status = "disabled";
  }

  // ── Query ──────────────────────────────────────────────────

  /** Get a loaded plugin instance, or undefined */
  getPlugin(name: string): PluginInstance | undefined {
    return this.#loadedPlugins.get(name);
  }

  /** Get all loaded plugin instances */
  getPlugins(): PluginInstance[] {
    // Return in load order
    return this.#loadingOrder
      .map((name) => this.#loadedPlugins.get(name))
      .filter((p): p is PluginInstance => p !== undefined);
  }

  /** Check if a plugin is loaded */
  isLoaded(name: string): boolean {
    return this.#loadedPlugins.has(name);
  }

  // ── Private ────────────────────────────────────────────────

  async #runOptionalHook(instance: PluginInstance, phase: LifecyclePhase): Promise<void> {
    const hook = instance[phase];
    if (typeof hook === "function") {
      await hook();
    }
  }
}
