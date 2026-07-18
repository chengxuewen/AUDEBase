/**
 * Lifecycle hook runner.
 *
 * Runs a lifecycle phase on a PluginInstance.
 * Skips undefined hooks silently.
 * Errors from hooks are propagated to caller (no silent swallowing).
 */
import type { PluginInstance, LifecyclePhase } from "./types.js";
import { ErrorCode, UserError } from "@audebase/shared-types";

/**
 * Run a single lifecycle phase on a plugin instance.
 *
 * @param instance - The plugin instance
 * @param phase - The lifecycle phase to execute
 * @returns Resolves when the hook completes
 * @throws UserError if the hook throws
 */
export async function runLifecycle(instance: PluginInstance, phase: LifecyclePhase): Promise<void> {
  const hook = instance[phase];

  if (typeof hook !== "function") {
    // ponytail: undefined hooks are silently skipped — that's the contract
    return;
  }

  try {
    await hook();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new UserError(
      ErrorCode.PLUGIN_LIFECYCLE_ERROR,
      `Plugin "${instance.name}" lifecycle phase "${phase}" failed: ${message}`,
      {
        plugin: instance.name,
        phase,
        originalError: message,
      },
    );
  }
}

/**
 * Run a sequence of lifecycle phases in order.
 * Stops at the first error — no partial rollback in Phase 1a.
 *
 * @param instance - The plugin instance
 * @param phases - Phases to run in order
 * @throws UserError on first hook failure
 */
export async function runLifecycleSequence(
  instance: PluginInstance,
  phases: readonly LifecyclePhase[],
): Promise<void> {
  for (const phase of phases) {
    await runLifecycle(instance, phase);
  }
}
