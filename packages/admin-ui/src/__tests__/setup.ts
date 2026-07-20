import '@testing-library/jest-dom/vitest'
import { vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// localStorage mock for happy-dom/jsdom
const store: Record<string, string> = {}
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { Object.keys(store).forEach(k => delete store[k]) },
    get length() { return Object.keys(store).length },
    key: (i: number) => Object.keys(store)[i] ?? null,
  },
  writable: true,
  configurable: true,
})

// Auto-wrap vi.mock factory return values: function properties become vi.fn()
globalThis.__wrapMockResult = <T>(obj: T): T => {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    const wrapped: Record<string, unknown> = {}
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      const val = (obj as Record<string, unknown>)[key]
      if (typeof val === 'function' && !('_isMockFunction' in val)) {
        wrapped[key] = vi.fn(val as (...a: unknown[]) => unknown)
      } else {
        wrapped[key] = val
      }
    }
    return wrapped as T
  }
  return obj
}

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

// Polyfill ResizeObserver for jsdom (antd requires it)
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}
afterEach(() => {
  cleanup()
})
