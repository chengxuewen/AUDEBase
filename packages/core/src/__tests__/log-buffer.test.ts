import { describe, it, expect, beforeEach } from 'vitest'
import { LogBuffer, globalLogBuffer, type LogEntry } from '../logs/buffer.js'

function makeEntry(msg: string, level = 'info'): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    msg,
  }
}

describe('LogBuffer', () => {
  let buffer: LogBuffer

  beforeEach(() => {
    buffer = new LogBuffer(5) // small capacity for eviction testing
  })

  // --- push ---

  it('push adds entries to the buffer', () => {
    // Arrange
    const entry = makeEntry('test message')

    // Act
    buffer.push(entry)

    // Assert
    expect(buffer.size).toBe(1)
  })

  it('push adds multiple entries in order', () => {
    // Arrange & Act
    buffer.push(makeEntry('first'))
    buffer.push(makeEntry('second'))
    buffer.push(makeEntry('third'))

    // Assert
    expect(buffer.size).toBe(3)
    const snapshot = buffer.snapshot()
    expect(snapshot).toHaveLength(3)
  })

  // --- capacity eviction ---

  it('evicts oldest entry when capacity exceeded', () => {
    // Arrange
    for (let i = 1; i <= 6; i++) {
      buffer.push(makeEntry(`msg-${i}`))
    }

    // Act & Assert
    expect(buffer.size).toBe(5)
    const snapshot = buffer.snapshot()
    // newest-first: msg-6 is first in snapshot
    expect(snapshot[0].msg).toBe('msg-6')
    expect(snapshot[4].msg).toBe('msg-2')
    // msg-1 was evicted
    expect(snapshot.some((e) => e.msg === 'msg-1')).toBe(false)
  })

  it('does not evict when at exact capacity', () => {
    // Arrange & Act
    for (let i = 1; i <= 5; i++) {
      buffer.push(makeEntry(`msg-${i}`))
    }

    // Assert
    expect(buffer.size).toBe(5)
  })

  // --- snapshot ---

  it('snapshot returns newest-first entries', () => {
    // Arrange
    buffer.push(makeEntry('old'))
    buffer.push(makeEntry('new'))

    // Act
    const snapshot = buffer.snapshot()

    // Assert
    expect(snapshot[0].msg).toBe('new')
    expect(snapshot[1].msg).toBe('old')
  })

  it('snapshot returns empty array for empty buffer', () => {
    // Act
    const snapshot = buffer.snapshot()

    // Assert
    expect(snapshot).toEqual([])
  })

  it('snapshot does not mutate the buffer', () => {
    // Arrange
    buffer.push(makeEntry('test'))

    // Act
    buffer.snapshot()

    // Assert
    expect(buffer.size).toBe(1)
  })

  // --- clear ---

  it('clear removes all entries', () => {
    // Arrange
    buffer.push(makeEntry('a'))
    buffer.push(makeEntry('b'))

    // Act
    buffer.clear()

    // Assert
    expect(buffer.size).toBe(0)
    expect(buffer.snapshot()).toEqual([])
  })

  it('clear on already-empty buffer is a no-op', () => {
    // Act
    buffer.clear()

    // Assert
    expect(buffer.size).toBe(0)
  })

  // --- size ---

  it('size returns 0 for new buffer', () => {
    expect(buffer.size).toBe(0)
  })

  it('size increments with each push', () => {
    buffer.push(makeEntry('1'))
    expect(buffer.size).toBe(1)
    buffer.push(makeEntry('2'))
    expect(buffer.size).toBe(2)
  })

  // --- default capacity ---

  it('default capacity is 100', () => {
    const defaultBuffer = new LogBuffer()
    // Fill with 100 entries
    for (let i = 0; i < 100; i++) {
      defaultBuffer.push(makeEntry(`msg-${i}`))
    }
    expect(defaultBuffer.size).toBe(100)

    // push 101st — should evict first
    defaultBuffer.push(makeEntry('overflow'))
    expect(defaultBuffer.size).toBe(100)
  })

  // --- global singleton ---

  it('globalLogBuffer is a LogBuffer instance', () => {
    expect(globalLogBuffer).toBeInstanceOf(LogBuffer)
  })

  it('globalLogBuffer has default capacity', () => {
    // Fill to capacity
    for (let i = 0; i < 100; i++) {
      globalLogBuffer.push(makeEntry(`global-${i}`))
    }
    expect(globalLogBuffer.size).toBeLessThanOrEqual(100)
    // Clean up
    globalLogBuffer.clear()
  })

  // --- entry preservation ---

  it('preserves entry fields including optional requestId', () => {
    // Arrange
    const entry: LogEntry = {
      timestamp: '2026-07-20T00:00:00.000Z',
      level: 'warn',
      msg: 'slow query detected',
      requestId: 'req-abc-123',
    }

    // Act
    buffer.push(entry)
    const snapshot = buffer.snapshot()

    // Assert
    expect(snapshot[0]).toEqual(entry)
  })

  it('requestId is undefined when not provided', () => {
    // Arrange
    buffer.push(makeEntry('no request id'))

    // Act
    const snapshot = buffer.snapshot()

    // Assert
    expect(snapshot[0].requestId).toBeUndefined()
  })
})
