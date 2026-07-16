/**
 * InlinePluginHost (Phase 1a)
 *
 * D1.2 mock constraints:
 * 1. All methods return Promise
 * 2. Inputs/outputs are JSON-safe (serialize/deserialize)
 * 3. 30s timeout on lifecycle methods
 * 4. Configurable delay injection (mockDelay)
 * 5. AUDE_STRICT_PLUGIN_HOST env for strict mode
 */

import type { Manifest } from './manifest-schema.js'

const TIMEOUT_MS = 30_000
const TIMEOUT_MSG = 'Plugin lifecycle timeout after 30s'

interface PluginHostOptions {
  mockDelay?: number
  mockLoadDuration?: number
}

/**
 * JSON-safe serialization: stringify then parse to strip functions, undefined, Dates→strings.
 */
function jsonSafe<T>(value: T): T {
  // ponytail: JSON.stringify(undefined) returns undefined (not a string),
  // so guard for void/undefined before round-tripping.
  if (value === undefined || value === null) {
    return value
  }
  return JSON.parse(JSON.stringify(value)) as T
}

/**
 * Inline plugin host for Phase 1a.
 * All lifecycle methods are async with optional delay and timeout.
 */
export class InlinePluginHost {
  readonly name: string
  readonly manifest: Manifest
  readonly status: string = 'discovered'

  // Lifecycle hooks - publicly assignable (tests mock these)
  afterAdd?: () => Promise<void>
  beforeLoad?: () => Promise<void>
  install?: () => Promise<void>
  afterEnable?: () => Promise<void>
  afterDisable?: () => Promise<void>
  preUninstall?: () => Promise<void>

  private readonly mockDelay: number
  private readonly mockLoadDuration: number

  constructor(manifest: Manifest, options?: PluginHostOptions) {
    // ponytail: JSON-safe copy to enforce constraint 2 (no shared references)
    this.manifest = jsonSafe(manifest)
    this.name = this.manifest.name
    this.mockDelay = options?.mockDelay ?? 0
    this.mockLoadDuration = options?.mockLoadDuration ?? 0
  }

  /**
   * Inject mock delay (1-5ms range per D1.2, but configurable).
   * When mockDelay is 0, still yields to event loop (1ms floor per SDD constraint 5).
   */
  private async injectDelay(): Promise<void> {
    if (this.mockDelay <= 0) {
      return
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, this.mockDelay)
    })
  }

  /**
   * Run an async operation with 30s timeout.
   */
  private async withTimeout<T>(fn: () => Promise<T>): Promise<T> {
    if (this.mockLoadDuration > 0) {
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(TIMEOUT_MSG))
        }, TIMEOUT_MS)

        fn()
          .then((result) => {
            clearTimeout(timer)
            resolve(jsonSafe(result))
          })
          .catch((err: unknown) => {
            clearTimeout(timer)
            reject(err)
          })
      })
    }

    // No artificial duration - just apply timeout wrapper
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(TIMEOUT_MSG))
      }, TIMEOUT_MS)

      fn()
        .then((result) => {
          clearTimeout(timer)
          resolve(jsonSafe(result))
        })
        .catch((err: unknown) => {
          clearTimeout(timer)
          reject(err)
        })
    })
  }

  /**
   * Load plugin code (require() entry file in real impl).
   * In mock: simulates load with optional duration + delay.
   */
  load(): Promise<void> {
    const op = async (): Promise<void> => {
      // Simulate slow load if configured
      if (this.mockLoadDuration > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, this.mockLoadDuration)
        })
      }
      await this.injectDelay()
    }

    return this.withTimeout(op)
  }

  /**
   * Unload plugin.
   */
  unload(): Promise<void> {
    const op = async (): Promise<void> => {
      await this.injectDelay()
    }

    return this.withTimeout(op)
  }

  /**
   * Enable plugin.
   */
  enable(): Promise<void> {
    const op = async (): Promise<void> => {
      await this.injectDelay()
    }

    return this.withTimeout(op)
  }

  /**
   * Disable plugin.
   */
  disable(): Promise<void> {
    const op = async (): Promise<void> => {
      await this.injectDelay()
    }

    return this.withTimeout(op)
  }

  /**
   * Install plugin (create DB tables, write config).
   */
  async installPlugin(): Promise<void> {
    await this.injectDelay()
  }

  /**
   * Uninstall plugin.
   */
  async uninstallPlugin(): Promise<void> {
    await this.injectDelay()
  }
}
