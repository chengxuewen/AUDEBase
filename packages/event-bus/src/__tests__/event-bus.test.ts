/**
 * @audebase/event-bus - EventBus unit tests
 *
 * AAA pattern. Each test clears the bus in afterEach to avoid state leaks.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { z } from 'zod'
import { EventBus, matchSubject, EventBusValidationError } from '../index.js'

describe('EventBus', () => {
  let bus: EventBus

  beforeEach(() => {
    bus = new EventBus({ partition: 'test' })
  })

  afterEach(() => {
    bus.clear()
  })

  // --- Basic publish/subscribe ---

  describe('basic publish/subscribe', () => {
    it('delivers payload to a matching subscriber', () => {
      // Arrange
      const received: unknown[] = []
      bus.subscribe('order.created', (payload) => {
        received.push(payload)
      })

      // Act
      const count = bus.publish('order.created', { id: 1 })

      // Assert
      expect(count).toBe(1)
      expect(received).toEqual([{ id: 1 }])
    })

    it('returns 0 when no subscribers match', () => {
      // Arrange
      // (no subscriptions)

      // Act
      const count = bus.publish('order.created', { id: 1 })

      // Assert
      expect(count).toBe(0)
    })
  })

  // --- Multiple subscribers ---

  describe('multiple subscribers', () => {
    it('calls all subscribers for the same subject in registration order', () => {
      // Arrange
      const order: string[] = []
      bus.subscribe('order.created', () => {
        order.push('first')
      })
      bus.subscribe('order.created', () => {
        order.push('second')
      })
      bus.subscribe('order.created', () => {
        order.push('third')
      })

      // Act
      const count = bus.publish('order.created', {})

      // Assert
      expect(count).toBe(3)
      expect(order).toEqual(['first', 'second', 'third'])
    })

    it('calls subscribers across different matching patterns', () => {
      // Arrange
      const received: string[] = []
      bus.subscribe('order.created', () => {
        received.push('exact')
      })
      bus.subscribe('order.*', () => {
        received.push('wildcard')
      })

      // Act
      const count = bus.publish('order.created', {})

      // Assert
      expect(count).toBe(2)
      expect(received).toContain('exact')
      expect(received).toContain('wildcard')
    })
  })

  // --- Unsubscribe ---

  describe('unsubscribe', () => {
    it('stops handler from being called after unsubscribe', () => {
      // Arrange
      let calls = 0
      const handler = (): void => {
        calls++
      }
      const sub = bus.subscribe('order.created', handler)

      // Act
      bus.unsubscribe(sub)
      bus.publish('order.created', {})

      // Assert
      expect(calls).toBe(0)
    })

    it('unsubscribe is a no-op for non-existent subscription', () => {
      // Arrange
      const handler = (): void => {}
      const sub = bus.subscribe('order.created', handler)
      bus.unsubscribe(sub)

      // Act & Assert - no throw
      expect(() => bus.unsubscribe(sub)).not.toThrow()
    })

    it('unsubscribeAll removes all handlers for a subject', () => {
      // Arrange
      let calls = 0
      bus.subscribe('order.created', () => {
        calls++
      })
      bus.subscribe('order.created', () => {
        calls++
      })

      // Act
      bus.unsubscribeAll('order.created')
      bus.publish('order.created', {})

      // Assert
      expect(calls).toBe(0)
    })
  })

  // --- Wildcard matching ---

  describe('wildcard matching', () => {
    it('order.* matches order.created and order.updated', () => {
      // Arrange
      const received: string[] = []
      bus.subscribe('order.*', (payload) => {
        received.push((payload as { type: string }).type)
      })

      // Act
      bus.publish('order.created', { type: 'created' })
      bus.publish('order.updated', { type: 'updated' })

      // Assert
      expect(received).toEqual(['created', 'updated'])
    })

    it('order.* does NOT match order_created (underscore)', () => {
      // Arrange
      let calls = 0
      bus.subscribe('order.*', () => {
        calls++
      })

      // Act
      bus.publish('order_created', {})

      // Assert
      expect(calls).toBe(0)
    })

    it('order.* does NOT match order.created.confirmed (multi-segment)', () => {
      // Arrange
      let calls = 0
      bus.subscribe('order.*', () => {
        calls++
      })

      // Act
      bus.publish('order.created.confirmed', {})

      // Assert
      expect(calls).toBe(0)
    })

    it('* matches everything', () => {
      // Arrange
      const received: string[] = []
      bus.subscribe('*', (payload) => {
        received.push((payload as { name: string }).name)
      })

      // Act
      bus.publish('order.created', { name: 'a' })
      bus.publish('user.signup', { name: 'b' })
      bus.publish('random', { name: 'c' })

      // Assert
      expect(received).toEqual(['a', 'b', 'c'])
    })

    it('exact subject does not match wildcard-like subjects', () => {
      // Arrange
      let calls = 0
      bus.subscribe('order.created', () => {
        calls++
      })

      // Act
      bus.publish('order.updated', {})

      // Assert
      expect(calls).toBe(0)
    })
  })

  // --- Handler error isolation ---

  describe('handler error isolation', () => {
    it('one handler throwing does not prevent others from being called', () => {
      // Arrange
      const logger = { error: vi.fn() }
      const busWithLogger = new EventBus({ partition: 'test', logger })
      const received: number[] = []
      busWithLogger.subscribe('evt', () => {
        received.push(1)
      })
      busWithLogger.subscribe('evt', () => {
        throw new Error('boom')
      })
      busWithLogger.subscribe('evt', () => {
        received.push(3)
      })

      // Act
      const count = busWithLogger.publish('evt', {})

      // Assert
      expect(count).toBe(3)
      expect(received).toEqual([1, 3])
      expect(logger.error).toHaveBeenCalledTimes(1)
    })

    it('publish does not throw when a handler throws', () => {
      // Arrange
      bus.subscribe('evt', () => {
        throw new Error('boom')
      })

      // Act & Assert
      expect(() => bus.publish('evt', {})).not.toThrow()
    })

    it('async handler rejection is caught and logged', async () => {
      // Arrange
      const logger = { error: vi.fn() }
      const busWithLogger = new EventBus({ partition: 'test', logger })
      let afterReject = false
      busWithLogger.subscribe('evt', async () => {
        throw new Error('async boom')
      })
      busWithLogger.subscribe('evt', () => {
        afterReject = true
      })

      // Act
      const count = busWithLogger.publish('evt', {})
      // Allow microtasks to flush
      await new Promise((resolve) => setImmediate(resolve))

      // Assert
      expect(count).toBe(2)
      expect(afterReject).toBe(true)
      expect(logger.error).toHaveBeenCalledTimes(1)
    })
  })

  // --- subscribeOnce ---

  describe('subscribeOnce', () => {
    it('handler is called only once then auto-unsubscribed', () => {
      // Arrange
      let calls = 0
      bus.subscribeOnce('order.created', () => {
        calls++
      })

      // Act
      bus.publish('order.created', {})
      bus.publish('order.created', {})

      // Assert
      expect(calls).toBe(1)
    })

    it('returns count 0 on second publish after once fired', () => {
      // Arrange
      bus.subscribeOnce('order.created', () => {})

      // Act
      const first = bus.publish('order.created', {})
      const second = bus.publish('order.created', {})

      // Assert
      expect(first).toBe(1)
      expect(second).toBe(0)
    })
  })

  // --- clear ---

  describe('clear', () => {
    it('removes all subscriptions', () => {
      // Arrange
      let calls = 0
      bus.subscribe('order.created', () => {
        calls++
      })
      bus.subscribe('order.*', () => {
        calls++
      })

      // Act
      bus.clear()
      bus.publish('order.created', {})

      // Assert
      expect(calls).toBe(0)
    })
  })

  // --- Zod schema validation ---

  describe('Zod schema validation', () => {
    it('valid payload passes validation and is dispatched', () => {
      // Arrange
      const schema = z.object({ orderId: z.string() })
      bus.registerSchema('order.created', schema)
      const received: unknown[] = []
      bus.subscribe('order.created', (payload) => {
        received.push(payload)
      })

      // Act
      bus.publish('order.created', { orderId: '123' })

      // Assert
      expect(received).toEqual([{ orderId: '123' }])
    })

    it('invalid payload throws EventBusValidationError', () => {
      // Arrange
      const schema = z.object({ orderId: z.string() })
      bus.registerSchema('order.created', schema)

      // Act & Assert
      expect(() => bus.publish('order.created', { foo: 'bar' })).toThrow(
        EventBusValidationError,
      )
    })

    it('validation error message includes subject', () => {
      // Arrange
      const schema = z.object({ orderId: z.string() })
      bus.registerSchema('order.created', schema)

      // Act & Assert
      try {
        bus.publish('order.created', { foo: 'bar' })
        expect.fail('should have thrown')
      } catch (err) {
        const msg = (err as Error).message
        expect(msg).toContain('order.created')
      }
    })

    it('publish without registered schema does not validate', () => {
      // Arrange
      const received: unknown[] = []
      bus.subscribe('order.created', (payload) => {
        received.push(payload)
      })

      // Act
      bus.publish('order.created', { anything: true })

      // Assert
      expect(received).toEqual([{ anything: true }])
    })

    it('validatePayload=false skips validation even with schema', () => {
      // Arrange
      const busNoValidate = new EventBus({
        partition: 'test',
        validatePayload: false,
      })
      const schema = z.object({ orderId: z.string() })
      busNoValidate.registerSchema('order.created', schema)
      const received: unknown[] = []
      busNoValidate.subscribe('order.created', (payload) => {
        received.push(payload)
      })

      // Act
      busNoValidate.publish('order.created', { foo: 'bar' })

      // Assert
      expect(received).toEqual([{ foo: 'bar' }])
      busNoValidate.clear()
    })
  })

  // --- Edge cases ---

  describe('edge cases', () => {
    it('publish to subject with no subscribers does not crash', () => {
      // Arrange
      // (no subscriptions)

      // Act & Assert
      expect(() => bus.publish('nope', {})).not.toThrow()
    })

    it('multiple wildcard subscribers all fire', () => {
      // Arrange
      let calls = 0
      bus.subscribe('order.*', () => {
        calls++
      })
      bus.subscribe('order.*', () => {
        calls++
      })
      bus.subscribe('*', () => {
        calls++
      })

      // Act
      bus.publish('order.created', {})

      // Assert
      expect(calls).toBe(3)
    })

    it('getPartition returns the partition name', () => {
      // Arrange
      const b = new EventBus({ partition: 'erp' })

      // Act & Assert
      expect(b.getPartition()).toBe('erp')
      b.clear()
    })
  })
})

// --- matchSubject unit tests ---

describe('matchSubject', () => {
  it('exact match returns true', () => {
    // Arrange & Act & Assert
    expect(matchSubject('order.created', 'order.created')).toBe(true)
  })

  it('exact mismatch returns false', () => {
    expect(matchSubject('order.created', 'order.updated')).toBe(false)
  })

  it('single wildcard matches any single segment', () => {
    expect(matchSubject('order.*', 'order.created')).toBe(true)
    expect(matchSubject('order.*', 'order.updated')).toBe(true)
  })

  it('single wildcard does NOT match multi-segment', () => {
    expect(matchSubject('order.*', 'order.created.confirmed')).toBe(false)
  })

  it('single wildcard does NOT match zero-segment (bare)', () => {
    expect(matchSubject('order.*', 'order')).toBe(false)
  })

  it('bare * matches everything', () => {
    expect(matchSubject('*', 'order.created')).toBe(true)
    expect(matchSubject('*', 'anything.at.all')).toBe(true)
    expect(matchSubject('*', 'single')).toBe(true)
  })

  it('wildcard in middle segment', () => {
    expect(matchSubject('user.*.updated', 'user.profile.updated')).toBe(true)
    expect(matchSubject('user.*.updated', 'user.settings.updated')).toBe(true)
    expect(matchSubject('user.*.updated', 'user.profile.created')).toBe(false)
  })

  it('different segment counts do not match', () => {
    expect(matchSubject('a.b', 'a')).toBe(false)
    expect(matchSubject('a', 'a.b')).toBe(false)
    expect(matchSubject('a.b.c', 'a.b')).toBe(false)
  })
})
