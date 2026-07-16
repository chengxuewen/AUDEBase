import { vi } from 'vitest'

// ProcessPluginHost Mock - 5 constraints from SDD §7
// 1. async Promise - all methods return Promise
// 2. JSON serialization/deserialization - verify round-trip
// 3. 30s timeout - simulate cross-process timeout
// 4. 1-5ms delay injection - simulate communication latency
// 5. AUDE_STRICT_PLUGIN_HOST=1 forces JSON serialization assertion

const STRICT = process.env.AUDE_STRICT_PLUGIN_HOST === '1'
const MOCK_DELAY_MS = 2 // 1-5ms range

export function createMockPluginHost() {
  const call = vi.fn(async (method: string, ...args: unknown[]) => {
    // 4. Delay injection
    await new Promise((r) => setTimeout(r, MOCK_DELAY_MS))

    // 2 + 5. JSON serialization round-trip
    const serialized = JSON.parse(JSON.stringify(args))

    if (STRICT) {
      // 5. Strict mode: assert serialization is lossless
      expect(serialized).toEqual(args)
    }

    // ponytail: returns undefined until real mock responses are configured
    return undefined
  })

  // 3. 30s timeout
  const withTimeout = vi.fn(async (...args: unknown[]) => {
    return Promise.race([
      call(...args),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('PluginHost timeout (30s)')), 30_000),
      ),
    ])
  })

  return { call: withTimeout }
}
