/**
 * @audebase/event-bus - Partition isolation tests (AAA pattern)
 *
 * Tests that two EventBus instances with different partitions
 * are completely isolated — events do NOT cross partition boundaries.
 *
 * SDD Ref: D1.9 — partition-local broadcasting
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { EventBus } from '../event-bus.js'

describe('EventBus — partition isolation', () => {
  let busA: EventBus
  let busB: EventBus

  beforeEach(() => {
    busA = new EventBus({ partition: 'SYSTEM' })
    busB = new EventBus({ partition: 'oa' })
  })

  // ─── Partition getter ───────────────────────────────────

  it('should return the correct partition name via getPartition()', () => {
    // Arrange
    const bus = new EventBus({ partition: 'erp' })

    // Act
    const partition = bus.getPartition()

    // Assert
    expect(partition).toBe('erp')
  })

  it('should return different partition names for different buses', () => {
    // Arrange & Act & Assert
    expect(busA.getPartition()).toBe('SYSTEM')
    expect(busB.getPartition()).toBe('oa')
  })

  // ─── Cross-partition isolation ──────────────────────────

  it('should not deliver events published on busA to busB subscribers', () => {
    // Arrange
    const handlerB = { fn: (() => {}) as unknown as (p: unknown) => void }
    const spyB = {} as { called: boolean }
    handlerB.fn = () => { spyB.called = true }

    busB.subscribe('order.created', handlerB.fn)

    // Act
    const delivered = busA.publish('order.created', { id: 1 })

    // Assert
    expect(delivered).toBe(0)
    expect(spyB.called).toBeUndefined()
  })

  it('should not deliver events published on busB to busA subscribers', () => {
    // Arrange
    let callCount = 0
    busA.subscribe('order.created', () => { callCount++ })

    // Act
    busB.publish('order.created', { id: 1 })

    // Assert
    expect(callCount).toBe(0)
  })

  it('should independently deliver events within each partition', () => {
    // Arrange
    let aCount = 0
    let bCount = 0
    busA.subscribe('user.created', () => { aCount++ })
    busB.subscribe('user.created', () => { bCount++ })

    // Act
    busA.publish('user.created', { name: 'a' })
    busB.publish('user.created', { name: 'b' })
    busA.publish('user.created', { name: 'a2' })

    // Assert
    expect(aCount).toBe(2)
    expect(bCount).toBe(1)
  })

  // ─── Schema isolation across partitions ─────────────────

  it('should not share schemas between partitions', () => {
    // Arrange
    const { z } = require('zod')
    const schemaA = z.object({ name: z.string() })
    busA.registerSchema('user.created', schemaA)

    // Act
    // busB has no schema, should not validate
    const resultB = busB.publish('user.created', { name: 123 })

    // Assert
    // busB should not validate (no schema registered)
    expect(resultB).toBe(0)
  })

  it('should validate independently per partition', () => {
    // Arrange
    const { z } = require('zod')
    const schemaA = z.object({ name: z.string() })
    busA.registerSchema('user.created', schemaA)

    let aCalled = false
    busA.subscribe('user.created', () => { aCalled = true })

    // Act & Assert
    // busA: valid payload should succeed
    expect(() => busA.publish('user.created', { name: 'test' })).not.toThrow()
    expect(aCalled).toBe(true)

    // busA: invalid payload should throw
    expect(() => busA.publish('user.created', { name: 123 })).toThrow()

    // busB: no schema, even invalid passes
    expect(() => busB.publish('user.created', { name: 123 })).not.toThrow()
  })

  // ─── Clear is partition-scoped ───────────────────────────

  it('should only clear subscriptions for its own partition', () => {
    // Arrange
    let aCount = 0
    let bCount = 0
    busA.subscribe('test.event', () => { aCount++ })
    busB.subscribe('test.event', () => { bCount++ })

    // Act
    busA.clear()
    busA.publish('test.event', {})
    busB.publish('test.event', {})

    // Assert
    expect(aCount).toBe(0)
    expect(bCount).toBe(1)
  })

  // ─── Wildcard isolation ─────────────────────────────────

  it('should not match wildcard across partitions', () => {
    // Arrange
    let bWildCount = 0
    busB.subscribe('order.*', () => { bWildCount++ })

    // Act
    busA.publish('order.created', {})
    busA.publish('order.updated', {})

    // Assert
    expect(bWildCount).toBe(0)
  })
})
