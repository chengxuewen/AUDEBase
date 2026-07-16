// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect, vi } from 'vitest'
import { createSlowQueryHook } from '../index'

describe('SlowQueryDetection', () => {
  it('should log a warn when query duration exceeds 100ms threshold', () => {
    // Arrange
    const mockLogger = { warn: vi.fn() }
    const hook = createSlowQueryHook(mockLogger, { slowQueryThresholdMs: 100 })

    const queryContext = {
      sql: 'SELECT * FROM users WHERE username LIKE $1',
      params: ['%admin%'],
    }

    // Act - simulate a query that takes 250ms
    hook.onQuery?.([], queryContext)
    const startTime = Date.now()
    while (Date.now() - startTime < 120) { /* spin to exceed 100ms */ }
    hook.onResult?.([], {})

    // Assert
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        sql: expect.any(String),
        duration: expect.any(Number),
      }),
    )
    const callArgs = mockLogger.warn.mock.calls[0][1]
    expect(callArgs.duration).toBeGreaterThanOrEqual(100)
  })

  it('should not log when query duration is at or below 100ms', () => {
    // Arrange
    const mockLogger = { warn: vi.fn() }
    const hook = createSlowQueryHook(mockLogger, { slowQueryThresholdMs: 100 })

    // Act - query resolves immediately
    hook.onQuery?.([], { sql: 'SELECT 1' })
    hook.onResult?.([], {})

    // Assert
    expect(mockLogger.warn).not.toHaveBeenCalled()
  })

  it('should respect a custom threshold (D9.1 configurable threshold)', () => {
    // Arrange
    const mockLogger = { warn: vi.fn() }
    const hook = createSlowQueryHook(mockLogger, { slowQueryThresholdMs: 50 })

    // Act - wait 80ms (above custom 50ms threshold, below default 100ms)
    hook.onQuery?.([], { sql: 'SELECT 1' })
    const start = Date.now()
    while (Date.now() - start < 80) { /* spin */ }
    hook.onResult?.([], {})

    // Assert
    expect(mockLogger.warn).toHaveBeenCalled()
  })
})
